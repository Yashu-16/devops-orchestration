"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { GitBranch, Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface Integration { id: number; name: string; platform: string; is_active: boolean; repository_url: string; webhook_url: string; created_at: string; }
interface Platform { id: string; name: string; description: string; }

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [platforms,    setPlatforms]    = useState<Platform[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [form, setForm] = useState({ name: "", platform: "github", repository_url: "" });

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchAll = async () => {
    try {
      const [iRes, pRes] = await Promise.all([
        axios.get(`${B}/api/v1/integrations`,          { headers: H }),
        axios.get(`${B}/api/v1/integrations/platforms`, { headers: H }),
      ]);
      setIntegrations(iRes.data);
      setPlatforms(pRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const createIntegration = async () => {
    try {
      await axios.post(`${B}/api/v1/integrations`, form, { headers: H });
      setShowForm(false);
      setForm({ name: "", platform: "github", repository_url: "" });
      fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to create integration");
    }
  };

  const deleteIntegration = async (id: number) => {
    if (!confirm("Delete this integration?")) return;
    try {
      await axios.delete(`${B}/api/v1/integrations/${id}`, { headers: H });
      fetchAll();
    } catch {}
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400">Loading integrations...</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-blue-400" /> Integrations
          </h1>
          <p className="text-gray-500 text-sm mt-1">Connect GitHub, GitLab, Bitbucket and more</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Integration
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-white font-semibold mb-4">New Integration</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="My GitHub Integration"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Platform</label>
              <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Repository URL</label>
              <input type="text" value={form.repository_url} onChange={e => setForm({ ...form, repository_url: e.target.value })}
                placeholder="https://github.com/user/repo"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="flex gap-3">
              <button onClick={createIntegration}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                Create
              </button>
              <button onClick={() => setShowForm(false)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {integrations.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <GitBranch className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No integrations yet</p>
          <p className="text-gray-600 text-sm mt-1">Add a Git provider to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(i => (
            <div key={i.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {i.is_active
                  ? <CheckCircle className="w-5 h-5 text-green-400" />
                  : <XCircle    className="w-5 h-5 text-red-400" />}
                <div>
                  <p className="text-white font-medium">{i.name}</p>
                  <p className="text-xs text-gray-500">{i.platform} · {i.repository_url}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full ${i.is_active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}`}>
                  {i.is_active ? "Active" : "Inactive"}
                </span>
                <button onClick={() => deleteIntegration(i.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}