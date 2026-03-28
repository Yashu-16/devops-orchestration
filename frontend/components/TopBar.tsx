"use client";

import { usePathname } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/":              { title: "Dashboard",    description: "Overview of all pipelines and activity" },
  "/pipelines":     { title: "Pipelines",    description: "Manage and run your CI/CD pipelines" },
  "/analytics":     { title: "Analytics",    description: "Trends, failure patterns, and insights" },
  "/healing":       { title: "Self-Healing", description: "Auto-remediation audit trail" },
  "/integrations":  { title: "Integrations", description: "Connect GitHub, GitLab, Bitbucket and Azure DevOps" },
  "/settings":      { title: "Team",         description: "Manage team members and invitations" },
  "/notifications": { title: "Notifications", description: "Your alerts and notification preferences" },
  "/ml": { title: "ML Model", description: "Train and monitor the failure prediction model" },
};

export default function TopBar() {
  const pathname = usePathname();
  const page     = pageTitles[pathname] || pageTitles["/"];

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-6 justify-between">
      <div>
        <h1 className="text-white font-semibold text-sm">{page.title}</h1>
        <p className="text-gray-500 text-xs">{page.description}</p>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-gray-500 text-xs">Live</span>
        </div>
      </div>
    </header>
  );
}