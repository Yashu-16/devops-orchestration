"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Suspense } from "react";

interface InviteInfo {
  email: string;
  role: string;
  org_name: string;
  expires_at: string;
}

function AcceptInviteContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") || "";

  const [invite, setInvite]   = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", password: "" });

  useEffect(() => {
    if (!token) {
      setError("Invalid invite link — no token found");
      setLoading(false);
      return;
    }
    axios.get(`/api/v1/team/invites/lookup/${token}`)
      .then(res => setInvite(res.data))
      .catch(err => setError(
        err.response?.data?.detail || "Invalid or expired invite link"
      ))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!form.name.trim()) { setError("Please enter your name"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await axios.post("/api/v1/team/invites/accept", {
        token:    token,
        name:     form.name.trim(),
        password: form.password,
      });
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("user",  JSON.stringify(res.data.user));
      localStorage.setItem("org",   JSON.stringify(res.data.organization));
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to accept invite");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
            DO
          </div>
          <h1 className="text-2xl font-bold text-white">You&apos;re Invited!</h1>
          {invite && (
            <p className="text-gray-400 text-sm mt-2">
              Join <span className="text-white font-semibold">{invite.org_name}</span> on DevOps Orchestrator
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">

          {error ? (
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-red-400 font-medium mb-2">Invalid Invite</p>
              <p className="text-gray-500 text-sm mb-6">{error}</p>
              <button onClick={() => router.push("/login")}
                className="bg-blue-600 hover:bg-blue-700 text-sm px-6 py-2.5 rounded-lg">
                Go to Login
              </button>
            </div>
          ) : invite ? (
            <div className="space-y-5">

              {/* Invite details */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Email</span>
                  <span className="text-white text-sm">{invite.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Role</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                    invite.role === "owner" ? "bg-purple-900 text-purple-300 border border-purple-700" :
                    invite.role === "admin" ? "bg-blue-900 text-blue-300 border border-blue-700" :
                    "bg-gray-700 text-gray-300 border border-gray-600"
                  }`}>
                    {invite.role}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">Organization</span>
                  <span className="text-white text-sm font-medium">{invite.org_name}</span>
                </div>
              </div>

              {/* Create account form */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Your Full Name</label>
                <input type="text" placeholder="John Smith"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Create Password</label>
                <input type="password" placeholder="Min 8 characters"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAccept()}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>

              {error && (
                <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button onClick={handleAccept} disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium py-2.5 rounded-lg text-sm">
                {saving ? "Creating account..." : "Accept Invite & Join Team"}
              </button>

              <p className="text-center text-xs text-gray-600">
                Expires {new Date(invite.expires_at).toLocaleDateString()}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}