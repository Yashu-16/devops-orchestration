"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  pipeline_id: number | null;
  run_id: number | null;
  created_at: string;
}

const typeStyle: Record<string, string> = {
  error:   "border-l-4 border-red-500 bg-red-950/30",
  success: "border-l-4 border-green-500 bg-green-950/30",
  warning: "border-l-4 border-yellow-500 bg-yellow-950/30",
  info:    "border-l-4 border-blue-500 bg-blue-950/30",
};

const typeDot: Record<string, string> = {
  error:   "bg-red-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  info:    "bg-blue-500",
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const panelRef                          = useRef<HTMLDivElement>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await axios.get(
        "/api/v1/notifications/unread-count",
        { headers: getAuthHeaders() }
      );
      setUnreadCount(res.data.count);
    } catch {}
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        "/api/v1/notifications?limit=15",
        { headers: getAuthHeaders() }
      );
      setNotifications(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.post(
        "/api/v1/notifications/mark-read",
        {},
        { headers: getAuthHeaders() }
      );
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const handleMarkOneRead = async (id: number) => {
    try {
      await axios.post(
        `/api/v1/notifications/${id}/read`,
        {},
        { headers: getAuthHeaders() }
      );
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  // Poll for new notifications every 10 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={panelRef} className="relative">

      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-gray-500 text-sm">No notifications yet</p>
                <p className="text-gray-600 text-xs mt-1">
                  Run a pipeline to see alerts here
                </p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkOneRead(n.id)}
                  className={`px-4 py-3 border-b border-gray-800 last:border-0 cursor-pointer
                    hover:bg-gray-800/50 transition-colors
                    ${typeStyle[n.type] || typeStyle.info}
                    ${!n.read ? "opacity-100" : "opacity-60"}
                  `}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      !n.read ? (typeDot[n.type] || typeDot.info) : "bg-gray-600"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${!n.read ? "text-white" : "text-gray-400"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                        {n.message}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(n.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
              <a href="/notifications"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                View all notifications →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}