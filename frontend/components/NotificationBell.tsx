"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

export default function NotificationBell() {
  const [count, setCount]     = useState(0);
  const [open,  setOpen]      = useState(false);
  const [items, setItems]     = useState<any[]>([]);
  const ref    = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const B = getBackend();
  const H = getAuthHeaders();

  // Fetch unread count
  const fetchCount = async () => {
    try {
      const res = await axios.get(`${B}/api/v1/notifications/unread-count`, { headers: H });
      setCount(res.data.count || 0);
    } catch {}
  };

  // Fetch recent notifications for dropdown
  const fetchRecent = async () => {
    try {
      const res = await axios.get(`${B}/api/v1/notifications?limit=5`, { headers: H });
      setItems(res.data || []);
    } catch {}
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleToggle = async () => {
    if (!open) await fetchRecent();
    setOpen(prev => !prev);
  };

  const markRead = async (id: number) => {
    try {
      await axios.patch(`${B}/api/v1/notifications/${id}/read`, {}, { headers: H });
      setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            <button
              onClick={() => { setOpen(false); router.push("/notifications"); }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View all
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No notifications</div>
          ) : (
            <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
              {items.map(n => (
                <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${!n.is_read ? "bg-gray-800/50" : ""}`}>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    n.type === "failure" ? "bg-red-400" :
                    n.type === "success" ? "bg-green-400" :
                    n.type === "healing" ? "bg-purple-400" : "bg-blue-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{n.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{n.message}</p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 mt-0.5"
                    >
                      ✓
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}