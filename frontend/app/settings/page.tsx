"use client";

import { useEffect, useState } from "react";
import axios from "axios";

interface Member {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface Invite {
  id: number;
  email: string;
  role: string;
  token: string;
  accepted: boolean;
  expires_at: string;
  invited_by_name: string | null;
}

const roleStyle: Record<string, string> = {
  owner:  "bg-purple-900 text-purple-300 border border-purple-700",
  admin:  "bg-blue-900 text-blue-300 border border-blue-700",
  member: "bg-gray-800 text-gray-300 border border-gray-600",
};

export default function SettingsPage() {
  const [members, setMembers]         = useState<Member[]>([]);
  const [invites, setInvites]         = useState<Invite[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [showInvite, setShowInvite]   = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [inviteForm, setInviteForm]   = useState({ email: "", role: "member" });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg]   = useState<any>(null);
  const [inviteLink, setInviteLink]   = useState<string | null>(null);

  // ── Auth helpers ───────────────────────────────────────────────

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ── Data fetching ──────────────────────────────────────────────

  useEffect(() => {
    const u = localStorage.getItem("user");
    const o = localStorage.getItem("org");
    if (u) setCurrentUser(JSON.parse(u));
    if (o) setCurrentOrg(JSON.parse(o));
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        axios.get("/api/v1/team/members", { headers: getAuthHeaders() }),
        axios.get("/api/v1/team/invites", { headers: getAuthHeaders() }),
      ]);
      setMembers(m.data);
      setInvites(i.data);
      setError(null);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || "Failed to load team data. Are you logged in?");
    } finally {
      setLoading(false);
    }
  };

  // ── Invite ─────────────────────────────────────────────────────

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) {
      setError("Please enter an email address");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await axios.post(
        "/api/v1/team/invites",
        inviteForm,
        { headers: getAuthHeaders() }
      );
      const link = `${window.location.origin}/invite?token=${res.data.token}`;
      setInviteLink(link);
      setInviteForm({ email: "", role: "member" });
      await fetchAll();
      setSuccess(`Invite created for ${res.data.email}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create invite");
    }
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCancelInvite = async (inviteId: number) => {
    setError(null);
    try {
      await axios.delete(
        `/api/v1/team/invites/${inviteId}`,
        { headers: getAuthHeaders() }
      );
      await fetchAll();
      setSuccess("Invite cancelled");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to cancel invite");
    }
  };

  // ── Member management ──────────────────────────────────────────

  const handleRoleChange = async (userId: number, newRole: string) => {
    setError(null);
    try {
      await axios.patch(
        `/api/v1/team/members/${userId}/role`,
        { role: newRole },
        { headers: getAuthHeaders() }
      );
      // Update local user state if they changed their own display
      await fetchAll();
      setSuccess("Role updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update role");
    }
  };

  const handleRemoveMember = async (userId: number, name: string) => {
    if (!confirm(`Remove ${name} from the organization? This cannot be undone.`)) return;
    setError(null);
    try {
      await axios.delete(
        `/api/v1/team/members/${userId}`,
        { headers: getAuthHeaders() }
      );
      await fetchAll();
      setSuccess(`${name} has been removed from the organization`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to remove member");
    }
  };

  // ── Role helpers ───────────────────────────────────────────────

  const roleHierarchy: Record<string, number> = { owner: 3, admin: 2, member: 1 };

  const canManage = (targetRole: string): boolean => {
    const myLevel     = roleHierarchy[currentUser?.role] || 0;
    const targetLevel = roleHierarchy[targetRole] || 0;
    return myLevel > targetLevel;
  };

  const isAdminOrOwner = currentUser?.role === "owner" || currentUser?.role === "admin";

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* Alerts */}
      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-950 border border-green-800 text-green-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <span className="shrink-0">✓</span>
          <span>{success}</span>
        </div>
      )}

      {/* Organization Info */}
      {currentOrg && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Organization</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              {currentOrg.name?.charAt(0)?.toUpperCase() || "O"}
            </div>
            <div>
              <p className="text-white font-semibold">{currentOrg.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">Plan:</span>
                <span className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full capitalize">
                  {currentOrg.plan || "free"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Team Members</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
          </div>
          {isAdminOrOwner && (
            <button
              onClick={() => {
                setShowInvite(!showInvite);
                setInviteLink(null);
                setError(null);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              + Invite Member
            </button>
          )}
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="px-5 py-4 bg-gray-800/50 border-b border-gray-700">
            {inviteLink ? (
              <div className="space-y-3">
                <p className="text-green-400 text-sm font-medium">
                  ✓ Invite created successfully!
                </p>
                <p className="text-gray-400 text-xs">
                  Share this link with your colleague. It expires in 48 hours.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      setSuccess("Invite link copied to clipboard!");
                      setTimeout(() => setSuccess(null), 2000);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-xs px-3 py-2 rounded-lg shrink-0 transition-colors"
                  >
                    Copy Link
                  </button>
                </div>
                <button
                  onClick={() => { setShowInvite(false); setInviteLink(null); }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-300 font-medium">Invite a new team member</p>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Email Address</label>
                    <input
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteForm.email}
                      onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleInvite()}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Role</label>
                    <select
                      value={inviteForm.role}
                      onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      {currentUser?.role === "owner" && (
                        <option value="owner">Owner</option>
                      )}
                    </select>
                  </div>
                  <button
                    onClick={handleInvite}
                    className="bg-blue-600 hover:bg-blue-700 text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Send Invite
                  </button>
                  <button
                    onClick={() => { setShowInvite(false); setError(null); }}
                    className="bg-gray-700 hover:bg-gray-600 text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-500 text-sm">No members found.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                {/* Avatar */}
                <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {member.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {member.name}
                    </p>
                    {member.email === currentUser?.email && (
                      <span className="text-xs text-gray-600 shrink-0">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{member.email}</p>
                </div>

                {/* Joined date */}
                <p className="text-xs text-gray-600 shrink-0 hidden md:block">
                  Joined {new Date(member.created_at).toLocaleDateString()}
                </p>

                {/* Role */}
                <div className="shrink-0">
                  {canManage(member.role) && member.email !== currentUser?.email ? (
                    <select
                      value={member.role}
                      onChange={e => handleRoleChange(member.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border cursor-pointer ${roleStyle[member.role]} bg-transparent`}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                      {currentUser?.role === "owner" && (
                        <option value="owner">owner</option>
                      )}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleStyle[member.role]}`}>
                      {member.role}
                    </span>
                  )}
                </div>

                {/* Remove button */}
                {canManage(member.role) && member.email !== currentUser?.email && (
                  <button
                    onClick={() => handleRemoveMember(member.id, member.name)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Pending Invites</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {invites.length} invite{invites.length !== 1 ? "s" : ""} waiting to be accepted
            </p>
          </div>
          <div className="divide-y divide-gray-800">
            {invites.map(invite => (
              <div key={invite.id} className="flex items-center gap-4 px-5 py-3.5">
                {/* Avatar placeholder */}
                <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-gray-500 text-sm shrink-0 border border-dashed border-gray-600">
                  ?
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{invite.email}</p>
                  <p className="text-xs text-gray-500">
                    Invited by {invite.invited_by_name || "unknown"} ·{" "}
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Role */}
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${roleStyle[invite.role]}`}>
                  {invite.role}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleCopyLink(invite.token)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {copiedToken === invite.token ? "✓ Copied!" : "Copy Link"}
                  </button>
                  {isAdminOrOwner && (
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role descriptions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Role Permissions</h2>
        <div className="space-y-3">
          {[
            {
              role: "owner",
              desc: "Full access. Can manage billing, delete the organization, invite owners, and manage all members.",
            },
            {
              role: "admin",
              desc: "Can invite members, manage pipelines, view all runs, and change member roles (below admin).",
            },
            {
              role: "member",
              desc: "Can view and run pipelines. Cannot manage team members, invite others, or access settings.",
            },
          ].map(r => (
            <div key={r.role} className="flex items-start gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 mt-0.5 ${roleStyle[r.role]}`}>
                {r.role}
              </span>
              <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Your Account */}
      {currentUser && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Your Account</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Name</span>
              <span className="text-sm text-white">{currentUser.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Email</span>
              <span className="text-sm text-white">{currentUser.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Role</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleStyle[currentUser.role]}`}>
                {currentUser.role}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}