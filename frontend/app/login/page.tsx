"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

// Backend URL — set via environment variable in Railway
const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode]       = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "", password: "", name: "", org_name: "",
  });

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "signup" && (!form.name || !form.org_name)) {
      setError("Name and organization are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === "signup") {
        const res = await axios.post(
          `${BACKEND}/api/v1/auth/signup`,
          {
            email:    form.email.trim(),
            password: form.password,
            name:     form.name.trim(),
            org_name: form.org_name.trim(),
          }
        );
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("user",  JSON.stringify(res.data.user));
        localStorage.setItem("org",   JSON.stringify(res.data.organization));
        router.push("/");

      } else {
        const params = new URLSearchParams();
        params.append("username", form.email.trim());
        params.append("password", form.password);

        const res = await axios.post(
          `${BACKEND}/api/v1/auth/login`,
          params,
          { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("user",  JSON.stringify(res.data.user));
        localStorage.setItem("org",   JSON.stringify(res.data.organization));
        router.push("/");
      }

    } catch (err: any) {
      console.error("Auth error:", err.response?.data);
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg).join(", "));
      } else {
        setError(detail || err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
            DO
          </div>
          <h1 className="text-2xl font-bold text-white">DevOps Orchestrator</h1>
          <p className="text-gray-500 text-sm mt-1">Autonomous CI/CD Platform</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">

          {/* Tab switcher */}
          <div className="flex bg-gray-800 rounded-lg p-1 mb-6">
            {(["login", "signup"] as const).map(m => (
              <button key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Full Name</label>
                  <input
                    type="text"
                    placeholder="John Smith"
                    value={form.name}
                    onChange={update("name")}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Company / Team Name</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={form.org_name}
                    onChange={update("org_name")}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Email Address</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={update("email")}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Password</label>
              <input
                type="password"
                placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
                value={form.password}
                onChange={update("password")}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm mt-2"
            >
              {loading
                ? "Please wait..."
                : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>

          {mode === "login" && (
            <p className="text-center text-xs text-gray-600 mt-4">
              No account?{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); }}
                className="text-blue-400 hover:text-blue-300"
              >
                Sign up free
              </button>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Free plan · No credit card required
        </p>
      </div>
    </div>
  );
}