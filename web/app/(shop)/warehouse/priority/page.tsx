import { tryCreateServiceClient } from "@/lib/supabase/server";

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

  if (list.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Fraud Priority Queue</h1>
        {sp.scored ? (
          <p className="mt-2 text-green-700">Scoring finished (no rows returned).</p>
        ) : null}
        <p className="mt-4 text-red-700">
          No predictions found. Click <strong>Run Scoring</strong> to generate fraud
          predictions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Fraud Priority Queue</h1>
      {sp.scored ? (
        <p className="mt-2 text-green-700">Scoring completed.</p>
      ) : null}
      <p className="mt-1 text-slate-600">
        Top 50 orders ranked by fraud probability (refreshed by Run Scoring).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left">
              <th className="p-2">Order</th>
              <th className="p-2">Order Date</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2">Customer ID</th>
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Fraud Prob</th>
              <th className="p-2">Prediction</th>
              <th className="p-2">Scored At</th>
            </tr>
          </thead>
          <tbody>
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
              return (
                <tr key={r.order_id} className="border-b border-slate-100">
                  <td className="p-2">{r.order_id}</td>
                  <td className="p-2">{order?.order_datetime ?? ""}</td>
                  <td className="p-2 text-right">
                    ${order ? Number(order.order_total).toFixed(2) : ""}
                  </td>
                  <td className="p-2">{order?.customer_id ?? ""}</td>
                  <td className="p-2">{cname}</td>
                  <td className="p-2 text-right">
                    {Number(r.fraud_probability).toFixed(4)}
                  </td>
                  <td className="p-2">
                    {predicted ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                        FRAUD
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs">
                    {r.prediction_timestamp
                      ? new Date(r.prediction_timestamp).toISOString()
                      : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
