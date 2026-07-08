import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YAHA Waters IMS",
  description: "Inventory Management System — YAHA Water Systems Pvt. Ltd.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "YAHA IMS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0369a1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{})); }`,
          }}
        />
      </body>
    </html>
  );
}
