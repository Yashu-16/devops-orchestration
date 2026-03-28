"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Settings, Users, UserPlus, Trash2, Copy, Check } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface Member { id: number; name: string; email: string; role: string; created_at: string; }
interface Invite  { id: number; email: string; role: string; token: string; created_at: string; expires_at: string; }

export default function SettingsPage() {
  const [members,    setMembers]    = useState<Member[]>([]);
  const [invites,    setInvites]    = useState<Invite[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "member" });
  const [inviting,   setInviting]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchAll = async () => {
    try {
      const [mRes, iRes] = await Promise.all([
        axios.get(`${B}/api/v1/team/members`, { headers: H }),
        axios.get(`${B}/api/v1/team/invites`,  { headers: H }),
      ]);
      setMembers(mRes.data || []);
      setInvites(iRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const sendInvite = async () => {
    if (!inviteForm.email.trim()) {
      setError("Please enter an email address");
      return;
    }
    setInviting(true);
    setError(null);
    setSuccess(null);
    setInviteLink(null);

    try {
      const res = await axios.post(`${B}/api/v1/team/invites`, inviteForm, { headers: H });

      // Generate invite link from token
      const token = res.data.token;
      const frontendUrl = window.location.origin;
      const link = `${frontendUrl}/invite?token=${token}`;

      setInviteLink(link);
      setSuccess(`Invite created for ${inviteForm.email}`);
      setInviteForm({ email: "", role: "member" });
      fetchAll();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : detail || "Failed to send invite");
    } finally { setInviting(false); }
  };

  const copyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const removeMember = async (id: number) => {
    if (!confirm("Remove this member from the organization?")) return;
    try {
      await axios.delete(`${B}/api/v1/team/members/${id}`, { headers: H });
      fetchAll();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to remove member");
    }
  };

  const cancelInvite = async (id: number) => {
    if (!confirm("Cancel this invite?")) return;
    try {
      await axios.delete(`${B}/api/v1/team/invites/${id}`, { headers: H });
      fetchAll();
    } catch {}
  };

  const copyToken = (token: string) => {
    const frontendUrl = window.location.origin;
    const link = `${frontendUrl}/invite?token=${token}`;
    navigator.clipboard.writeText(link);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading settings...</div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-400" /> Team Settings
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage your team members and invitations</p>
      </div>

      {/* ── Invite Member ────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-400" /> Invite Team Member
        </h3>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-sm mb-3">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950 border border-green-800 text-green-300 px-3 py-2 rounded-lg text-sm mb-3">
            ✅ {success}
          </div>
        )}

        <div className="flex gap-3 mb-3">
          <input
            type="email"
            value={inviteForm.email}
            onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
            onKeyDown={e => e.key === "Enter" && sendInvite()}
            placeholder="colleague@company.com"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <select
            value={inviteForm.role}
            onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={sendInvite}
            disabled={inviting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          >
            {inviting ? "Creating..." : "Create Invite"}
          </button>
        </div>

        {/* Invite link display */}
        {inviteLink && (
          <div className="bg-gray-800 border border-green-800 rounded-lg p-3">
            <p className="text-xs text-green-400 font-medium mb-2">✅ Invite link generated! Share this with your colleague:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-300 flex-1 truncate font-mono bg-gray-900 px-2 py-1.5 rounded">
                {inviteLink}
              </code>
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
              >
                {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ⚠️ Note: Email sending requires SendGrid configuration. Share this link manually.
            </p>
          </div>
        )}

        {!inviteLink && (
          <p className="text-xs text-gray-600">
            An invite link will be generated that you can share with your colleague.
          </p>
        )}
      </div>

      {/* ── Team Members ─────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-green-400" /> Team Members ({members.length})
        </h3>

        {members.length === 0 ? (
          <p className="text-gray-500 text-sm">No other members yet. Invite someone above!</p>
        ) : (
          <div className="space-y-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                    {m.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.role === "owner" ? "bg-yellow-900 text-yellow-300" :
                    m.role === "admin" ? "bg-purple-900 text-purple-300" :
                    "bg-gray-800 text-gray-400"
                  }`}>
                    {m.role}
                  </span>
                  {m.role !== "owner" && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pending Invites ──────────────────────────────────────── */}
      {invites.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Pending Invites ({invites.length})</h3>
          <div className="space-y-1">
            {invites.map(invite => {
              const frontendUrl = typeof window !== "undefined" ? window.location.origin : "";
              const link = `${frontendUrl}/invite?token=${invite.token}`;
              return (
                <div key={invite.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm text-white">{invite.email}</p>
                    <p className="text-xs text-gray-500">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900 text-yellow-300">
                      {invite.role} · pending
                    </span>
                    <button
                      onClick={() => copyToken(invite.token)}
                      title="Copy invite link"
                      className="text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => cancelInvite(invite.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}