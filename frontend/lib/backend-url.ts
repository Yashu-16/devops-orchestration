// Single source of truth for backend URL
// Used by ALL pages and components
// Priority: window.__API_URL__ (runtime) > NEXT_PUBLIC_API_URL (build time) > localhost

export function getBackend(): string {
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.__API_URL__) return w.__API_URL__;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return "http://localhost:8000";
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}