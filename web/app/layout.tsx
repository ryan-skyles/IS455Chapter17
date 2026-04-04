import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IS455 Shop",
  description: "Operational shop + fraud scoring (Supabase)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
