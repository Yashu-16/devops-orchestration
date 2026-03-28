"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/",           label: "Dashboard",  icon: "▦" },
  { href: "/pipelines",  label: "Pipelines",  icon: "⚙" },
  { href: "/analytics",  label: "Analytics",  icon: "↗" },
  { href: "/healing",    label: "Healing",    icon: "✦" },
  { href: "/ml",            label: "ML Model",     icon: "◈" },
  { href: "/integrations", label: "Integrations", icon: "⟁" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/settings",  label: "Team",      icon: "👥" }, 
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [org, setOrg]   = useState<{ name: string; plan: string } | null>(null);

  useEffect(() => {
    const u = localStorage.getItem("user");
    const o = localStorage.getItem("org");
    if (u) setUser(JSON.parse(u));
    if (o) setOrg(JSON.parse(o));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("org");
    router.push("/login");
  };

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0 z-40">

      {/* Logo + Org */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-xs font-bold text-white">
            DO
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {org?.name || "DevOps"}
            </p>
            <p className="text-gray-500 text-xs capitalize">
              {org?.plan || "free"} plan
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white font-medium"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-gray-800">
        {user && (
          <div className="mb-3">
            <p className="text-white text-xs font-medium truncate">{user.name}</p>
            <p className="text-gray-500 text-xs truncate">{user.email}</p>
          </div>
        )}
        <button onClick={handleLogout}
          className="w-full text-left text-xs text-gray-500 hover:text-red-400 transition-colors py-1">
          Sign out →
        </button>
        <p className="text-gray-700 text-xs mt-2">v1.0.0 · Phase 10</p>
      </div>
    </aside>
  );
}