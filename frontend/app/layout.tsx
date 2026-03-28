import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AuthWrapper from "@/components/AuthWrapper";

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
      <head>
        {/* Runtime config — loads API URL without needing a rebuild */}
        <script src="/config.js" />
      </head>
      <body className={`${geist.className} bg-gray-950 text-white`}>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}