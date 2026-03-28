"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getPipelines, getRuns, getStats, getAllRisks, getAllHealingLogs,
  Pipeline, PipelineRun, DashboardStats, RiskAssessment, HealingLog,
} from "@/lib/api";

const statusStyle: Record<string, string> = {
  success:   "bg-green-900 text-green-300 border border-green-700",
  failed:    "bg-red-900 text-red-300 border border-red-700",
  running:   "bg-blue-900 text-blue-300 border border-blue-700",
  pending:   "bg-yellow-900 text-yellow-300 border border-yellow-700",
};
const statusDot: Record<string, string> = {
  success: "bg-green-400", failed: "bg-red-400",
  running: "bg-blue-400 animate-pulse", pending: "bg-yellow-400",
};
const categoryStyle: Record<string, string> = {
  test_failure:   "bg-red-900 text-red-300 border border-red-700",
  dependency:     "bg-orange-900 text-orange-300 border border-orange-700",
  build_failure:  "bg-yellow-900 text-yellow-300 border border-yellow-700",
  infrastructure: "bg-purple-900 text-purple-300 border border-purple-700",
  deployment:     "bg-pink-900 text-pink-300 border border-pink-700",
  code_quality:   "bg-blue-900 text-blue-300 border border-blue-700",
  unknown:        "bg-gray-800 text-gray-400 border border-gray-600",
};
const riskBarColor: Record<string, string> = {
  low: "bg-green-500", medium: "bg-yellow-500",
  high: "bg-orange-500", critical: "bg-red-500",
};
const healingActionStyle: Record<string, string> = {
  retry:    "bg-blue-900 text-blue-300 border border-blue-700",
  rollback: "bg-red-900 text-red-300 border border-red-700",
  alert:    "bg-yellow-900 text-yellow-300 border border-yellow-700",
  skipped:  "bg-gray-800 text-gray-400 border border-gray-600",
};

function parseRootCause(rc: string | null) {
  if (!rc) return { category: "unknown" };
  const bracket = rc.indexOf("]");
  if (rc.startsWith("[") && bracket > 0) {
    return { category: rc.slice(1, bracket).toLowerCase() };
  }
  return { category: "unknown" };
}

export default function DashboardPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [runs, setRuns]           = useState<PipelineRun[]>([]);
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [risks, setRisks]         = useState<Record<number, RiskAssessment>>({});
  const [healingLogs, setHealingLogs] = useState<HealingLog[]>([]);
  const [loading, setLoading]     = useState(true);

  const fetchAll = async () => {
    try {
      const [p, r, s, riskList, hl] = await Promise.all([
        getPipelines(), getRuns(), getStats(), getAllRisks(), getAllHealingLogs(),
      ]);
      setPipelines(p); setRuns(r); setStats(s); setHealingLogs(hl);
      const rm: Record<number, RiskAssessment> = {};
      riskList.forEach(ra => { rm[ra.pipeline_id] = ra; });
      setRisks(rm);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 5000);
    return () => clearInterval(i);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const recentRuns = runs.slice(0, 5);

  return (
    <div className="space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Pipelines",  value: stats?.total_pipelines ?? 0,             color: "text-blue-400",   bg: "bg-blue-900/20",   icon: "⚙" },
          { label: "Total Runs",       value: stats?.total_runs ?? 0,                  color: "text-purple-400", bg: "bg-purple-900/20", icon: "▶" },
          { label: "Success Rate",     value: `${stats?.success_rate ?? 0}%`,          color: "text-green-400",  bg: "bg-green-900/20",  icon: "✓" },
          { label: "Avg Duration",     value: `${stats?.avg_duration_seconds ?? 0}s`,  color: "text-yellow-400", bg: "bg-yellow-900/20", icon: "◷" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-gray-800 rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{s.label}</p>
              <span className={`${s.color} text-lg`}>{s.icon}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pipeline Health */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Pipeline Health</h2>
            <Link href="/pipelines" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          {pipelines.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No pipelines yet.</p>
              <Link href="/pipelines" className="text-blue-400 text-xs mt-2 block">Create one →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelines.slice(0, 5).map(p => {
                const risk = risks[p.id];
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      p.last_status === "success" ? "bg-green-400" :
                      p.last_status === "failed"  ? "bg-red-400" : "bg-gray-500"
                    }`} />
                    <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-gray-500">{p.run_count} runs</span>
                    {risk && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${riskBarColor[risk.risk_level]}`}
                            style={{ width: `${Math.round(risk.risk_score * 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">
                          {Math.round(risk.risk_score * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Runs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Runs</h2>
            <Link href="/pipelines" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          {recentRuns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No runs yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentRuns.map(r => {
                const p = pipelines.find(p => p.id === r.pipeline_id);
                const { category } = parseRootCause(r.root_cause);
                return (
                  <div key={r.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot[r.status] || "bg-gray-500"}`} />
                    <span className="text-xs text-gray-400 font-mono shrink-0">#{r.id}</span>
                    <span className="text-sm text-white flex-1 truncate">{p?.name || "—"}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[r.status]}`}>
                      {r.status}
                    </span>
                    {r.root_cause && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${categoryStyle[category] || categoryStyle.unknown}`}>
                        {category.replace("_", " ")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Failure Categories */}
        {stats && Object.keys(stats.failure_categories).length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Failure Categories</h2>
              <Link href="/analytics" className="text-xs text-blue-400 hover:text-blue-300">
                Analytics →
              </Link>
            </div>
            <div className="space-y-3">
              {Object.entries(stats.failure_categories).map(([cat, count]) => {
                const total = Object.values(stats.failure_categories).reduce((a, b) => a + b, 0);
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-300 capitalize">{cat.replace("_", " ")}</span>
                      <span className="text-xs text-gray-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          cat === "infrastructure" ? "bg-purple-500" :
                          cat === "test_failure"   ? "bg-red-500" :
                          cat === "build_failure"  ? "bg-yellow-500" :
                          cat === "dependency"     ? "bg-orange-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Healing Activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Healing Activity</h2>
            <Link href="/healing" className="text-xs text-blue-400 hover:text-blue-300">
              View all →
            </Link>
          </div>
          {healingLogs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No healing actions yet.</p>
              <p className="text-gray-600 text-xs mt-1">Enable auto-heal on a pipeline to start.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {healingLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${healingActionStyle[log.action]}`}>
                    {log.action.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400 flex-1 truncate">{log.reason}</span>
                  <span className="text-xs text-gray-600 shrink-0">
                    Run #{log.run_id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}