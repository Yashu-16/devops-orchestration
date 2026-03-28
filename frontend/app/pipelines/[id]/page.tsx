"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

type Tab = "overview" | "runs" | "analytics" | "healing" | "ml" | "members";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",  label: "Overview"  },
  { id: "runs",      label: "Runs"      },
  { id: "analytics", label: "Analytics" },
  { id: "healing",   label: "Healing"   },
  { id: "ml",        label: "ML Risk"   },
  { id: "members",   label: "Access"    },
];

const PIE_COLORS = ["#3b82f6","#ef4444","#f59e0b","#10b981","#8b5cf6","#ec4899"];

const riskColor = (score: number) =>
  score >= 0.75 ? "text-red-400"    :
  score >= 0.50 ? "text-orange-400" :
  score >= 0.25 ? "text-yellow-400" : "text-green-400";

const statusBadge = (s: string) =>
  s === "success" ? "bg-green-900 text-green-300" :
  s === "failed"  ? "bg-red-900  text-red-300"    :
  s === "running" ? "bg-blue-900 text-blue-300"   :
                    "bg-gray-800 text-gray-400";

export default function PipelineDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params?.id as string;

  const [tab,      setTab]      = useState<Tab>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [runs,     setRuns]     = useState<any>(null);
  const [analytics,setAnalytics]= useState<any>(null);
  const [healing,  setHealing]  = useState<any>(null);
  const [ml,       setMl]       = useState<any>(null);
  const [members,  setMembers]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [running,  setRunning]  = useState(false);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetch = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "overview" || !overview) {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/overview`, { headers: H });
        setOverview(r.data);
      }
      if (t === "runs") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/runs`, { headers: H });
        setRuns(r.data);
      }
      if (t === "analytics") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/analytics`, { headers: H });
        setAnalytics(r.data);
      }
      if (t === "healing") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/healing`, { headers: H });
        setHealing(r.data);
      }
      if (t === "ml") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/ml`, { headers: H });
        setMl(r.data);
      }
      if (t === "members") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/members`, { headers: H });
        setMembers(r.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [id, B]);

  useEffect(() => { fetch(tab); }, [tab]);

  const handleRun = async () => {
    setRunning(true);
    try {
      await axios.post(`${B}/api/v1/pipelines/${id}/run`, {}, { headers: H });
      setTimeout(() => { fetch("runs"); fetch("overview"); }, 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to trigger run");
    } finally { setRunning(false); }
  };

  const handleAssign = async (userId: number) => {
    try {
      await axios.post(`${B}/api/v1/pipelines/${id}/members`, { user_id: userId }, { headers: H });
      fetch("members");
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to assign"); }
  };

  const handleRemove = async (userId: number) => {
    try {
      await axios.delete(`${B}/api/v1/pipelines/${id}/members/${userId}`, { headers: H });
      fetch("members");
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to remove"); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Back + Run button */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push("/pipelines")}
          className="text-gray-500 hover:text-white text-sm flex items-center gap-1">
          ← All Pipelines
        </button>
        <button onClick={handleRun} disabled={running}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2">
          {running
            ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>Running...</>
            : "▶ Run Pipeline"}
        </button>
      </div>

      {/* Pipeline header */}
      {overview && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">{overview.name}</h1>
              {overview.description && (
                <p className="text-gray-500 text-sm mt-0.5">{overview.description}</p>
              )}
              {overview.repository && (
                <p className="text-xs text-gray-600 mt-1 font-mono">{overview.repository} @ {overview.branch}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-sm font-bold ${riskColor(overview.risk_score)}`}>
                {Math.round(overview.risk_score * 100)}% risk
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(overview.last_run_status || "")}`}>
                {overview.last_run_status || "no runs"}
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Runs",    value: overview.total_runs },
              { label: "Success Rate",  value: `${100 - overview.failure_rate}%`, color: "text-green-400" },
              { label: "Failure Rate",  value: `${overview.failure_rate}%`, color: "text-red-400" },
              { label: "Avg Duration",  value: `${overview.avg_duration}s` },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-lg font-bold text-white ${color || ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <>
          {/* ── RUNS TAB ─────────────────────────────────────────── */}
          {tab === "runs" && runs && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Run History</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{runs.total} total runs</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      {["Run","Status","Environment","Triggered By","Stages","Duration","Root Cause","Risk"].map(h => (
                        <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {runs.runs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">#{r.id}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(r.status)}`}>
                            ● {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 capitalize">{r.environment}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.triggered_by || "manual"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {r.stages_passed}/{r.stages_total}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.duration_seconds}s</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                          {r.root_cause ? r.root_cause.replace(/\[.*?\]\s*/, "") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {r.risk_score != null && (
                            <span className={`text-xs font-medium ${riskColor(r.risk_score)}`}>
                              {Math.round(r.risk_score * 100)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ANALYTICS TAB ────────────────────────────────────── */}
          {tab === "analytics" && analytics && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Runs",   value: analytics.summary.total_runs },
                  { label: "Success Rate", value: `${analytics.summary.success_rate}%`, color: "text-green-400" },
                  { label: "Avg Duration", value: `${analytics.summary.avg_duration}s` },
                  { label: "Failed Runs",  value: analytics.summary.failed_runs, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold text-white ${color || ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Trend chart */}
              {analytics.trend.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Daily Run Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={analytics.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      <Line type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} dot={false}/>
                      <Line type="monotone" dataKey="failed"  stroke="#ef4444" strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stage failures */}
                {analytics.stage_failures.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Stage Failures</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={analytics.stage_failures}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                        <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#6b7280" }}/>
                        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}/>
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                        <Bar dataKey="failures" fill="#ef4444" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Root causes */}
                {analytics.root_causes.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Root Cause Breakdown</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={analytics.root_causes} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" outerRadius={70} label={({ name }) => name}>
                          {analytics.root_causes.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HEALING TAB ──────────────────────────────────────── */}
          {tab === "healing" && healing && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total Events",  value: healing?.summary?.total ?? 0 },
                  { label: "Succeeded",     value: healing?.summary?.succeeded ?? 0, color: "text-green-400" },
                  { label: "Failed",        value: healing?.summary?.failed ?? 0, color: "text-red-400" },
                  { label: "Success Rate",  value: `${healing?.summary?.success_rate ?? 0}%`, color: "text-blue-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold text-white ${color || ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Healing Events</h2>
                </div>
                {(healing?.events?.length ?? 0) === 0 ? (
                  <div className="p-12 text-center text-gray-500 text-sm">No healing events yet</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {(healing?.events ?? []).map((e: any) => (
                      <div key={e.id} className="px-5 py-4 flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              e.succeeded ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
                            }`}>
                              {e.succeeded ? "✓ Healed" : "✗ Failed"}
                            </span>
                            <span className="text-xs text-gray-500">Run #{e.run_id}</span>
                          </div>
                          <p className="text-sm text-white font-medium">{e.action}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{e.reason}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-600">{new Date(e.created_at).toLocaleString()}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{e.retry_count} retries</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ML TAB ───────────────────────────────────────────── */}
          {tab === "ml" && ml && (
            <div className="space-y-6">
              {/* Current risk */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Current Risk Assessment</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Risk Score",  value: `${Math.round((ml?.current_risk?.score ?? 0) * 100)}%`, color: riskColor(ml?.current_risk?.score ?? 0) },
                    { label: "Risk Level",  value: ml?.current_risk?.level ?? "unknown", color: riskColor(ml?.current_risk?.score ?? 0) },
                    { label: "Confidence",  value: `${Math.round((ml?.current_risk?.confidence ?? 0) * 100)}%` },
                    { label: "Based On",    value: `${ml?.current_risk?.based_on_runs ?? 0} runs` },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color || "text-white"}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {ml?.current_risk?.used_ml && (
                  <p className="text-xs text-blue-400 mt-3">✓ ML model active for this pipeline</p>
                )}
              </div>

              {/* Risk factors */}
              {(ml?.factors?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Risk Factors</h2>
                  <div className="space-y-3">
                    {(ml?.factors ?? []).map((f: any) => (
                      <div key={f.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-xs text-white">{f.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{f.description}</span>
                          </div>
                          <span className={`text-xs font-mono ${riskColor(f.score ?? 0)}`}>
                            {Math.round((f.score ?? 0) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full"
                            style={{ width: `${(f.score ?? 0) * 100}%` }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk trend */}
              {(ml?.risk_trend?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Risk Score Trend (Last 10 Runs)</h2>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={ml.risk_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                      <XAxis dataKey="run_id" tickFormatter={(v) => `#${v}`} tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <YAxis domain={[0,1]} tickFormatter={(v) => `${Math.round(v*100)}%`} tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <Tooltip
                        formatter={(v: any) => [`${Math.round(Number(v)*100)}%`, "Risk"]}
                        contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      <Line type="monotone" dataKey="risk_score" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316" }}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recommendations */}
              {(ml?.recommendations?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Recommendations</h2>
                  <div className="space-y-3">
                    {(ml?.recommendations ?? []).map((r: any, i: number) => (
                      <div key={i} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            r.priority === "P1" ? "bg-red-900 text-red-300" :
                            r.priority === "P2" ? "bg-yellow-900 text-yellow-300" :
                            "bg-gray-700 text-gray-300"
                          }`}>{r.priority}</span>
                          <span className="text-sm font-medium text-white">{r.title}</span>
                        </div>
                        <p className="text-xs text-gray-400">{r.description}</p>
                        {r.action && (
                          <p className="text-xs text-blue-400 mt-1 font-mono">→ {r.action}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MEMBERS TAB ──────────────────────────────────────── */}
          {tab === "members" && members && (
            <div className="space-y-4">
              {/* Assigned members */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">
                    Has Access ({members.assigned_members.length})
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Admins and owners always have access. Members only see assigned pipelines.
                  </p>
                </div>
                {members.assigned_members.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    No members assigned yet. All admins/owners can still access.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {members.assigned_members.map((m: any) => (
                      <div key={m.user_id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {m.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{m.name}</p>
                            <p className="text-xs text-gray-500">{m.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.role === "owner" ? "bg-purple-900 text-purple-300" :
                            m.role === "admin" ? "bg-blue-900 text-blue-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>{m.role}</span>
                          {m.role === "member" && (
                            <button onClick={() => handleRemove(m.user_id)}
                              className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign new members */}
              {members.available_to_assign.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Assign Access</h2>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {members.available_to_assign.map((m: any) => (
                      <div key={m.user_id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-xs font-bold">
                            {m.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-sm text-white">{m.name}</p>
                            <p className="text-xs text-gray-500">{m.email}</p>
                          </div>
                        </div>
                        <button onClick={() => handleAssign(m.user_id)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          + Assign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
          {tab === "overview" && overview && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Pipeline Details</h3>
                <div className="space-y-3">
                  {[
                    { label: "Repository", value: overview.repository || "Not set" },
                    { label: "Branch",     value: overview.branch || "main" },
                    { label: "Created",    value: new Date(overview.created_at).toLocaleDateString() },
                    { label: "Auto-Heal",  value: overview.self_heal_enabled ? "Enabled" : "Disabled" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className="text-xs text-white font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {TABS.filter(t => t.id !== "overview").map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 text-sm text-white px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between">
                      {t.label}
                      <span className="text-gray-500 text-xs">→</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}