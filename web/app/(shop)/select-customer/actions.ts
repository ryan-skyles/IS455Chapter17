"use server";

import { redirect } from "next/navigation";
import { setCustomerIdCookie } from "@/lib/cookies";
import { createServiceClient } from "@/lib/supabase/server";

export async function selectCustomer(formData: FormData) {
  const raw = formData.get("customer_id")?.toString() ?? "";
  const customerId = Number.parseInt(raw, 10);
  if (!Number.isFinite(customerId)) {
    redirect("/select-customer?error=invalid");
  }

  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", customerId);

  if (error || !count) {
    redirect("/select-customer?error=missing");
  }

  await setCustomerIdCookie(customerId);
  redirect("/dashboard");
}
