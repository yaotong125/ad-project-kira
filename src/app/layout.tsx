import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Kira's typeface (copied from Kira/frontend/public/fonts).
const avenir = localFont({
  src: [
    { path: "../fonts/avenir-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/avenir-400-oblique.woff2", weight: "400", style: "italic" },
    { path: "../fonts/avenir-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/avenir-500.woff2", weight: "600", style: "normal" },
    { path: "../fonts/avenir-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-avenir",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kira", template: "%s · Kira" },
  description: "Accounting for Malaysian companies.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={avenir.variable}>
      <body>{children}</body>
    </html>
  );
}
