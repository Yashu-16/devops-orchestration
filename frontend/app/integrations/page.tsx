"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface Integration {
  id: number;
  name: string;
  platform: string;
  is_active: boolean;
  repository_url: string;
  webhook_url: string;
  created_at: string;
  has_token?: boolean;
}

const PLATFORMS = [
  {
    id: "github",
    name: "GitHub",
    description: "Connect GitHub repositories via webhooks",
    icon: "🐙",
    color: "bg-gray-800 border-gray-600",
    placeholder: "https://github.com/owner/repo",
    docs: "https://docs.github.com/en/developers/webhooks-and-events/webhooks",
    tokenLabel: "Personal Access Token",
    tokenHelp: "Needs repo scope. Get one at github.com/settings/tokens",
    tokenLink: "https://github.com/settings/tokens/new?scopes=repo&description=DecisionOps+Agent",
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect GitLab projects via webhooks",
    icon: "🦊",
    color: "bg-orange-900/30 border-orange-700",
    placeholder: "https://gitlab.com/owner/repo",
    docs: "https://docs.gitlab.com/ee/user/project/integrations/webhooks.html",
    tokenLabel: "Access Token",
    tokenHelp: "Project or Personal token with api scope",
    tokenLink: "https://gitlab.com/-/profile/personal_access_tokens",
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "Connect Bitbucket repositories via webhooks",
    icon: "🪣",
    color: "bg-blue-900/30 border-blue-700",
    placeholder: "https://bitbucket.org/owner/repo",
    docs: "https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/",
    tokenLabel: "App Password",
    tokenHelp: "Create at bitbucket.org/account/settings/app-passwords",
    tokenLink: "https://bitbucket.org/account/settings/app-passwords/new",
  },
  {
    id: "azure_devops",
    name: "Azure DevOps",
    description: "Connect Azure DevOps pipelines via service hooks",
    icon: "☁️",
    color: "bg-cyan-900/30 border-cyan-700",
    placeholder: "https://dev.azure.com/org/project/_git/repo",
    docs: "https://learn.microsoft.com/en-us/azure/devops/service-hooks/overview",
    tokenLabel: "Personal Access Token",
    tokenHelp: "Create a PAT with Code read & write permissions",
    tokenLink: "https://dev.azure.com",
  },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", repository_url: "", access_token: "" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [showToken, setShowToken] = useState(false);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchIntegrations = async () => {
    try {
      const res = await axios.get(`${B}/api/v1/integrations`, { headers: H });
      setIntegrations(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchIntegrations(); }, []);

  const resetForm = () => {
    setShowForm(false);
    setSelectedPlatform(null);
    setForm({ name: "", repository_url: "", access_token: "" });
    setError(null);
    setShowToken(false);
  };

  const handleAdd = async () => {
    if (!selectedPlatform || !form.name || !form.repository_url) {
      setError("Please fill in the integration name and repository URL");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await axios.post(`${B}/api/v1/integrations`, {
        name:           form.name,
        platform:       selectedPlatform,
        repository_url: form.repository_url,
        access_token:   form.access_token || undefined,
      }, { headers: H });
      resetForm();
      fetchIntegrations();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to create integration");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this integration?")) return;
    try {
      await axios.delete(`${B}/api/v1/integrations/${id}`, { headers: H });
      fetchIntegrations();
    } catch {}
  };

  const handleCopyWebhook = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPlatform = (id: string) => PLATFORMS.find(p => p.id === id);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading integrations...</div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">🔗 Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connect your repos — add a token to enable the AI Agent to read and fix your code
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Integration
        </button>
      </div>

      {/* AI Agent info banner */}
      <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-4 mb-6 flex items-start gap-3">
        <span className="text-xl mt-0.5">🤖</span>
        <div>
          <p className="text-sm font-semibold text-purple-200">Enable AI Agent code fixes</p>
          <p className="text-xs text-purple-400 mt-0.5">
            Add a GitHub Personal Access Token (with <code className="bg-purple-900/50 px-1 rounded">repo</code> scope) when creating an integration.
            The AI Agent will then be able to read your code, write fixes directly to GitHub, and trigger a new pipeline run — all automatically.
          </p>
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=DecisionOps+Agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-300 hover:text-purple-200 underline mt-1 inline-block"
          >
            Create a GitHub token with repo access →
          </a>
        </div>
      </div>

      {/* Add Integration Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-8">
          <h3 className="text-white font-semibold mb-4">Choose Platform</h3>

          {/* Platform selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedPlatform === p.id
                    ? "border-blue-500 bg-blue-900/30"
                    : p.color + " hover:border-gray-500"
                }`}
              >
                <div className="text-2xl mb-2">{p.icon}</div>
                <div className="text-sm font-medium text-white">{p.name}</div>
                <div className="text-xs text-gray-400 mt-1">{p.description}</div>
              </button>
            ))}
          </div>

          {selectedPlatform && (
            <>
              {/* How it works */}
              <div className="bg-gray-800 rounded-lg p-4 mb-5 text-xs text-gray-400">
                <p className="font-medium text-gray-300 mb-2">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 mb-2">
                  <li>Create this integration — we generate a unique webhook URL</li>
                  <li>Copy the webhook URL from your integration card</li>
                  <li>Add it to your {getPlatform(selectedPlatform)?.name} repository settings</li>
                  <li>Every push will automatically trigger a pipeline run</li>
                </ol>
                <a
                  href={getPlatform(selectedPlatform)?.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  View {getPlatform(selectedPlatform)?.name} webhook docs →
                </a>
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1 font-medium">Integration Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder={`My ${getPlatform(selectedPlatform)?.name} Repo`}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1 font-medium">Repository URL *</label>
                  <input
                    type="text"
                    value={form.repository_url}
                    onChange={e => setForm({ ...form, repository_url: e.target.value })}
                    placeholder={getPlatform(selectedPlatform)?.placeholder}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Access Token field */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400 font-medium">
                    {getPlatform(selectedPlatform)?.tokenLabel}
                    <span className="text-gray-600 ml-1">(optional — needed for AI Agent code fixes)</span>
                  </label>
                  <a
                    href={getPlatform(selectedPlatform)?.tokenLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    Create token →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={form.access_token}
                    onChange={e => setForm({ ...form, access_token: e.target.value })}
                    placeholder={selectedPlatform === "github" ? "ghp_xxxxxxxxxxxxxxxxxxxx" : "Enter token..."}
                    className="w-full bg-gray-800 border border-purple-800/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-300"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  🤖 {getPlatform(selectedPlatform)?.tokenHelp}
                </p>
              </div>

              {error && (
                <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                  {saving ? "Creating..." : "Create Integration"}
                </button>
                <button
                  onClick={resetForm}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Integrations list */}
      {integrations.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <p className="text-gray-400 font-medium text-lg">No integrations yet</p>
          <p className="text-gray-600 text-sm mt-2 mb-6">
            Add a Git provider to automatically trigger pipelines on code push
          </p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            + Add Integration
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {integrations.map(integration => {
            const platform = getPlatform(integration.platform);
            return (
              <div key={integration.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{platform?.icon || "🔗"}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{integration.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          integration.is_active
                            ? "bg-green-900 text-green-300"
                            : "bg-gray-800 text-gray-400"
                        }`}>
                          {integration.is_active ? "● Active" : "○ Inactive"}
                        </span>
                        {integration.has_token && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-900 text-purple-300">
                            🤖 AI Agent enabled
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {platform?.name} · {integration.repository_url}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(integration.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-sm px-3 py-1 rounded-lg hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                </div>

                {/* Webhook URL */}
                {integration.webhook_url && (
                  <div className="mt-4 bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-400">Webhook URL</span>
                      <span className="text-xs text-gray-500">Add this to your {platform?.name} repo settings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-green-400 flex-1 truncate font-mono">
                        {integration.webhook_url}
                      </code>
                      <button
                        onClick={() => handleCopyWebhook(integration.webhook_url, integration.id)}
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-lg flex-shrink-0 transition-colors"
                      >
                        {copiedId === integration.id ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}

                {/* No token warning */}
                {!integration.has_token && (
                  <div className="mt-3 bg-purple-950/20 border border-purple-800/30 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-xs text-purple-400">🤖 AI Agent not enabled —</span>
                    <span className="text-xs text-purple-500">remove and re-add this integration with a GitHub token to enable code fixes</span>
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-600">
                  Created {new Date(integration.created_at).toLocaleDateString()} ·{" "}
                  <a
                    href={platform?.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-400"
                  >
                    Setup guide →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}