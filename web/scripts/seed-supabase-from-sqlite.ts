/**
 * One-time: copy shop.db (SQLite) into Supabase Postgres.
 * Requires: migration 001_init.sql applied, shop.db at repo root, env vars set.
 *
 *   cd web && npm run seed:supabase
 */
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const shopPath = path.join(repoRoot, "shop.db");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function upsertBatches<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  onConflict: string,
  chunk = 400,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new Error(`${table} batch ${i}: ${error.message}`);
    }
    process.stdout.write(`  ${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write(`\n  ${table}: done (${rows.length} rows)\n`);
}

async function main() {
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }

  const sqlite = new Database(shopPath, { fileMustExist: true, readonly: true });
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Reading SQLite:", shopPath);

  const customers = sqlite.prepare("SELECT * FROM customers").all() as Record<
    string,
    unknown
  >[];
  const products = sqlite.prepare("SELECT * FROM products").all() as Record<
    string,
    unknown
  >[];
  const orders = sqlite.prepare("SELECT * FROM orders").all() as Record<
    string,
    unknown
  >[];
  const orderItems = sqlite.prepare("SELECT * FROM order_items").all() as Record<
    string,
    unknown
  >[];
  const shipments = sqlite.prepare("SELECT * FROM shipments").all() as Record<
    string,
    unknown
  >[];
  const reviews = sqlite.prepare("SELECT * FROM product_reviews").all() as Record<
    string,
    unknown
  >[];

  let predictions: Record<string, unknown>[] = [];
  try {
    predictions = sqlite
      .prepare("SELECT * FROM order_predictions_fraud")
      .all() as Record<string, unknown>[];
  } catch {
    /* table may not exist */
  }

  console.log("Upserting into Supabase…");
  await upsertBatches(supabase, "customers", customers, "customer_id");
  await upsertBatches(supabase, "products", products, "product_id");
  await upsertBatches(supabase, "orders", orders, "order_id");
  await upsertBatches(supabase, "order_items", orderItems, "order_item_id");
  await upsertBatches(supabase, "shipments", shipments, "shipment_id");
  await upsertBatches(supabase, "product_reviews", reviews, "review_id");
  if (predictions.length > 0) {
    await upsertBatches(supabase, "order_predictions_fraud", predictions, "order_id");
  }

  const { error: seqErr } = await supabase.rpc("reset_shop_sequences");
  if (seqErr) {
    throw new Error(`reset_shop_sequences: ${seqErr.message}`);
  }

  console.log("Sequences reset. Seed complete.");
  sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
