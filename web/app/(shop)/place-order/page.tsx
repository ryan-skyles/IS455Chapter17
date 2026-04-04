import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createOrder } from "./actions";

export default async function PlaceOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const sp = await searchParams;

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

  const errorMessages: Record<string, string> = {
    empty: "Please enter a quantity of at least 1 for one product.",
    product: "One or more selected products are unavailable.",
    insert: "Could not create the order. Please try again.",
    items: "Order created but line items failed. Please contact support.",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Place Order</h1>
        <p className="mt-1 text-slate-500">
          Customer: <strong>{customer.full_name}</strong>
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessages[sp.error] ?? "An error occurred."}
        </div>
      )}

      <form action={createOrder} className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-28 text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products ?? []).map((p) => (
                <TableRow key={p.product_id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>{p.product_name}</TableCell>
                  <TableCell className="text-slate-500">{p.category}</TableCell>
                  <TableCell className="text-right">
                    ${Number(p.price).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      name={`q_${p.product_id}`}
                      defaultValue={0}
                      className="w-20 text-right"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button type="submit">Create Order</Button>
      </form>
    </div>
  );
}
