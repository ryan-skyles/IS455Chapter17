import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";
import { createOrder } from "./actions";

export default async function PlaceOrderPage() {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("customer_id, full_name, state, zip_code")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (ce || !customer) redirect("/select-customer");

  const { data: products, error: pe } = await supabase
    .from("products")
    .select("product_id, sku, product_name, category, price")
    .eq("is_active", 1)
    .order("product_name", { ascending: true });

  if (pe) {
    return <p className="text-red-600">{pe.message}</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Place Order</h1>
      <p className="mt-1">
        Customer: <strong>{customer.full_name}</strong>
      </p>
      <form action={createOrder} className="mt-6 space-y-4">
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-left">
                <th className="p-2">SKU</th>
                <th className="p-2">Product</th>
                <th className="p-2">Category</th>
                <th className="p-2 text-right">Price</th>
                <th className="p-2 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((p) => (
                <tr key={p.product_id} className="border-b border-slate-100">
                  <td className="p-2">{p.sku}</td>
                  <td className="p-2">{p.product_name}</td>
                  <td className="p-2">{p.category}</td>
                  <td className="p-2 text-right">
                    ${Number(p.price).toFixed(2)}
                  </td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={0}
                      name={`q_${p.product_id}`}
                      defaultValue={0}
                      className="w-20 rounded border border-slate-300 px-2 py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="submit"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-slate-800"
        >
          Create Order
        </button>
      </form>
    </div>
  );
}
