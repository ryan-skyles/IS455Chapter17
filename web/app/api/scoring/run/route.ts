import { NextResponse } from "next/server";
import { tryCreateServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = tryCreateServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured (check env vars)." },
      { status: 500 },
    );
  }

  const { error } = await supabase.rpc("refresh_fraud_predictions_fallback");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/warehouse/priority?scored=1", request.url));
}
