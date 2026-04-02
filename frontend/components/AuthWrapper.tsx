"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const TOKEN_KEY = "token";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Pages that don't need auth
const PUBLIC_PATHS = ["/login", "/register", "/invite"];

// Sidebar nav items
const NAV_ITEMS = [
  { href: "/",           label: "Dashboard",  icon: "▦" },
  { href: "/pipelines",  label: "Pipelines",  icon: "⟳" },
  { href: "/healing",    label: "Healing",    icon: "✦" },
  { href: "/analytics",  label: "Analytics",  icon: "◎" },
  { href: "/settings",   label: "Settings",   icon: "⚙" },
];

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready,    setReady]    = useState(false);
  const [userName, setUserName] = useState("User");
  const [orgName,  setOrgName]  = useState("Organisation");
  const [plan,     setPlan]     = useState("Free Plan");

  const isPublic = PUBLIC_PATHS.some(p => pathname?.startsWith(p));

  useEffect(() => {
    const token = getToken();
    if (!token && !isPublic) {
      router.replace("/login");
      return;
    }
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserName(payload.email?.split("@")[0] || "User");
        setOrgName(payload.org_name || "Organisation");
        setPlan(payload.plan || "Free Plan");
      } catch {}
    }
    setReady(true);
  }, [pathname]);

  if (!ready) return null;
  if (isPublic) return <>{children}</>;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#080c14" }}>

      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside style={{
        width: "220px",
        minWidth: "220px",
        background: "#0d1117",
        borderRight: "1px solid #1a2030",
        display: "flex",
        flexDirection: "column",
        padding: "0",
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #1a2030" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "30px", height: "30px", borderRadius: "8px",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: "700", color: "white",
            }}>D</div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0", letterSpacing: "-0.01em" }}>DecisionOps</div>
              <div style={{ fontSize: "10px", color: "#4a5568", marginTop: "1px" }}>DevOps Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 12px", borderRadius: "8px", textDecoration: "none",
              fontSize: "13px", fontWeight: isActive(item.href) ? "600" : "400",
              color: isActive(item.href) ? "#e2e8f0" : "#64748b",
              background: isActive(item.href) ? "#1e2a3a" : "transparent",
              transition: "all 0.15s",
              borderLeft: isActive(item.href) ? "2px solid #3b82f6" : "2px solid transparent",
            }}>
              <span style={{ fontSize: "15px", opacity: isActive(item.href) ? 1 : 0.6 }}>{item.icon}</span>
              {item.label}
              {item.href === "/healing" && (
                <span style={{
                  marginLeft: "auto", fontSize: "10px",
                  background: "#7c3aed", color: "#e9d5ff",
                  padding: "1px 6px", borderRadius: "10px",
                }}>AI</span>
              )}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid #1a2030" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "#1e3a5f",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: "600", color: "#60a5fa",
              flexShrink: 0,
            }}>{userName.charAt(0).toUpperCase()}</div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "12px", fontWeight: "500", color: "#cbd5e1", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{userName}</div>
              <div style={{ fontSize: "10px", color: "#4a5568" }}>{plan}</div>
            </div>
          </div>
          <button
            onClick={() => { localStorage.removeItem(TOKEN_KEY); router.push("/login"); }}
            style={{
              marginTop: "10px", width: "100%", padding: "6px",
              background: "transparent", border: "1px solid #1e2a3a",
              borderRadius: "6px", color: "#64748b", fontSize: "11px",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >Sign out</button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", background: "#080c14",
      }}>
        {/* Top bar */}
        <div style={{
          height: "52px", minHeight: "52px",
          borderBottom: "1px solid #1a2030",
          display: "flex", alignItems: "center",
          padding: "0 24px", gap: "16px",
          background: "#0d1117",
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              {NAV_ITEMS.find(n => isActive(n.href))?.label || "Dashboard"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: "#22c55e", boxShadow: "0 0 6px #22c55e",
            }} />
            <span style={{ fontSize: "12px", color: "#64748b" }}>Live</span>
          </div>
        </div>

        {/* Page content */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "24px",
        }}>
          {children}
        </div>
      </main>
    </div>
  );
}