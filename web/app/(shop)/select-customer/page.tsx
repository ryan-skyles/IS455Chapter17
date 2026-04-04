import { tryCreateServiceClient } from "@/lib/supabase/server";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { selectCustomer } from "./actions";

export default async function SelectCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return null;

  const sp = await searchParams;

  const { data: customers, error } = await supabase
    .from("customers")
    .select("customer_id, full_name, email, city, state")
    .eq("is_active", 1)
    .order("full_name", { ascending: true });

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Select Customer</h1>
        <p className="mt-2 text-red-600">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Select Customer</CardTitle>
          <CardDescription>
            Choose an existing customer to act as for this session. No login required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sp.error && (
            <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {sp.error === "invalid"
                ? "Please select a valid customer."
                : "Customer not found."}
            </p>
          )}
          <form action={selectCustomer} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="customer_id">Customer</Label>
              <Select name="customer_id" required>
                <SelectTrigger id="customer_id" className="w-full">
                  <SelectValue placeholder="— Select a customer —" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((c) => (
                    <SelectItem key={c.customer_id} value={String(c.customer_id)}>
                      {c.full_name} ({c.email}) — {c.city}, {c.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
