using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var dbPath = Path.Combine(app.Environment.ContentRootPath, "shop.db");

app.MapGet("/", (HttpContext ctx) =>
{
    var customerId = GetCustomerIdFromCookie(ctx);
    return customerId.HasValue ? Results.Redirect("/dashboard") : Results.Redirect("/select-customer");
});

app.MapGet("/select-customer", () =>
{
    if (!File.Exists(dbPath))
    {
        return Html("Database Missing", "<p><code>shop.db</code> was not found in the project root.</p>");
    }

    using var connection = OpenConnection(dbPath);
    using var command = connection.CreateCommand();
    command.CommandText = """
    SELECT customer_id, full_name, email, city, state
    FROM customers
    WHERE is_active = 1
    ORDER BY full_name ASC;
    """;

    using var reader = command.ExecuteReader();
    var options = new StringBuilder();
    while (reader.Read())
    {
        var customerId = reader["customer_id"]?.ToString() ?? "";
        var fullName = reader["full_name"]?.ToString() ?? "";
        var email = reader["email"]?.ToString() ?? "";
        var city = reader["city"]?.ToString() ?? "";
        var state = reader["state"]?.ToString() ?? "";
        var label = $"{fullName} ({email}) - {city}, {state}";
        options.Append("<option value=\"")
            .Append(WebUtility.HtmlEncode(customerId))
            .Append("\">")
            .Append(WebUtility.HtmlEncode(label))
            .AppendLine("</option>");
    }

    var body = $$"""
    <h1>Select Customer</h1>
    <p>Choose an existing customer to act as for this session.</p>
    <form method="post" action="/select-customer">
      <label for="customer_id">Customer</label>
      <select id="customer_id" name="customer_id" required>
        <option value="">-- Select --</option>
        {{options}}
      </select>
      <div class="actions">
        <button type="submit">Continue</button>
      </div>
    </form>
    """;
    return Html("Select Customer", body);
});

app.MapPost("/select-customer", async (HttpContext ctx) =>
{
    if (!File.Exists(dbPath))
    {
        return Html("Database Missing", "<p><code>shop.db</code> was not found in the project root.</p>");
    }

    var form = await ctx.Request.ReadFormAsync();
    var rawCustomerId = form["customer_id"].ToString();
    if (!int.TryParse(rawCustomerId, out var customerId))
    {
        return Html("Select Customer", "<p class=\"error\">Please choose a valid customer.</p>");
    }

    using var connection = OpenConnection(dbPath);
    using var command = connection.CreateCommand();
    command.CommandText = "SELECT COUNT(1) FROM customers WHERE customer_id = $id;";
    command.Parameters.AddWithValue("$id", customerId);
    var exists = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) > 0;
    if (!exists)
    {
        return Html("Select Customer", "<p class=\"error\">Selected customer does not exist.</p>");
    }

    SetCustomerCookie(ctx, customerId);
    return Results.Redirect("/dashboard");
});

