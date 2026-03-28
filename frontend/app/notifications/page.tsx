"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Bell, Check, CheckCheck, Settings } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface Prefs {
  email_enabled: boolean;
  slack_enabled: boolean;
  inapp_enabled: boolean;
  notify_on_failure: boolean;
  notify_on_success: boolean;
  notify_on_healing: boolean;
  notify_on_high_risk: boolean;
  slack_webhook_url: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prefs,   setPrefs]   = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [activeTab, setActiveTab] = useState<"inbox" | "settings">("inbox");

  const B = getBackend();
  const H = getAuthHeaders();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [nRes, pRes] = await Promise.all([
          axios.get(`${B}/api/v1/notifications?limit=50`, { headers: H }),
          axios.get(`${B}/api/v1/notifications/preferences`, { headers: H }),
        ]);
        setNotifications(nRes.data || []);
        setPrefs(pRes.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const markRead = async (id: number) => {
    try {
      await axios.patch(`${B}/api/v1/notifications/${id}/read`, {}, { headers: H });
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ));
    } catch (e) { console.error("markRead error:", e); }
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${B}/api/v1/notifications/mark-all-read`, {}, { headers: H });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) { console.error("markAllRead error:", e); }
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    try {
      await axios.patch(`${B}/api/v1/notifications/preferences`, prefs, { headers: H });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error("savePrefs error:", e); }
    finally { setSaving(false); }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading notifications...</div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-400" />
            Notifications
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage alerts and preferences</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("inbox")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "inbox" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Inbox {unreadCount > 0 && `(${unreadCount})`}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
              activeTab === "settings" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
        </div>
      </div>

      {/* INBOX TAB */}
      {activeTab === "inbox" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm text-gray-400">{notifications.length} total notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No notifications yet</p>
              <p className="text-gray-600 text-xs mt-1">Run pipelines to generate alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                    !n.is_read ? "bg-blue-950/20" : ""
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    n.type === "failure" ? "bg-red-400" :
                    n.type === "success" ? "bg-green-400" :
                    n.type === "healing" ? "bg-purple-400" :
                    n.type === "high_risk" ? "bg-yellow-400" : "bg-blue-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      {!n.is_read && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">New</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => markRead(n.id)}
                      title="Mark as read"
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && prefs && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {saved && (
            <div className="bg-green-950 border border-green-800 text-green-300 px-4 py-3 rounded-lg text-sm mb-4">
              ✅ Preferences saved successfully!
            </div>
          )}

          <div className="space-y-6">
            {/* Channels */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 pb-2 border-b border-gray-800">
                Notification Channels
              </h3>
              <div className="space-y-3">
                {[
                  { key: "inapp_enabled", label: "In-App Notifications", desc: "Show notifications in the bell icon" },
                  { key: "email_enabled",  label: "Email Notifications",  desc: "Send email alerts (requires SendGrid)" },
                  { key: "slack_enabled",  label: "Slack Notifications",  desc: "Send alerts to Slack channel" },
                ].map(({ key, label, desc }) => (
                  <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(prefs as any)[key] || false}
                      onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Triggers */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3 pb-2 border-b border-gray-800">
                Notify When
              </h3>
              <div className="space-y-3">
                {[
                  { key: "notify_on_failure",  label: "Pipeline Fails",        desc: "Alert when a pipeline run fails" },
                  { key: "notify_on_success",  label: "Pipeline Succeeds",     desc: "Alert when a pipeline run completes" },
                  { key: "notify_on_healing",  label: "Self-Healing Triggered", desc: "Alert when auto-healing runs" },
                  { key: "notify_on_high_risk", label: "High Risk Detected",   desc: "Alert when risk score exceeds 70%" },
                ].map(({ key, label, desc }) => (
                  <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(prefs as any)[key] || false}
                      onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Slack webhook */}
            {prefs.slack_enabled && (
              <div>
                <label className="text-sm text-gray-300 block mb-1 font-medium">Slack Webhook URL</label>
                <input
                  type="text"
                  value={prefs.slack_webhook_url || ""}
                  onChange={e => setPrefs({ ...prefs, slack_webhook_url: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Create a Slack app and add an incoming webhook URL
                </p>
              </div>
            )}

            <button
              onClick={savePrefs}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
