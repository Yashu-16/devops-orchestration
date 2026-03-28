import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AuthWrapper from "@/components/AuthWrapper";
import Script from "next/script";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevOps Orchestrator",
  description: "Autonomous CI/CD Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-gray-950 text-white`}>
        {/* Load config BEFORE everything else - sets window.__API_URL__ */}
        <Script src="/config.js" strategy="beforeInteractive" />
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}