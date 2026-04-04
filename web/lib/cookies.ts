import { cookies } from "next/headers";

const COOKIE = "customer_id";

export async function getCustomerIdCookie(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function setCustomerIdCookie(customerId: number) {
  const jar = await cookies();
  jar.set(COOKIE, String(customerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}