app.MapGet("/dashboard", (HttpContext ctx) =>
{
    var customerId = GetRequiredCustomerId(ctx);
    if (!customerId.HasValue)
    {
        return Results.Redirect("/select-customer");
    }

    using var connection = OpenConnection(dbPath);
    var customer = LoadCustomer(connection, customerId.Value);
    if (customer is null)
    {
        return Results.Redirect("/select-customer");
    }

    using var summaryCommand = connection.CreateCommand();
    summaryCommand.CommandText = """
    SELECT COUNT(1) AS order_count, COALESCE(SUM(order_total), 0) AS total_spent
    FROM orders
    WHERE customer_id = $id;
    """;
    summaryCommand.Parameters.AddWithValue("$id", customerId.Value);

    int orderCount;
    decimal totalSpent;
    using (var summaryReader = summaryCommand.ExecuteReader())
    {
        summaryReader.Read();
        orderCount = Convert.ToInt32(summaryReader["order_count"], CultureInfo.InvariantCulture);
        totalSpent = Convert.ToDecimal(summaryReader["total_spent"], CultureInfo.InvariantCulture);
    }

    using var recentCommand = connection.CreateCommand();
    recentCommand.CommandText = """
    SELECT order_id, order_datetime, order_total
    FROM orders
    WHERE customer_id = $id
    ORDER BY order_datetime DESC
    LIMIT 5;
    """;
    recentCommand.Parameters.AddWithValue("$id", customerId.Value);

    var recentRows = new StringBuilder();
    using (var reader = recentCommand.ExecuteReader())
    {
        while (reader.Read())
        {
            var orderId = Convert.ToInt32(reader["order_id"], CultureInfo.InvariantCulture);
            var dt = reader["order_datetime"]?.ToString() ?? "";
            var total = Convert.ToDecimal(reader["order_total"], CultureInfo.InvariantCulture);
            recentRows.Append("<tr><td><a href=\"/orders/")
                .Append(orderId.ToString(CultureInfo.InvariantCulture))
                .Append("\">#")
                .Append(orderId.ToString(CultureInfo.InvariantCulture))
                .Append("</a></td><td>")
                .Append(WebUtility.HtmlEncode(dt))
                .Append("</td><td class=\"num\">$")
                .Append(total.ToString("0.00", CultureInfo.InvariantCulture))
                .AppendLine("</td></tr>");
        }
    }

    var body = $$"""
    <h1>Dashboard</h1>
    <p><strong>Customer:</strong> {{WebUtility.HtmlEncode(customer.FullName)}} (ID {{customer.CustomerId}})</p>
    <div class="grid">
      <div class="card">
        <h3>Order Count</h3>
        <p>{{orderCount}}</p>
      </div>
      <div class="card">
        <h3>Total Spent</h3>
        <p>${{totalSpent.ToString("0.00", CultureInfo.InvariantCulture)}}</p>
      </div>
    </div>
    <h2>Recent Orders</h2>
    <table>
      <thead><tr><th>Order</th><th>Date</th><th class="num">Total</th></tr></thead>
      <tbody>{{recentRows}}</tbody>
    </table>
    """;
    return Html("Dashboard", body, customer);
});

app.MapGet("/place-order", (HttpContext ctx) =>
{
    var customerId = GetRequiredCustomerId(ctx);
    if (!customerId.HasValue)
    {
        return Results.Redirect("/select-customer");
    }

    using var connection = OpenConnection(dbPath);
    var customer = LoadCustomer(connection, customerId.Value);
    if (customer is null)
    {
        return Results.Redirect("/select-customer");
    }

    using var command = connection.CreateCommand();
    command.CommandText = """
    SELECT product_id, sku, product_name, category, price
    FROM products
    WHERE is_active = 1
    ORDER BY product_name ASC;
    """;

    var rows = new StringBuilder();
    using var reader = command.ExecuteReader();
    while (reader.Read())
    {
        var productId = Convert.ToInt32(reader["product_id"], CultureInfo.InvariantCulture);
        var sku = reader["sku"]?.ToString() ?? "";
        var name = reader["product_name"]?.ToString() ?? "";
        var category = reader["category"]?.ToString() ?? "";
        var price = Convert.ToDecimal(reader["price"], CultureInfo.InvariantCulture);
        rows.Append("<tr><td>")
            .Append(WebUtility.HtmlEncode(sku))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(name))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(category))
            .Append("</td><td class=\"num\">$")
            .Append(price.ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td><input type=\"number\" min=\"0\" name=\"q_")
            .Append(productId.ToString(CultureInfo.InvariantCulture))
            .Append("\" value=\"0\" /></td></tr>");
    }

    var body = $$"""
    <h1>Place Order</h1>
    <p>Customer: <strong>{{WebUtility.HtmlEncode(customer.FullName)}}</strong></p>
    <form method="post" action="/place-order">
      <div class="actions">
        <button type="submit">Create Order</button>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th class="num">Price</th><th>Quantity</th></tr></thead>
        <tbody>{{rows}}</tbody>
      </table>
    </form>
    """;
    return Html("Place Order", body, customer);
});

