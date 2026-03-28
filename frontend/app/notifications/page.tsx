"use client";

import { useEffect, useState } from "react";
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

interface Prefs {
  slack_enabled: boolean;
  email_enabled: boolean;
  inapp_enabled: boolean;
  slack_webhook_url: string | null;
  notify_on_failure: boolean;
  notify_on_success: boolean;
  notify_on_recovery: boolean;
}

const typeStyle: Record<string, string> = {
  error:   "border-red-800 bg-red-950/20",
  success: "border-green-800 bg-green-950/20",
  warning: "border-yellow-800 bg-yellow-950/20",
  info:    "border-blue-800 bg-blue-950/20",
};

const typeBadge: Record<string, string> = {
  error:   "bg-red-900 text-red-300 border border-red-700",
  success: "bg-green-900 text-green-300 border border-green-700",
  warning: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  info:    "bg-blue-900 text-blue-300 border border-blue-700",
};

// ── Reusable Toggle Component ─────────────────────────────────────
function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none ${
        value ? "bg-green-500" : "bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-200 ${
          value ? "translate-x-7" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prefs, setPrefs]                 = useState<Prefs | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [testingSlack, setTestingSlack]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);
  const [localPrefs, setLocalPrefs]       = useState<Partial<Prefs>>({});

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = async () => {
    try {
      const [n, p] = await Promise.all([
        axios.get("/api/v1/notifications?limit=50", { headers: getAuthHeaders() }),
        axios.get("/api/v1/notifications/preferences", { headers: getAuthHeaders() }),
      ]);
      setNotifications(n.data);
      setPrefs(p.data);
      setLocalPrefs(p.data);
    } catch (err: any) {
      setError("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleMarkAllRead = async () => {
    try {
      await axios.post(
        "/api/v1/notifications/mark-read",
        {},
        { headers: getAuthHeaders() }
      );
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setSuccess("All notifications marked as read");
      setTimeout(() => setSuccess(null), 3000);
    } catch {}
  };

  const handleSavePrefs = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await axios.patch(
        "/api/v1/notifications/preferences",
        localPrefs,
        { headers: getAuthHeaders() }
      );
      setPrefs(res.data);
      setSuccess("Preferences saved successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSlack = async () => {
    setTestingSlack(true);
    setError(null);
    try {
      await axios.post(
        "/api/v1/notifications/test-slack",
        {},
        { headers: getAuthHeaders() }
      );
      setSuccess("Test message sent to Slack!");
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Slack test failed");
    } finally {
      setTestingSlack(false);
    }
  };

  const setPref = (key: keyof Prefs, value: any) => {
    setLocalPrefs(p => ({ ...p, [key]: value }));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-950 border border-green-800 text-green-300 px-4 py-3 rounded-lg text-sm">
          ✓ {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Notification list ─────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Recent Notifications
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🔔</div>
                <p className="text-white font-medium mb-1">No notifications yet</p>
                <p className="text-gray-500 text-sm">
                  Run some pipelines to see alerts here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    className={`px-5 py-4 border-l-4 ${
                      n.type === "error"   ? "border-red-500 bg-red-950/10" :
                      n.type === "success" ? "border-green-500 bg-green-950/10" :
                      n.type === "warning" ? "border-yellow-500 bg-yellow-950/10" :
                      "border-blue-500 bg-blue-950/10"
                    } ${!n.read ? "opacity-100" : "opacity-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge[n.type] || typeBadge.info}`}>
                            {n.type}
                          </span>
                          {!n.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        <p className="text-sm font-medium text-white">{n.title}</p>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                      <span className="text-xs text-gray-600 shrink-0">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Preferences panel ─────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-5">
              Notification Preferences
            </h2>

            {/* Channels */}
            <div className="space-y-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                Channels
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">In-App</p>
                  <p className="text-xs text-gray-500">Bell icon in the header</p>
                </div>
                <Toggle
                  value={!!localPrefs.inapp_enabled}
                  onChange={v => setPref("inapp_enabled", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Email</p>
                  <p className="text-xs text-gray-500">Sent to your account email</p>
                </div>
                <Toggle
                  value={!!localPrefs.email_enabled}
                  onChange={v => setPref("email_enabled", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-200">Slack</p>
                  <p className="text-xs text-gray-500">Requires webhook URL below</p>
                </div>
                <Toggle
                  value={!!localPrefs.slack_enabled}
                  onChange={v => setPref("slack_enabled", v)}
                />
              </div>
            </div>

            {/* Slack webhook URL */}
            {localPrefs.slack_enabled && (
              <div className="mb-6 p-3 bg-gray-800 rounded-lg space-y-3">
                <label className="text-xs text-gray-400 block font-medium">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={localPrefs.slack_webhook_url || ""}
                  onChange={e => setPref("slack_webhook_url", e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleTestSlack}
                  disabled={testingSlack || !localPrefs.slack_webhook_url}
                  className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-xs py-2 rounded-lg transition-colors text-gray-300"
                >
                  {testingSlack ? "Sending..." : "Send Test Message"}
                </button>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-800 mb-5" />

            {/* When to notify */}
            <div className="space-y-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                When to Notify
              </p>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-200">Pipeline Fails</p>
                <Toggle
                  value={!!localPrefs.notify_on_failure}
                  onChange={v => setPref("notify_on_failure", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-200">Pipeline Succeeds</p>
                <Toggle
                  value={!!localPrefs.notify_on_success}
                  onChange={v => setPref("notify_on_success", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-200">Pipeline Recovers</p>
                <Toggle
                  value={!!localPrefs.notify_on_recovery}
                  onChange={v => setPref("notify_on_recovery", v)}
                />
              </div>
            </div>

            <button
              onClick={handleSavePrefs}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-sm py-2.5 rounded-lg transition-colors font-medium"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>

          {/* Slack setup guide */}
          {localPrefs.slack_enabled && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">
                Slack Setup Guide
              </h3>
              <ol className="space-y-2">
                {[
                  "Go to api.slack.com/apps",
                  "Create New App → From scratch",
                  "Enable Incoming Webhooks",
                  "Add New Webhook to Workspace",
                  "Select your channel",
                  "Copy the webhook URL here",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400">
                    <span className="text-blue-500 font-mono shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}