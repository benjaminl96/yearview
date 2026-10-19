import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yearview — Your whole year, in view",
  description: "A fluid, pan-and-zoom calendar for seeing the shape of your year.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
