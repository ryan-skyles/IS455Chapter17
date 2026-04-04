import Link from "next/link";

type Props = { customerLabel: string | null };

export function Nav({ customerLabel }: Props) {
  return (
    <header className="bg-slate-900 px-4 py-3 text-sm text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="text-slate-300">
          {customerLabel ?? "No customer selected"}
        </span>
      </div>
    </header>
  );
}

export function SubNav() {
  return (
    <nav className="mb-4 flex flex-wrap gap-3 border-b border-slate-200 pb-3 text-sm">
      <Link className="text-slate-700 underline" href="/select-customer">
        Select Customer
      </Link>
      <Link className="text-slate-700 underline" href="/dashboard">
        Dashboard
      </Link>
      <Link className="text-slate-700 underline" href="/place-order">
        Place Order
      </Link>
      <Link className="text-slate-700 underline" href="/orders">
        Orders
      </Link>
      <Link className="text-slate-700 underline" href="/warehouse/priority">
        Warehouse Priority
      </Link>
      <form action="/api/scoring/run" method="post" className="inline">
        <button
          type="submit"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
        >
          Run Scoring
        </button>
      </form>
    </nav>
  );
}
