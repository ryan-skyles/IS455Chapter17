import { Nav, SubNav } from "@/components/Nav";
import { getCustomerIdCookie } from "@/lib/cookies";
import { tryCreateServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-red-700">Configuration</h1>
        <p className="mt-2 text-slate-700">
          Add <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1">
            SUPABASE_SERVICE_ROLE_KEY
          </code>{" "}
          to <code className="rounded bg-slate-100 px-1">web/.env.local</code>{" "}
          (see <code className="rounded bg-slate-100 px-1">web/.env.local.example</code>
          ).
        </p>
        {children}
      </div>
    );
  }

  let customerLabel: string | null = null;
  const id = await getCustomerIdCookie();
  if (id) {
    const { data } = await supabase
      .from("customers")
      .select("full_name, customer_id")
      .eq("customer_id", id)
      .maybeSingle();
    if (data) {
      customerLabel = `Acting as: ${data.full_name} (#${data.customer_id})`;
    }
  }

  return (
    <>
      <Nav customerLabel={customerLabel} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <SubNav />
        {children}
      </div>
    </>
  );
}
