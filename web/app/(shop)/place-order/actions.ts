"use server";

import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";
import { createServiceClient } from "@/lib/supabase/server";

const SHIPPING_FEE = 7.99;
const TAX_RATE = 0.08;

export async function createOrder(formData: FormData) {
  const customerId = await getCustomerIdCookie();
  if (!customerId) redirect("/select-customer");

  const supabase = createServiceClient();

  const { data: customer, error: ce } = await supabase
    .from("customers")
    .select("customer_id, state, zip_code")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (ce || !customer) redirect("/select-customer");

  const requested: { productId: number; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("q_")) continue;
    const productId = Number.parseInt(key.slice(2), 10);
    const quantity = Number.parseInt(value.toString(), 10);
    if (!Number.isFinite(productId) || !Number.isFinite(quantity) || quantity <= 0)
      continue;
    requested.push({ productId, quantity });
  }

  if (requested.length === 0) {
    redirect("/place-order?error=empty");
  }

  const priceLookup = new Map<number, number>();
  for (const item of requested) {
    const { data: row, error } = await supabase
      .from("products")
      .select("price")
      .eq("product_id", item.productId)
      .eq("is_active", 1)
      .maybeSingle();
    if (error || !row) redirect("/place-order?error=product");
    priceLookup.set(item.productId, Number(row.price));
  }

  const subtotal = requested.reduce(
    (s, x) => s + priceLookup.get(x.productId)! * x.quantity,
    0,
  );
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = subtotal + SHIPPING_FEE + taxAmount;

  const billingZip = customer.zip_code ?? "00000";
  const shippingZip = customer.zip_code ?? "00000";
  const shippingState = customer.state ?? "NA";
  const orderDatetime = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const { data: orderRow, error: oe } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      order_datetime: orderDatetime,
      billing_zip: billingZip,
      shipping_zip: shippingZip,
      shipping_state: shippingState,
      payment_method: "card",
      device_type: "web",
      ip_country: "US",
      promo_used: 0,
      promo_code: null,
      order_subtotal: subtotal,
      shipping_fee: SHIPPING_FEE,
      tax_amount: taxAmount,
      order_total: total,
      risk_score: 0,
      is_fraud: 0,
    })
    .select("order_id")
    .single();

  if (oe || !orderRow) {
    redirect("/place-order?error=insert");
  }

  const orderId = orderRow.order_id;
  const lineRows = requested.map((x) => {
    const unit = priceLookup.get(x.productId)!;
    return {
      order_id: orderId,
      product_id: x.productId,
      quantity: x.quantity,
      unit_price: unit,
      line_total: unit * x.quantity,
    };
  });

  const { error: ie } = await supabase.from("order_items").insert(lineRows);
  if (ie) {
    await supabase.from("orders").delete().eq("order_id", orderId);
    redirect("/place-order?error=items");
  }

  redirect(`/orders/${orderId}`);
}
