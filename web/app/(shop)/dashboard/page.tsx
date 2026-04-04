import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DashboardPage() {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("customer_id, full_name, email")
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-slate-500">
          {customer.full_name} &mdash; {customer.email}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{orderCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${totalSpent.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent Orders</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-slate-400">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                (recent ?? []).map((o) => (
                  <TableRow key={o.order_id}>
                    <TableCell>
                      <Link
                        className="font-medium text-blue-700 underline"
                        href={`/orders/${o.order_id}`}
                      >
                        #{o.order_id}
                      </Link>
                    </TableCell>
                    <TableCell>{o.order_datetime}</TableCell>
                    <TableCell className="text-right">
                      ${Number(o.order_total).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
