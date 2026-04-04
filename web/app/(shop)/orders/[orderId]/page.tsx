import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ orderId: string }> };

export default async function OrderDetailPage({ params }: Props) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const { orderId: raw } = await params;
  const orderId = Number.parseInt(raw, 10);
  if (!Number.isFinite(orderId)) notFound();

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("full_name")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (ce || !customer) redirect("/select-customer");

  const { data: order, error: oe } = await supabase
    .from("orders")
    .select(
      "order_id, customer_id, order_datetime, order_subtotal, shipping_fee, tax_amount, order_total",
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (oe || !order) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Order Detail</h1>
        <p className="mt-2 text-red-600">Order not found.</p>
      </div>
    );
  }

  if (order.customer_id !== customerId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Order Detail</h1>
        <p className="mt-2 text-red-600">
          You can only view your selected customer&apos;s orders.
        </p>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("order_items")
    .select(
      `
      order_item_id,
      product_id,
      quantity,
      unit_price,
      line_total,
      products ( product_name )
    `,
    )
    .eq("order_id", orderId)
    .order("order_item_id", { ascending: true });

  return (
    <div>
      <p className="mb-4">
        <Link className="text-blue-700 underline" href="/orders">
          ← Back to orders
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Order #{orderId}</h1>
      <p className="mt-2">Date: {order.order_datetime}</p>
      <p className="mt-2 text-sm text-slate-700">
        Subtotal:{" "}
        <strong>${Number(order.order_subtotal).toFixed(2)}</strong>, Shipping:{" "}
        <strong>${Number(order.shipping_fee).toFixed(2)}</strong>, Tax:{" "}
        <strong>${Number(order.tax_amount).toFixed(2)}</strong>, Total:{" "}
        <strong>${Number(order.order_total).toFixed(2)}</strong>
      </p>
      <h2 className="mt-8 text-lg font-semibold">Line Items</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left">
            <th className="p-2">Product ID</th>
            <th className="p-2">Name</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Unit Price</th>
            <th className="p-2 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((row) => {
            const pname =
              row.products &&
              typeof row.products === "object" &&
              "product_name" in row.products
                ? (row.products as { product_name: string }).product_name
                : "";
            return (
              <tr key={row.order_item_id} className="border-b border-slate-100">
                <td className="p-2">{row.product_id}</td>
                <td className="p-2">{pname}</td>
                <td className="p-2 text-right">{row.quantity}</td>
                <td className="p-2 text-right">
                  ${Number(row.unit_price).toFixed(2)}
                </td>
                <td className="p-2 text-right">
                  ${Number(row.line_total).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
