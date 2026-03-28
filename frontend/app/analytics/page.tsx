"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Legend,
} from "recharts";
import { getRuns, getStats, getPipelines, DashboardStats, PipelineRun, Pipeline } from "@/lib/api";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#8b5cf6", "#ec4899", "#3b82f6", "#6b7280"];

function parseRootCause(rc: string | null) {
  if (!rc) return "unknown";
  const bracket = rc.indexOf("]");
  if (rc.startsWith("[") && bracket > 0) {
    return rc.slice(1, bracket).toLowerCase();
  }
  return "unknown";
}

export default function AnalyticsPage() {
  const [runs, setRuns]         = useState<PipelineRun[]>([]);
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([getRuns(), getStats(), getPipelines()])
      .then(([r, s, p]) => { setRuns(r); setStats(s); setPipelines(p); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Prepare chart data ──────────────────────────────────────────

  // Success vs Failure over last 20 runs (grouped by 5)
  const trendData = (() => {
    const sorted = [...runs].reverse();
    const groups: { name: string; success: number; failed: number }[] = [];
    for (let i = 0; i < sorted.length; i += 3) {
      const chunk = sorted.slice(i, i + 3);
      groups.push({
        name: `Run ${i + 1}–${i + chunk.length}`,
        success: chunk.filter(r => r.status === "success").length,
        failed:  chunk.filter(r => r.status === "failed").length,
      });
    }
    return groups.slice(0, 8);
  })();

  // Duration trend
  const durationData = runs
    .filter(r => r.duration_seconds !== null)
    .slice(0, 15)
    .reverse()
    .map((r, i) => ({
      name: `#${r.id}`,
      duration: r.duration_seconds,
      status: r.status,
    }));

  // Failure category pie
  const categoryData = stats
    ? Object.entries(stats.failure_categories).map(([name, value], i) => ({
        name: name.replace("_", " "),
        value,
        color: COLORS[i % COLORS.length],
      }))
    : [];

  // Per-pipeline success rate
  const pipelineStats = pipelines.map(p => {
    const pRuns = runs.filter(r => r.pipeline_id === p.id);
    const success = pRuns.filter(r => r.status === "success").length;
    const rate = pRuns.length > 0 ? Math.round((success / pRuns.length) * 100) : 0;
    return { name: p.name, successRate: rate, totalRuns: pRuns.length };
  });

  const tooltipStyle = {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
    color: "#f9fafb",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Runs",    value: stats?.total_runs ?? 0,          color: "text-purple-400" },
          { label: "Successful",   value: stats?.successful_runs ?? 0,      color: "text-green-400"  },
          { label: "Failed",       value: stats?.failed_runs ?? 0,          color: "text-red-400"    },
          { label: "Success Rate", value: `${stats?.success_rate ?? 0}%`,   color: "text-blue-400"   },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Success vs Failure trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Success vs Failure Trend</h2>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Run some pipelines to see trends</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#9ca3af" }} />
                <Bar dataKey="success" fill="#22c55e" name="Success" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed"  fill="#ef4444" name="Failed"  radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Duration trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Pipeline Duration Trend</h2>
          {durationData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">No duration data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={durationData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} unit="s" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}s`, "Duration"]} />
                <Line type="monotone" dataKey="duration" stroke="#3b82f6" strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return <circle key={payload.name} cx={cx} cy={cy} r={4}
                      fill={payload.status === "failed" ? "#ef4444" : "#22c55e"} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-gray-600 mt-2">Green dots = success · Red dots = failure</p>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Failure category pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Failure Category Breakdown</h2>
          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">No failures recorded yet</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                    dataKey="value" paddingAngle={3}>
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {categoryData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-gray-300 capitalize flex-1">{entry.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Per-pipeline success rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Pipeline Success Rates</h2>
          {pipelineStats.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-500 text-sm">No pipelines yet</div>
          ) : (
            <div className="space-y-4">
              {pipelineStats.map(p => (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-300 truncate flex-1">{p.name}</span>
                    <span className={`text-xs font-bold ml-2 ${
                      p.successRate >= 80 ? "text-green-400" :
                      p.successRate >= 50 ? "text-yellow-400" : "text-red-400"
                    }`}>{p.successRate}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      p.successRate >= 80 ? "bg-green-500" :
                      p.successRate >= 50 ? "bg-yellow-500" : "bg-red-500"
                    }`} style={{ width: `${p.successRate}%` }} />
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{p.totalRuns} total runs</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Most failing stage */}
      {stats?.most_failing_stage && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-orange-400 text-xl">⚠</span>
            <div>
              <p className="text-orange-300 font-medium">
                Most Failing Stage: <span className="font-mono">{stats.most_failing_stage}</span>
              </p>
              <p className="text-orange-600 text-xs mt-0.5">
                This stage fails more than any other — investigate its configuration and dependencies.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}