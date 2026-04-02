"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPipelines, getRuns, getStats, getAllRisks, getAllHealingLogs,
  Pipeline, PipelineRun, DashboardStats, RiskAssessment, HealingLog,
} from "@/lib/api";

function parseCategory(rc: string | null) {
  if (!rc) return "unknown";
  const m = rc.match(/^\[([^\]]+)\]/);
  return m ? m[1].toLowerCase() : "unknown";
}

const riskColor = (level: string) => ({
  low: "#22c55e", medium: "#eab308", high: "#f97316", critical: "#ef4444"
}[level] || "#64748b");

const statusColor = (s: string) => ({
  success: "#22c55e", failed: "#ef4444", running: "#3b82f6", pending: "#eab308"
}[s] || "#64748b");

const catColor = (c: string) => ({
  test_failure: "#ef4444", dependency: "#f97316", build_failure: "#eab308",
  infrastructure: "#8b5cf6", code_quality: "#3b82f6", unknown: "#64748b",
}[c] || "#64748b");

export default function DashboardPage() {
  const router = useRouter();
  const [pipelines,    setPipelines]    = useState<Pipeline[]>([]);
  const [runs,         setRuns]         = useState<PipelineRun[]>([]);
  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [risks,        setRisks]        = useState<Record<number, RiskAssessment>>({});
  const [healingLogs,  setHealingLogs]  = useState<HealingLog[]>([]);
  const [loading,      setLoading]      = useState(true);

  const fetchAll = async () => {
    try {
      const [p, r, s, riskList, hl] = await Promise.all([
        getPipelines(), getRuns(), getStats(), getAllRisks(), getAllHealingLogs(),
      ]);
      setPipelines(p); setRuns(r); setStats(s); setHealingLogs(hl);
      const rm: Record<number, RiskAssessment> = {};
      riskList.forEach(ra => { rm[ra.pipeline_id] = ra; });
      setRisks(rm);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 10000);
    return () => clearInterval(i);
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "32px", height: "32px", border: "3px solid #1e3a5f", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748b", fontSize: "13px" }}>Loading dashboard...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const criticalPipelines = pipelines.filter(p => {
    const r = risks[p.id];
    return r && (r.risk_level === "critical" || r.risk_level === "high");
  });

  const healedCount = healingLogs.filter(h => h.result === "retry_succeeded").length;
  const recentRuns  = runs.slice(0, 6);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

      {/* ── Welcome + key metrics ─────────────────────────── */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "600", color: "#e2e8f0", marginBottom: "4px" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"} 👋
        </h1>
        <p style={{ fontSize: "13px", color: "#64748b" }}>
          Here's what's happening with your pipelines right now.
        </p>
      </div>

      {/* Stats cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Pipelines",    value: stats?.total_pipelines ?? 0,           sub: "connected",         color: "#3b82f6", icon: "⟳" },
          { label: "Success Rate", value: `${stats?.success_rate ?? 0}%`,         sub: "last 50 runs",      color: "#22c55e", icon: "✓" },
          { label: "Auto-Healed",  value: healedCount,                            sub: "issues resolved",   color: "#8b5cf6", icon: "✦" },
          { label: "Avg Duration", value: `${stats?.avg_duration_seconds ?? 0}s`, sub: "per pipeline run",  color: "#f59e0b", icon: "◷" },
        ].map(card => (
          <div key={card.label} style={{
            background: "#0d1117", border: "1px solid #1a2030",
            borderRadius: "12px", padding: "16px 18px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>{card.label}</span>
              <span style={{ fontSize: "18px", color: card.color, opacity: 0.8 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: "26px", fontWeight: "700", color: card.color, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: "11px", color: "#475569", marginTop: "4px" }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Alerts: high risk pipelines ───────────────────── */}
      {criticalPipelines.length > 0 && (
        <div style={{
          background: "#1a0f0f", border: "1px solid #7f1d1d",
          borderRadius: "12px", padding: "14px 18px", marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ color: "#ef4444", fontSize: "14px" }}>⚠</span>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#fca5a5" }}>
              {criticalPipelines.length} pipeline{criticalPipelines.length > 1 ? "s" : ""} need attention
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {criticalPipelines.map(p => {
              const risk = risks[p.id];
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}
                  onClick={() => router.push(`/pipelines/${p.id}`)}
                  className="cursor-pointer">
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: riskColor(risk.risk_level), flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: "#e2e8f0", flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: "12px", color: riskColor(risk.risk_level), fontWeight: "600" }}>
                    {Math.round(risk.risk_score * 100)}% risk
                  </span>
                  <span style={{ fontSize: "11px", color: "#7f1d1d", textDecoration: "underline", cursor: "pointer" }}>View →</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Two column: Pipeline health + Recent runs ──────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

        {/* Pipeline health */}
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1a2030", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>Pipeline health</span>
            <button onClick={() => router.push("/pipelines")} style={{ fontSize: "11px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          <div style={{ padding: "6px 0" }}>
            {pipelines.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                No pipelines yet —{" "}
                <button onClick={() => router.push("/pipelines")} style={{ color: "#3b82f6", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  create one
                </button>
              </div>
            ) : pipelines.slice(0, 6).map(p => {
              const risk = risks[p.id];
              const riskPct = risk ? Math.round(risk.risk_score * 100) : 0;
              return (
                <div key={p.id}
                  onClick={() => router.push(`/pipelines/${p.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#131920")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor(p.last_status || ""), flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: "11px", color: "#475569", flexShrink: 0 }}>{p.run_count} runs</span>
                  {risk && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      <div style={{ width: "40px", height: "3px", background: "#1e2a3a", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ width: `${riskPct}%`, height: "100%", background: riskColor(risk.risk_level), borderRadius: "2px" }} />
                      </div>
                      <span style={{ fontSize: "11px", color: riskColor(risk.risk_level), fontWeight: "600", minWidth: "30px" }}>{riskPct}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent runs */}
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1a2030", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>Recent runs</span>
            <button onClick={() => router.push("/pipelines")} style={{ fontSize: "11px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          <div style={{ padding: "6px 0" }}>
            {recentRuns.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>No runs yet</div>
            ) : recentRuns.map(r => {
              const pipeline = pipelines.find(p => p.id === r.pipeline_id);
              const cat = parseCategory(r.root_cause);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px" }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor(r.status), flexShrink: 0 }} />
                  <span style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace", flexShrink: 0 }}>#{r.id}</span>
                  <span style={{ fontSize: "13px", color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pipeline?.name || `Pipeline #${r.pipeline_id}`}
                  </span>
                  {r.root_cause && (
                    <span style={{
                      fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
                      background: catColor(cat) + "20", color: catColor(cat),
                      flexShrink: 0, fontWeight: "500",
                    }}>{cat.replace("_", " ")}</span>
                  )}
                  <span style={{ fontSize: "11px", color: statusColor(r.status), flexShrink: 0, fontWeight: "600" }}>{r.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Failure breakdown + Healing summary ───────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Failure breakdown */}
        {stats && Object.keys(stats.failure_categories).length > 0 && (
          <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "12px", padding: "16px 18px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0", marginBottom: "14px" }}>Failure breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(stats.failure_categories)
                .sort(([,a],[,b]) => b - a)
                .map(([cat, count]) => {
                  const total = Object.values(stats.failure_categories).reduce((a, b) => a + b, 0);
                  const pct = Math.round((count / total) * 100);
                  const color = catColor(cat);
                  return (
                    <div key={cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "capitalize" }}>{cat.replace("_", " ")}</span>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: "4px", background: "#1e2a3a", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "2px" }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Healing summary */}
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>Healing activity</span>
            <button onClick={() => router.push("/healing")} style={{ fontSize: "11px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          {healingLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#64748b", fontSize: "13px" }}>
              No healing events yet.
              <br />
              <span style={{ fontSize: "11px" }}>Enable auto-heal on a pipeline to start.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {healingLogs.slice(0, 5).map(log => (
                <div key={log.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "4px", flexShrink: 0,
                    background: log.action === "retry" ? "#1e3a5f" : log.action === "rollback" ? "#3b0a0a" : "#1a1a00",
                    color: log.action === "retry" ? "#60a5fa" : log.action === "rollback" ? "#f87171" : "#facc15",
                    fontWeight: "600", textTransform: "uppercase",
                  }}>{log.action}</span>
                  <span style={{ fontSize: "12px", color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.reason}
                  </span>
                  <span style={{
                    fontSize: "11px", flexShrink: 0, fontWeight: "600",
                    color: log.result === "retry_succeeded" ? "#22c55e" : log.result === "retry_failed" ? "#ef4444" : "#eab308",
                  }}>
                    {log.result === "retry_succeeded" ? "✓ Healed" : log.result === "retry_failed" ? "✗ Failed" : "●"}
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