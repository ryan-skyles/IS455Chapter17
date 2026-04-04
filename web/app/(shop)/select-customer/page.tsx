import { tryCreateServiceClient } from "@/lib/supabase/server";
import { selectCustomer } from "./actions";

export default async function SelectCustomerPage() {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return null;
  }

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
    <div>
      <h1 className="text-2xl font-semibold">Select Customer</h1>
      <p className="mt-1 text-slate-600">
        Choose an existing customer to act as for this session.
      </p>
      <form action={selectCustomer} className="mt-6 max-w-lg space-y-4">
        <div>
          <label htmlFor="customer_id" className="block text-sm font-medium">
            Customer
          </label>
          <select
            id="customer_id"
            name="customer_id"
            required
            className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
          >
            <option value="">-- Select --</option>
            {(customers ?? []).map((c) => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.full_name} ({c.email}) — {c.city}, {c.state}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-slate-800"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
