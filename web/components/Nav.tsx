import Link from "next/link";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

type Props = { customerLabel: string | null };

export function Nav({ customerLabel }: Props) {
  return (
    <header className="border-b bg-slate-900 px-4 py-3 text-sm text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="font-medium text-slate-100">IS455 Shop</span>
        <span className="ml-auto text-slate-400">
          {customerLabel ?? "No customer selected"}
        </span>
      </div>
    </header>
  );
}

export function SubNav() {
  const ghost = cn(buttonVariants({ variant: "ghost", size: "sm" }));
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
      <Link href="/select-customer" className={ghost}>
        Select Customer
      </Link>
      <Link href="/dashboard" className={ghost}>
        Dashboard
      </Link>
      <Link href="/place-order" className={ghost}>
        Place Order
      </Link>
      <Link href="/orders" className={ghost}>
        Orders
      </Link>
      <Link href="/warehouse/priority" className={ghost}>
        Warehouse Priority
      </Link>
      <form action="/api/scoring/run" method="post" className="ml-auto">
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          Run Scoring
        </button>
      </form>
    </nav>
  );
}
