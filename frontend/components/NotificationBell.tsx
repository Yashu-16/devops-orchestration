"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Bell } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

export default function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await axios.get(
          `${getBackend()}/api/v1/notifications/unread-count`,
          { headers: getAuthHeaders() }
        );
        setCount(res.data.count || 0);
      } catch {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative cursor-pointer">
      <Bell className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </div>
  );
}