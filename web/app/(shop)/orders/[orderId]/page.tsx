import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

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
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Order Detail</h1>
        <p className="text-red-600">Order not found.</p>
      </div>
    );
  }

  if (order.customer_id !== customerId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Order Detail</h1>
        <p className="text-red-600">
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          ← Back to orders
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">Order #{orderId}</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Date", value: order.order_datetime },
          { label: "Subtotal", value: `$${Number(order.order_subtotal).toFixed(2)}` },
          { label: "Shipping", value: `$${Number(order.shipping_fee).toFixed(2)}` },
          { label: "Tax", value: `$${Number(order.tax_amount).toFixed(2)}` },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-slate-500">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-semibold">{s.value}</CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Line Items</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((row) => {
                const pname =
                  row.products &&
                  typeof row.products === "object" &&
                  "product_name" in row.products
                    ? (row.products as { product_name: string }).product_name
                    : "";
                return (
                  <TableRow key={row.order_item_id}>
                    <TableCell className="text-slate-500">{row.product_id}</TableCell>
                    <TableCell>{pname}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-right">
                      ${Number(row.unit_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${Number(row.line_total).toFixed(2)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-right text-sm font-semibold">
          Order Total:{" "}
          <span className="text-base">${Number(order.order_total).toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
}