app.MapPost("/place-order", async (HttpContext ctx) =>
{
    var customerId = GetCustomerIdFromCookie(ctx);
    if (!customerId.HasValue)
    {
        return Results.Redirect("/select-customer");
    }

    using var connection = OpenConnection(dbPath);
    var customer = LoadCustomer(connection, customerId.Value);
    if (customer is null)
    {
        return Results.Redirect("/select-customer");
    }

    var form = await ctx.Request.ReadFormAsync();
    var requested = new List<(int ProductId, int Quantity)>();
    foreach (var key in form.Keys)
    {
        if (!key.StartsWith("q_", StringComparison.Ordinal))
        {
            continue;
        }

        var raw = form[key].ToString();
        if (!int.TryParse(key.AsSpan(2), out var productId))
        {
            continue;
        }
        if (!int.TryParse(raw, out var quantity) || quantity <= 0)
        {
            continue;
        }

        requested.Add((productId, quantity));
    }

    if (requested.Count == 0)
    {
        return Html("Place Order", "<p class=\"error\">Select at least one product quantity greater than zero.</p>", customer);
    }

    var priceLookup = new Dictionary<int, decimal>();
    foreach (var item in requested)
    {
        using var priceCommand = connection.CreateCommand();
        priceCommand.CommandText = "SELECT price FROM products WHERE product_id = $pid AND is_active = 1;";
        priceCommand.Parameters.AddWithValue("$pid", item.ProductId);
        var scalar = priceCommand.ExecuteScalar();
        if (scalar is null || scalar is DBNull)
        {
            return Html("Place Order", "<p class=\"error\">One or more selected products are invalid.</p>", customer);
        }
        priceLookup[item.ProductId] = Convert.ToDecimal(scalar, CultureInfo.InvariantCulture);
    }

    var subtotal = requested.Sum(x => priceLookup[x.ProductId] * x.Quantity);
    const decimal shippingFee = 7.99m;
    var taxAmount = Math.Round(subtotal * 0.08m, 2, MidpointRounding.AwayFromZero);
    var total = subtotal + shippingFee + taxAmount;

    using var transaction = connection.BeginTransaction();
    try
    {
        using (var orderCommand = connection.CreateCommand())
        {
            orderCommand.Transaction = transaction;
            orderCommand.CommandText = """
            INSERT INTO orders (
              customer_id, order_datetime, billing_zip, shipping_zip, shipping_state,
              payment_method, device_type, ip_country, promo_used, promo_code,
              order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud
            )
            VALUES (
              $customer_id, $order_datetime, $billing_zip, $shipping_zip, $shipping_state,
              $payment_method, $device_type, $ip_country, 0, NULL,
              $order_subtotal, $shipping_fee, $tax_amount, $order_total, 0.0, 0
            );
            """;
            orderCommand.Parameters.AddWithValue("$customer_id", customerId.Value);
            orderCommand.Parameters.AddWithValue("$order_datetime", DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture));
            orderCommand.Parameters.AddWithValue("$billing_zip", customer.ZipCode ?? "00000");
            orderCommand.Parameters.AddWithValue("$shipping_zip", customer.ZipCode ?? "00000");
            orderCommand.Parameters.AddWithValue("$shipping_state", customer.State ?? "NA");
            orderCommand.Parameters.AddWithValue("$payment_method", "card");
            orderCommand.Parameters.AddWithValue("$device_type", "web");
            orderCommand.Parameters.AddWithValue("$ip_country", "US");
            orderCommand.Parameters.AddWithValue("$order_subtotal", subtotal);
            orderCommand.Parameters.AddWithValue("$shipping_fee", shippingFee);
            orderCommand.Parameters.AddWithValue("$tax_amount", taxAmount);
            orderCommand.Parameters.AddWithValue("$order_total", total);
            orderCommand.ExecuteNonQuery();
        }

        long orderId;
        using (var idCommand = connection.CreateCommand())
        {
            idCommand.Transaction = transaction;
            idCommand.CommandText = "SELECT last_insert_rowid();";
            orderId = Convert.ToInt64(idCommand.ExecuteScalar(), CultureInfo.InvariantCulture);
        }

        foreach (var item in requested)
        {
            var unitPrice = priceLookup[item.ProductId];
            var lineTotal = unitPrice * item.Quantity;
            using var itemCommand = connection.CreateCommand();
            itemCommand.Transaction = transaction;
            itemCommand.CommandText = """
            INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
            VALUES ($order_id, $product_id, $quantity, $unit_price, $line_total);
            """;
            itemCommand.Parameters.AddWithValue("$order_id", orderId);
            itemCommand.Parameters.AddWithValue("$product_id", item.ProductId);
            itemCommand.Parameters.AddWithValue("$quantity", item.Quantity);
            itemCommand.Parameters.AddWithValue("$unit_price", unitPrice);
            itemCommand.Parameters.AddWithValue("$line_total", lineTotal);
            itemCommand.ExecuteNonQuery();
        }

        transaction.Commit();
        return Results.Redirect($"/orders/{orderId}");
    }
    catch (Exception ex)
    {
        transaction.Rollback();
        return Html("Place Order", $"<p class=\"error\">Could not create order: {WebUtility.HtmlEncode(ex.Message)}</p>", customer);
    }
});

