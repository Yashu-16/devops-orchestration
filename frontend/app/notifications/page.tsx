"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { Bell, Check, CheckCheck, Settings } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [prefs, setPrefs]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inbox"|"settings">("inbox");

  const B = getBackend();
  const H = getAuthHeaders();

  useEffect(() => {
    const fetch = async () => {
      try {
        const [n, p] = await Promise.all([
          axios.get(`${B}/api/v1/notifications?limit=50`, { headers: H }),
          axios.get(`${B}/api/v1/notifications/preferences`, { headers: H }),
        ]);
        setNotifications(n.data);
        setPrefs(p.data);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const markRead = async (id: number) => {
    try {
      await axios.patch(`${B}/api/v1/notifications/${id}/read`, {}, { headers: H });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${B}/api/v1/notifications/mark-all-read`, {}, { headers: H });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const savePrefs = async () => {
    try {
      await axios.put(`${B}/api/v1/notifications/preferences`, prefs, { headers: H });
      alert("Saved!");
    } catch {}
  };

  const unread = notifications.filter(n => !n.is_read).length;

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-400" /> Notifications
            {unread > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{unread}</span>}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage alerts and preferences</p>
        </div>
        <div className="flex gap-2">
          {(["inbox","settings"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}>
              {t === "inbox" ? "Inbox" : <><Settings className="w-4 h-4 inline mr-1"/>Settings</>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "inbox" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <span className="text-sm text-gray-400">{notifications.length} notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-400 flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0
            ? <div className="p-12 text-center text-gray-500">No notifications yet</div>
            : <div className="divide-y divide-gray-800">
                {notifications.map(n => (
                  <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.is_read ? "bg-gray-800/50" : ""}`}>
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      n.type === "failure" ? "bg-red-400" : n.type === "success" ? "bg-green-400" : "bg-blue-400"
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                      <p className="text-xs text-gray-600 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {!n.is_read && (
                      <button onClick={() => markRead(n.id)} className="text-gray-500 hover:text-blue-400">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {activeTab === "settings" && prefs && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {[
            { key: "in_app_enabled", label: "In-App Notifications" },
            { key: "email_enabled",  label: "Email Notifications" },
            { key: "slack_enabled",  label: "Slack Notifications" },
            { key: "notify_on_failure", label: "Notify on Failure" },
            { key: "notify_on_success", label: "Notify on Success" },
            { key: "notify_on_healing", label: "Notify on Healing" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{label}</span>
              <input type="checkbox" checked={prefs[key] || false}
                onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}
                className="w-4 h-4 rounded" />
            </label>
          ))}
          <button onClick={savePrefs} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium mt-2">
            Save Preferences
          </button>
        </div>
      )}
    </div>
  );
}