import { tryCreateServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function WarehousePriorityPage({
  searchParams,
}: {
  searchParams: Promise<{ scored?: string }>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const sp = await searchParams;

  const { data: rows, error } = await supabase
    .from("order_predictions_fraud")
    .select(
      `
      order_id,
      fraud_probability,
      predicted_fraud,
      prediction_timestamp,
      orders (
        order_datetime,
        order_total,
        customer_id,
        customers ( full_name )
      )
    `,
    )
    .order("fraud_probability", { ascending: false })
    .limit(50);

  if (error) {
    return <p className="text-red-600">{error.message}</p>;
  }

  const list = rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fraud Priority Queue</h1>
        <p className="mt-1 text-slate-500">
          Top 50 orders ranked by fraud probability. Use the{" "}
          <strong>Run Scoring</strong> button in the nav to refresh predictions.
        </p>
      </div>

      {sp.scored && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Scoring completed — predictions have been refreshed.
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-slate-500">
          <p className="font-medium">No predictions yet.</p>
          <p className="mt-1 text-sm">
            Click <strong>Run Scoring</strong> in the navigation bar to generate fraud
            predictions.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Fraud Prob</TableHead>
                <TableHead>Prediction</TableHead>
                <TableHead>Scored At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => {
                const o = r.orders;
                const row = Array.isArray(o) ? o[0] : o;
                const order =
                  row && typeof row === "object" && "order_datetime" in row
                    ? (row as unknown as {
                        order_datetime: string;
                        order_total: number;
                        customer_id: number;
                        customers:
                          | { full_name: string }
                          | { full_name: string }[]
                          | null;
                      })
                    : null;
                const cust = order?.customers;
                const cname = Array.isArray(cust)
                  ? cust[0]?.full_name ?? ""
                  : cust && typeof cust === "object" && "full_name" in cust
                    ? cust.full_name
                    : "";
                const predicted = Number(r.predicted_fraud) !== 0;
                const prob = Number(r.fraud_probability);

                return (
                  <TableRow key={r.order_id}>
                    <TableCell className="font-medium">#{r.order_id}</TableCell>
                    <TableCell className="text-slate-500">
                      {order?.order_datetime ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {order ? `$${Number(order.order_total).toFixed(2)}` : ""}
                    </TableCell>
                    <TableCell>{cname}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {(prob * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      {predicted ? (
                        <Badge variant="destructive">FRAUD</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {r.prediction_timestamp
                        ? new Date(r.prediction_timestamp).toLocaleString()
                        : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