app.MapGet("/orders", (HttpContext ctx) =>
{
    var customerId = GetRequiredCustomerId(ctx);
    if (!customerId.HasValue)
    {
        return Results.Redirect("/select-customer");
    }

    using var connection = OpenConnection(dbPath);
    var customer = LoadCustomer(connection, customerId.Value);
    if (customer is null)
    {
        return Results.Redirect("/select-customer");
    }

    using var command = connection.CreateCommand();
    command.CommandText = """
    SELECT order_id, order_datetime, order_subtotal, shipping_fee, tax_amount, order_total
    FROM orders
    WHERE customer_id = $id
    ORDER BY order_datetime DESC;
    """;
    command.Parameters.AddWithValue("$id", customerId.Value);

    var rows = new StringBuilder();
    using var reader = command.ExecuteReader();
    while (reader.Read())
    {
        var orderId = Convert.ToInt32(reader["order_id"], CultureInfo.InvariantCulture);
        rows.Append("<tr><td><a href=\"/orders/")
            .Append(orderId.ToString(CultureInfo.InvariantCulture))
            .Append("\">#")
            .Append(orderId.ToString(CultureInfo.InvariantCulture))
            .Append("</a></td><td>")
            .Append(WebUtility.HtmlEncode(reader["order_datetime"]?.ToString() ?? ""))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(reader["order_subtotal"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(reader["shipping_fee"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(reader["tax_amount"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(reader["order_total"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .AppendLine("</td></tr>");
    }

    var body = $$"""
    <h1>Order History</h1>
    <p>Customer: <strong>{{WebUtility.HtmlEncode(customer.FullName)}}</strong></p>
    <table>
      <thead><tr><th>Order</th><th>Date</th><th class="num">Subtotal</th><th class="num">Shipping</th><th class="num">Tax</th><th class="num">Total</th></tr></thead>
      <tbody>{{rows}}</tbody>
    </table>
    """;
    return Html("Order History", body, customer);
});

app.MapGet("/orders/{orderId:int}", (HttpContext ctx, int orderId) =>
{
    var customerId = GetRequiredCustomerId(ctx);
    if (!customerId.HasValue)
    {
        return Results.Redirect("/select-customer");
    }

    using var connection = OpenConnection(dbPath);
    var customer = LoadCustomer(connection, customerId.Value);
    if (customer is null)
    {
        return Results.Redirect("/select-customer");
    }

    using var orderCommand = connection.CreateCommand();
    orderCommand.CommandText = """
    SELECT order_id, customer_id, order_datetime, order_subtotal, shipping_fee, tax_amount, order_total
    FROM orders
    WHERE order_id = $order_id;
    """;
    orderCommand.Parameters.AddWithValue("$order_id", orderId);
    using var orderReader = orderCommand.ExecuteReader();
    if (!orderReader.Read())
    {
        return Html("Order Detail", "<p class=\"error\">Order not found.</p>", customer);
    }

    var ownerId = Convert.ToInt32(orderReader["customer_id"], CultureInfo.InvariantCulture);
    if (ownerId != customerId.Value)
    {
        return Html("Order Detail", "<p class=\"error\">You can only view your selected customer's orders.</p>", customer);
    }

    var header = $$"""
    <h1>Order #{{orderId}}</h1>
    <p>Date: {{WebUtility.HtmlEncode(orderReader["order_datetime"]?.ToString() ?? "")}}</p>
    <p>
      Subtotal: <strong>${{Convert.ToDecimal(orderReader["order_subtotal"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture)}}</strong>,
      Shipping: <strong>${{Convert.ToDecimal(orderReader["shipping_fee"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture)}}</strong>,
      Tax: <strong>${{Convert.ToDecimal(orderReader["tax_amount"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture)}}</strong>,
      Total: <strong>${{Convert.ToDecimal(orderReader["order_total"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture)}}</strong>
    </p>
    """;

    using var itemsCommand = connection.CreateCommand();
    itemsCommand.CommandText = """
    SELECT oi.product_id, p.product_name, oi.quantity, oi.unit_price, oi.line_total
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id = $order_id
    ORDER BY oi.order_item_id ASC;
    """;
    itemsCommand.Parameters.AddWithValue("$order_id", orderId);
    using var itemsReader = itemsCommand.ExecuteReader();

    var itemRows = new StringBuilder();
    while (itemsReader.Read())
    {
        itemRows.Append("<tr><td>")
            .Append(Convert.ToInt32(itemsReader["product_id"], CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(itemsReader["product_name"]?.ToString() ?? ""))
            .Append("</td><td class=\"num\">")
            .Append(Convert.ToInt32(itemsReader["quantity"], CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(itemsReader["unit_price"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(itemsReader["line_total"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .AppendLine("</td></tr>");
    }

    var body = header + $$"""
    <h2>Line Items</h2>
    <table>
      <thead><tr><th>Product ID</th><th>Name</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
      <tbody>{{itemRows}}</tbody>
    </table>
    """;

    return Html("Order Detail", body, customer);
});

app.MapGet("/warehouse/priority", () =>
{
    using var connection = OpenConnection(dbPath);

    using var checkCmd = connection.CreateCommand();
    checkCmd.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='order_predictions_fraud';";
    var tableExists = Convert.ToInt32(checkCmd.ExecuteScalar(), CultureInfo.InvariantCulture) > 0;

    if (!tableExists)
    {
        return Html("Fraud Priority Queue", """
        <h1>Fraud Priority Queue</h1>
        <p class="error">No predictions found. Click <strong>Run Scoring</strong> to generate fraud predictions.</p>
        """);
    }

    using var command = connection.CreateCommand();
    command.CommandText = """
    SELECT
      op.order_id,
      o.order_datetime,
      o.order_total,
      c.customer_id,
      c.full_name AS customer_name,
      op.fraud_probability,
      op.predicted_fraud,
      op.prediction_timestamp
    FROM order_predictions_fraud op
    JOIN orders o ON o.order_id = op.order_id
    JOIN customers c ON c.customer_id = o.customer_id
    ORDER BY op.fraud_probability DESC
    LIMIT 50;
    """;

    using var reader = command.ExecuteReader();
    var rows = new StringBuilder();
    while (reader.Read())
    {
        var prob = Convert.ToDouble(reader["fraud_probability"], CultureInfo.InvariantCulture);
        var predicted = Convert.ToInt32(reader["predicted_fraud"], CultureInfo.InvariantCulture) != 0;
        rows.Append("<tr><td>")
            .Append(WebUtility.HtmlEncode(reader["order_id"]?.ToString() ?? ""))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(reader["order_datetime"]?.ToString() ?? ""))
            .Append("</td><td class=\"num\">$")
            .Append(Convert.ToDecimal(reader["order_total"], CultureInfo.InvariantCulture).ToString("0.00", CultureInfo.InvariantCulture))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(reader["customer_id"]?.ToString() ?? ""))
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(reader["customer_name"]?.ToString() ?? ""))
            .Append("</td><td class=\"num\">")
            .Append(prob.ToString("0.0000", CultureInfo.InvariantCulture))
            .Append("</td><td>")
            .Append(predicted ? "<span class=\"badge warn\">FRAUD</span>" : "<span class=\"badge ok\">OK</span>")
            .Append("</td><td>")
            .Append(WebUtility.HtmlEncode(reader["prediction_timestamp"]?.ToString() ?? ""))
            .AppendLine("</td></tr>");
    }

    var body = $$"""
    <h1>Fraud Priority Queue</h1>
    <p>Top 50 orders ranked by fraud probability (ML-scored).</p>
    <table>
      <thead><tr><th>Order</th><th>Order Date</th><th class="num">Total</th><th>Customer ID</th><th>Customer</th><th class="num">Fraud Prob</th><th>Prediction</th><th>Scored At</th></tr></thead>
      <tbody>{{rows}}</tbody>
    </table>
    """;
    return Html("Fraud Priority Queue", body);
});

app.MapPost("/scoring/run", async () =>
{
    var scriptPath = Path.Combine(app.Environment.ContentRootPath, "jobs", "run_inference.py");
    if (!File.Exists(scriptPath))
    {
        return Html("Scoring Run", $"<p class=\"error\">Script not found: <code>{WebUtility.HtmlEncode(scriptPath)}</code></p>");
    }

    var psi = new ProcessStartInfo
    {
        FileName = "python3",
        Arguments = $"\"{scriptPath}\"",
        WorkingDirectory = app.Environment.ContentRootPath,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true
    };

    using var process = Process.Start(psi);
    if (process is null)
    {
        return Html("Scoring Run", "<p class=\"error\">Failed to start python process.</p>");
    }

    var stdOut = await process.StandardOutput.ReadToEndAsync();
    var stdErr = await process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();

    var body = $$"""
    <h1>Scoring Run Status</h1>
    <p>Exit code: <strong>{{process.ExitCode}}</strong></p>
    <h2>stdout</h2>
    <pre>{{WebUtility.HtmlEncode(Truncate(stdOut, 4000))}}</pre>
    <h2>stderr</h2>
    <pre>{{WebUtility.HtmlEncode(Truncate(stdErr, 4000))}}</pre>
    """;
    return Html("Scoring Run", body);
});

app.Run();

SqliteConnection OpenConnection(string databasePath)
{
    if (!File.Exists(databasePath))
    {
        throw new FileNotFoundException("Database file not found.", databasePath);
    }

    var connection = new SqliteConnection($"Data Source={databasePath}");
    connection.Open();
    return connection;
}

int? GetCustomerIdFromCookie(HttpContext ctx)
{
    if (!ctx.Request.Cookies.TryGetValue("customer_id", out var raw))
    {
        return null;
    }

    return int.TryParse(raw, out var value) ? value : null;
}

int? GetRequiredCustomerId(HttpContext ctx) => GetCustomerIdFromCookie(ctx);

void SetCustomerCookie(HttpContext ctx, int customerId)
{
    ctx.Response.Cookies.Append("customer_id", customerId.ToString(CultureInfo.InvariantCulture), new CookieOptions
    {
        HttpOnly = true,
        IsEssential = true,
        SameSite = SameSiteMode.Lax,
        Expires = DateTimeOffset.UtcNow.AddDays(7)
    });
}

Customer? LoadCustomer(SqliteConnection connection, int customerId)
{
    using var command = connection.CreateCommand();
    command.CommandText = """
    SELECT customer_id, full_name, email, state, zip_code
    FROM customers
    WHERE customer_id = $id;
    """;
    command.Parameters.AddWithValue("$id", customerId);
    using var reader = command.ExecuteReader();
    if (!reader.Read())
    {
        return null;
    }

    return new Customer(
        CustomerId: Convert.ToInt32(reader["customer_id"], CultureInfo.InvariantCulture),
        FullName: reader["full_name"]?.ToString() ?? "",
        Email: reader["email"]?.ToString() ?? "",
        State: reader["state"]?.ToString(),
        ZipCode: reader["zip_code"]?.ToString()
    );
}

IResult Html(string title, string bodyHtml, Customer? customer = null)
{
    var customerMeta = customer is null
        ? "<span class=\"muted\">No customer selected</span>"
        : $"<span>Acting as: <strong>{WebUtility.HtmlEncode(customer.FullName)}</strong> (#{customer.CustomerId})</span>";

    var html = $$"""
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{{WebUtility.HtmlEncode(title)}}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f6f7fb; color: #1f2937; }
        .top { background: #111827; color: #fff; padding: 0.9rem 1rem; }
        .container { max-width: 1100px; margin: 1rem auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 1rem; }
        nav a { color: #111827; margin-right: 0.8rem; text-decoration: none; }
        nav { margin-bottom: 0.9rem; }
        .muted { color: #9ca3af; }
        .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 1rem; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; background: #fafafa; }
        table { width: 100%; border-collapse: collapse; font-size: 0.94rem; }
        th, td { border-bottom: 1px solid #eceff4; padding: 0.55rem; text-align: left; vertical-align: top; }
        th { background: #f3f4f6; }
        .num { text-align: right; white-space: nowrap; }
        select, input[type=\"number\"] { padding: 0.35rem; }
        .actions { margin-top: 0.8rem; }
        button { padding: 0.45rem 0.8rem; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; }
        .error { color: #b91c1c; }
        .badge { display: inline-block; padding: 0.2rem 0.45rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
        .warn { background: #fee2e2; color: #991b1b; }
        .ok { background: #dcfce7; color: #166534; }
        pre { background: #f8fafc; border: 1px solid #e5e7eb; padding: 0.65rem; overflow-x: auto; border-radius: 6px; }
      </style>
    </head>
    <body>
      <div class="top">{{customerMeta}}</div>
      <div class="container">
        <nav>
          <a href="/select-customer">Select Customer</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/place-order">Place Order</a>
          <a href="/orders">Orders</a>
          <a href="/warehouse/priority">Warehouse Priority</a>
          <form method="post" action="/scoring/run" style="display:inline;">
            <button type="submit">Run Scoring</button>
          </form>
        </nav>
        {{bodyHtml}}
      </div>
    </body>
    </html>
    """;

    return Results.Content(html, "text/html; charset=utf-8");
}

static string Truncate(string value, int maxChars)
{
    if (string.IsNullOrEmpty(value) || value.Length <= maxChars)
    {
        return value;
    }

    return value[..maxChars] + "\n...truncated...";
}

internal sealed record Customer(int CustomerId, string FullName, string Email, string? State, string? ZipCode);
