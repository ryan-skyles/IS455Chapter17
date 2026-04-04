# Shop web app (Next.js + Supabase) — Vercel

This folder is the **Vercel-friendly** version of the Chapter 17 shop UI. The original ASP.NET app remains at the repo root for reference.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the full script in `../supabase/migrations/001_init.sql` (creates tables + `refresh_fraud_predictions_fallback` + `reset_shop_sequences`).
3. Under **Project Settings → API**, copy the **Project URL** and **service_role** key (server-only; never expose in client code).

## 2. Local environment

```bash
cd web
cp .env.local.example .env.local
# Edit .env.local with your URL and service_role key
```

## 3. Seed Postgres from `shop.db`

From the **repo root**, `shop.db` must exist (course database). Then:

```bash
cd web
npm install
npm run seed:supabase
```

This upserts all shop tables and calls `reset_shop_sequences` so new `orders` / `order_items` IDs continue after the seeded data.

## 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Deploy on Vercel

1. Import the Git repo in Vercel.
2. Set **Root Directory** to `web`.
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy.

## Scoring behavior

**Run Scoring** calls the Postgres function `refresh_fraud_predictions_fallback`, which fills `order_predictions_fraud` from each order’s operational **`risk_score`** (scaled to a probability). That keeps the priority queue working on serverless without bundling Python/sklearn.

The team’s full **sklearn** pipeline remains in `../jobs/run_inference.py` (local SQLite + `warehouse.db` + `fraud_pipeline.joblib`). You can extend the project later to push those predictions into Supabase if you need exact parity with the notebook model.
