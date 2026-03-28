"use client";

import { useEffect, useState } from "react";
import axios from "axios";

interface Integration {
  id: number;
  platform: string;
  name: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered: string | null;
  created_at: string;
  webhook_url: string;
}

interface Platform {
  id: string;
  name: string;
  webhook_doc: string;
  events: string[];
}

const platformColors: Record<string, string> = {
  github:    "bg-gray-800 border-gray-600",
  gitlab:    "bg-orange-950 border-orange-800",
  bitbucket: "bg-blue-950 border-blue-800",
  azure:     "bg-blue-950 border-blue-700",
};

const platformIcons: Record<string, string> = {
  github:    "⬡",
  gitlab:    "◈",
  bitbucket: "⟁",
  azure:     "◆",
};

const platformBadge: Record<string, string> = {
  github:    "bg-gray-700 text-gray-300",
  gitlab:    "bg-orange-900 text-orange-300",
  bitbucket: "bg-blue-900 text-blue-300",
  azure:     "bg-blue-900 text-blue-200",
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [platforms, setPlatforms]       = useState<Platform[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [copied, setCopied]             = useState<string | null>(null);
  const [showWebhook, setShowWebhook]   = useState<Integration | null>(null);
  const [form, setForm] = useState({
    platform: "github", name: "", access_token: "",
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = async () => {
    try {
      const [i, p] = await Promise.all([
        axios.get("/api/v1/integrations",          { headers: getAuthHeaders() }),
        axios.get("/api/v1/integrations/platforms", { headers: getAuthHeaders() }),
      ]);
      setIntegrations(i.data);
      setPlatforms(p.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { setError("Please enter a name"); return; }
    setError(null);
    try {
      const res = await axios.post(
        "/api/v1/integrations",
        form,
        { headers: getAuthHeaders() }
      );
      await fetchAll();
      setShowForm(false);
      setForm({ platform: "github", name: "", access_token: "" });
      setShowWebhook(res.data);
      setSuccess(`${res.data.name} connected successfully!`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create integration");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Disconnect ${name}? Webhooks from this integration will stop working.`)) return;
    try {
      await axios.delete(`/api/v1/integrations/${id}`, { headers: getAuthHeaders() });
      await fetchAll();
      setSuccess(`${name} disconnected`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to disconnect");
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">

      {/* Alerts */}
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">
            {integrations.length} platform{integrations.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Connect Platform
        </button>
      </div>

      {/* Webhook setup modal */}
      {showWebhook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6">
            <h3 className="font-semibold text-white mb-2">
              ✓ {showWebhook.name} Connected
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              Copy the webhook URL below and configure it in your{" "}
              {platforms.find(p => p.id === showWebhook.platform)?.name || showWebhook.platform}{" "}
              repository settings.
            </p>

            <div className="bg-gray-800 rounded-xl p-4 space-y-4 mb-5">
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  Webhook URL
                </p>
                <div className="flex gap-2">
                  <input readOnly value={showWebhook.webhook_url}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono" />
                  <button
                    onClick={() => handleCopy(showWebhook.webhook_url, "webhook")}
                    className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-2 rounded-lg shrink-0"
                  >
                    {copied === "webhook" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  Setup Instructions
                </p>
                <div className="space-y-1">
                  {platforms.find(p => p.id === showWebhook.platform) && (
                    <>
                      <p className="text-xs text-gray-400">
                        1. Go to your repository on{" "}
                        {platforms.find(p => p.id === showWebhook.platform)?.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        2. Navigate to{" "}
                        <span className="text-white font-mono">
                          {platforms.find(p => p.id === showWebhook.platform)?.webhook_doc}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400">
                        3. Paste the webhook URL above
                      </p>
                      <p className="text-xs text-gray-400">
                        4. Set Content-Type to{" "}
                        <span className="text-white font-mono">application/json</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        5. Select trigger events:{" "}
                        <span className="text-white">
                          {platforms.find(p => p.id === showWebhook.platform)?.events.join(", ")}
                        </span>
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button onClick={() => setShowWebhook(null)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-sm py-2 rounded-lg">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Connect form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-white mb-5">Connect a Platform</h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {["github", "gitlab", "bitbucket", "azure"].map(p => (
                    <button key={p}
                      onClick={() => setForm(prev => ({ ...prev, platform: p }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        form.platform === p
                          ? "border-blue-500 bg-blue-900/30 text-white"
                          : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      <span>{platformIcons[p]}</span>
                      <span className="capitalize">
                        {p === "azure" ? "Azure DevOps" : p.charAt(0).toUpperCase() + p.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">
                  Display Name
                </label>
                <input type="text"
                  placeholder={`My ${form.platform.charAt(0).toUpperCase() + form.platform.slice(1)}`}
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">
                  Access Token <span className="text-gray-600">(optional — for private repos)</span>
                </label>
                <input type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={form.access_token}
                  onChange={e => setForm(p => ({ ...p, access_token: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-xs mt-4">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm py-2 rounded-lg">
                Connect
              </button>
              <button onClick={() => { setShowForm(false); setError(null); }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform catalog */}
      {integrations.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <h2 className="text-sm font-semibold text-white mb-2">No integrations yet</h2>
          <p className="text-gray-500 text-sm mb-6">
            Connect a CI/CD platform to automatically trigger pipelines on every code push.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {["github", "gitlab", "bitbucket", "azure"].map(p => (
              <button key={p}
                onClick={() => { setForm(prev => ({ ...prev, platform: p })); setShowForm(true); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors hover:border-blue-500 ${platformColors[p]}`}
              >
                <span className="text-2xl">{platformIcons[p]}</span>
                <span className="text-sm font-medium text-white capitalize">
                  {p === "azure" ? "Azure DevOps" : p.charAt(0).toUpperCase() + p.slice(1)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <div className="space-y-3">
          {integrations.map(integration => (
            <div key={integration.id}
              className={`border rounded-xl p-5 ${platformColors[integration.platform]}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{platformIcons[integration.platform]}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{integration.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${platformBadge[integration.platform]}`}>
                        {integration.platform === "azure" ? "Azure DevOps" :
                          integration.platform.charAt(0).toUpperCase() + integration.platform.slice(1)}
                      </span>
                      <span className="text-xs bg-green-900 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {integration.trigger_count} trigger{integration.trigger_count !== 1 ? "s" : ""}
                      {integration.last_triggered && (
                        <> · Last: {new Date(integration.last_triggered).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowWebhook(integration)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    View Setup
                  </button>
                  <button
                    onClick={() => handleDelete(integration.id, integration.name)}
                    className="text-xs text-gray-600 hover:text-red-400 px-2 py-1.5 rounded transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Webhook URL preview */}
              <div className="mt-3 flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
                <span className="text-gray-500 text-xs shrink-0">Webhook:</span>
                <span className="text-gray-400 text-xs font-mono truncate flex-1">
                  {integration.webhook_url}
                </span>
                <button
                  onClick={() => handleCopy(integration.webhook_url, `wh-${integration.id}`)}
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0 transition-colors"
                >
                  {copied === `wh-${integration.id}` ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">How Integrations Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: "1", title: "Connect Platform", desc: "Add your GitHub, GitLab, Bitbucket, or Azure DevOps" },
            { step: "2", title: "Configure Webhook", desc: "Copy the webhook URL into your repository settings" },
            { step: "3", title: "Create Pipeline",  desc: "Add a pipeline with the matching repository URL" },
            { step: "4", title: "Push Code",        desc: "Every git push automatically triggers your pipeline" },
          ].map(item => (
            <div key={item.step} className="flex gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}