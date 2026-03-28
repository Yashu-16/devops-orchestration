"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Settings, Users, UserPlus, Trash2 } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface Member { id: number; name: string; email: string; role: string; created_at: string; }
interface Invite  { id: number; email: string; role: string; created_at: string; expires_at: string; }

export default function SettingsPage() {
  const [members,    setMembers]    = useState<Member[]>([]);
  const [invites,    setInvites]    = useState<Invite[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "member" });
  const [inviting,   setInviting]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchAll = async () => {
    try {
      const [mRes, iRes] = await Promise.all([
        axios.get(`${B}/api/v1/team/members`, { headers: H }),
        axios.get(`${B}/api/v1/team/invites`,  { headers: H }),
      ]);
      setMembers(mRes.data);
      setInvites(iRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const sendInvite = async () => {
    if (!inviteForm.email) return;
    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await axios.post(`${B}/api/v1/team/invites`, inviteForm, { headers: H });
      setSuccess(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: "", role: "member" });
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to send invite");
    } finally { setInviting(false); }
  };

  const removeMember = async (id: number) => {
    if (!confirm("Remove this member?")) return;
    try {
      await axios.delete(`${B}/api/v1/team/members/${id}`, { headers: H });
      fetchAll();
    } catch {}
  };

  const cancelInvite = async (id: number) => {
    try {
      await axios.delete(`${B}/api/v1/team/invites/${id}`, { headers: H });
      fetchAll();
    } catch {}
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400">Loading settings...</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-400" /> Settings
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage your team and organization</p>
      </div>

      {/* Invite Member */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-400" /> Invite Team Member
        </h3>
        {error   && <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm mb-3">{error}</div>}
        {success && <div className="bg-green-950 border border-green-800 text-green-300 px-3 py-2 rounded-lg text-sm mb-3">{success}</div>}
        <div className="flex gap-3">
          <input type="email" value={inviteForm.email}
            onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="colleague@company.com"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <select value={inviteForm.role}
            onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={sendInvite} disabled={inviting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-green-400" /> Team Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-gray-500 text-sm">No members yet</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm text-white font-medium">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.role === "admin" ? "bg-purple-900 text-purple-300" : "bg-gray-800 text-gray-400"}`}>
                    {m.role}
                  </span>
                  <button onClick={() => removeMember(m.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Pending Invites ({invites.length})</h3>
          <div className="space-y-2">
            {invites.map(i => (
              <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm text-white">{i.email}</p>
                  <p className="text-xs text-gray-500">Expires {new Date(i.expires_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">{i.role}</span>
                  <button onClick={() => cancelInvite(i.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}