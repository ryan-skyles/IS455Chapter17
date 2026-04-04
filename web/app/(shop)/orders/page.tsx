import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const sp = await searchParams;

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("full_name")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (ce || !customer) redirect("/select-customer");

  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      "order_id, order_datetime, order_subtotal, shipping_fee, tax_amount, order_total",
    )
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false });

  if (error) {
    return <p className="text-red-600">{error.message}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Order History</h1>
        <p className="mt-1 text-slate-500">
          Customer: <strong>{customer.full_name}</strong>
        </p>
      </div>

      {sp.success && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Order placed successfully!
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Shipping</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400">
                  No orders yet.
                </TableCell>
              </TableRow>
            ) : (
              (rows ?? []).map((r) => (
                <TableRow key={r.order_id}>
                  <TableCell>
                    <Link
                      className="font-medium text-blue-700 underline"
                      href={`/orders/${r.order_id}`}
                    >
                      #{r.order_id}
                    </Link>
                  </TableCell>
                  <TableCell>{r.order_datetime}</TableCell>
                  <TableCell className="text-right">
                    ${Number(r.order_subtotal).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Number(r.shipping_fee).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${Number(r.tax_amount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${Number(r.order_total).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
