import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("customer_id, full_name")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (ce || !customer) redirect("/select-customer");

  const { data: summary } = await supabase
    .from("orders")
    .select("order_total")
    .eq("customer_id", customerId);

  const orderCount = summary?.length ?? 0;
  const totalSpent =
    summary?.reduce((s, r) => s + Number(r.order_total), 0) ?? 0;

  const { data: recent } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total")
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false })
    .limit(5);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2">
        <strong>Customer:</strong> {customer.full_name} (ID {customer.customer_id})
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-600">Order Count</h3>
          <p className="text-2xl font-semibold">{orderCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-600">Total Spent</h3>
          <p className="text-2xl font-semibold">
            ${totalSpent.toFixed(2)}
          </p>
        </div>
      </div>
      <h2 className="mt-8 text-lg font-semibold">Recent Orders</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-100 text-left">
            <th className="p-2">Order</th>
            <th className="p-2">Date</th>
            <th className="p-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(recent ?? []).map((o) => (
            <tr key={o.order_id} className="border-b border-slate-100">
              <td className="p-2">
                <Link className="text-blue-700 underline" href={`/orders/${o.order_id}`}>
                  #{o.order_id}
                </Link>
              </td>
              <td className="p-2">{o.order_datetime}</td>
              <td className="p-2 text-right">
                ${Number(o.order_total).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
