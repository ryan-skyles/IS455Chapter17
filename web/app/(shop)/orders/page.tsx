import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";

export default async function OrdersPage() {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

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
    <div>
      <h1 className="text-2xl font-semibold">Order History</h1>
      <p className="mt-1">
        Customer: <strong>{customer.full_name}</strong>
      </p>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left">
            <th className="p-2">Order</th>
            <th className="p-2">Date</th>
            <th className="p-2 text-right">Subtotal</th>
            <th className="p-2 text-right">Shipping</th>
            <th className="p-2 text-right">Tax</th>
            <th className="p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.order_id} className="border-b border-slate-100">
              <td className="p-2">
                <Link className="text-blue-700 underline" href={`/orders/${r.order_id}`}>
                  #{r.order_id}
                </Link>
              </td>
              <td className="p-2">{r.order_datetime}</td>
              <td className="p-2 text-right">
                ${Number(r.order_subtotal).toFixed(2)}
              </td>
              <td className="p-2 text-right">
                ${Number(r.shipping_fee).toFixed(2)}
              </td>
              <td className="p-2 text-right">
                ${Number(r.tax_amount).toFixed(2)}
              </td>
              <td className="p-2 text-right">
                ${Number(r.order_total).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
