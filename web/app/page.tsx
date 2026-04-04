import { redirect } from "next/navigation";
import { getCustomerIdCookie } from "@/lib/cookies";

export default async function Home() {
  const id = await getCustomerIdCookie();
  redirect(id ? "/dashboard" : "/select-customer");
}
