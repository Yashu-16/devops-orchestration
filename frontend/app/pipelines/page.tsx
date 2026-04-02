"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPipelines, createPipeline, deletePipeline, triggerRun,
  getRuns, getStats, getAllRisks,
  Pipeline, PipelineRun, DashboardStats, RiskAssessment,
} from "@/lib/api";

const statusColor = (s: string) => ({
  success: "#22c55e", failed: "#ef4444", running: "#3b82f6", pending: "#eab308"
}[s] || "#64748b");

const riskColor = (level: string) => ({
  low: "#22c55e", medium: "#eab308", high: "#f97316", critical: "#ef4444"
}[level] || "#64748b");

const riskBg = (level: string) => ({
  low: "#052e16", medium: "#1c1500", high: "#1c0a00", critical: "#1a0000"
}[level] || "#0d1117");

export default function PipelinesPage() {
  const router = useRouter();
  const [pipelines,  setPipelines]  = useState<Pipeline[]>([]);
  const [runs,       setRuns]       = useState<PipelineRun[]>([]);
  const [stats,      setStats]      = useState<DashboardStats | null>(null);
  const [risks,      setRisks]      = useState<Record<number, RiskAssessment>>({});
  const [loading,    setLoading]    = useState(true);
  const [triggering, setTriggering] = useState<number | null>(null);
  const [deleting,   setDeleting]   = useState<number | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState<"all"|"failed"|"success">("all");
  const [form, setForm] = useState({ name: "", description: "", repository: "", branch: "main" });

  const fetchAll = async () => {
    try {
      const [p, r, s, riskList] = await Promise.all([
        getPipelines(), getRuns(), getStats(), getAllRisks(),
      ]);
      setPipelines(p); setRuns(r); setStats(s);
      const rm: Record<number, RiskAssessment> = {};
      riskList.forEach(ra => { rm[ra.pipeline_id] = ra; });
      setRisks(rm);
      setError(null);
    } catch { setError("Cannot connect to backend."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 8000);
    return () => clearInterval(i);
  }, []);

  const handleTrigger = async (id: number) => {
    setTriggering(id);
    try { await triggerRun(id); await fetchAll(); }
    catch { setError("Failed to trigger run."); }
    finally { setTriggering(null); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" and all its run history? This cannot be undone.`)) return;
    setDeleting(id);
    try { await deletePipeline(id); await fetchAll(); }
    catch (e: any) { setError(e?.response?.data?.detail || "Failed to delete pipeline."); }
    finally { setDeleting(null); }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createPipeline(form);
      setForm({ name: "", description: "", repository: "", branch: "main" });
      setShowForm(false);
      await fetchAll();
    } catch { setError("Failed to create pipeline."); }
  };

  const filteredPipelines = pipelines.filter(p => {
    if (filter === "all") return true;
    return p.last_status === filter;
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px" }}>
      <div style={{ width: "28px", height: "28px", border: "3px solid #1e3a5f", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "18px", fontWeight: "600", color: "#e2e8f0", marginBottom: "2px" }}>Pipelines</h1>
          <p style={{ fontSize: "12px", color: "#64748b" }}>
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} · {stats?.total_runs ?? 0} total runs
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          background: "#1d4ed8", color: "white", border: "none",
          borderRadius: "8px", padding: "8px 16px", fontSize: "13px",
          fontWeight: "500", cursor: "pointer",
        }}>+ New Pipeline</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#1a0f0f", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "13px", color: "#fca5a5" }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "16px" }}>✕</button>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total Runs",   value: stats.total_runs,                 color: "#3b82f6" },
            { label: "Success Rate", value: `${stats.success_rate}%`,         color: "#22c55e" },
            { label: "Failed Runs",  value: stats.failed_runs,                color: "#ef4444" },
            { label: "Avg Duration", value: `${stats.avg_duration_seconds}s`, color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>{s.label}</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "#0d1117", border: "1px solid #1a2030", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
        {(["all", "success", "failed"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: "500",
            border: "none", cursor: "pointer", transition: "all 0.15s",
            background: filter === f ? "#1e2a3a" : "transparent",
            color: filter === f ? "#e2e8f0" : "#64748b",
            textTransform: "capitalize",
          }}>{f === "all" ? `All (${pipelines.length})` : f === "success" ? `Passing (${pipelines.filter(p => p.last_status === "success").length})` : `Failing (${pipelines.filter(p => p.last_status === "failed").length})`}</button>
        ))}
      </div>

      {/* Pipelines list */}
      {filteredPipelines.length === 0 ? (
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: "12px", padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⟳</div>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "16px" }}>
            {pipelines.length === 0 ? "No pipelines yet. Create your first one." : "No pipelines match this filter."}
          </p>
          {pipelines.length === 0 && (
            <button onClick={() => setShowForm(true)} style={{
              background: "#1d4ed8", color: "white", border: "none",
              borderRadius: "8px", padding: "10px 20px", fontSize: "13px", cursor: "pointer",
            }}>Create your first pipeline</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredPipelines.map(p => {
            const risk   = risks[p.id];
            const riskPct = risk ? Math.round(risk.risk_score * 100) : 0;
            const pRuns  = runs.filter(r => r.pipeline_id === p.id).slice(0, 8).reverse();
            const isTriggering = triggering === p.id;
            const isDeleting   = deleting   === p.id;

            return (
              <div key={p.id} style={{
                background: "#0d1117",
                border: `1px solid ${p.last_status === "failed" ? "#3b0a0a" : "#1a2030"}`,
                borderRadius: "12px", padding: "16px 20px",
                transition: "border-color 0.15s",
              }}>

                {/* Row 1: name + status + risk */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor(p.last_status || ""), flexShrink: 0 }} />
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#e2e8f0" }}>{p.name}</span>
                      {p.last_status && (
                        <span style={{
                          fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                          background: statusColor(p.last_status) + "20", color: statusColor(p.last_status),
                          fontWeight: "600",
                        }}>{p.last_status}</span>
                      )}
                      {p.self_heal_enabled && (
                        <span style={{
                          fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                          background: "#052e16", color: "#4ade80", fontWeight: "500",
                        }}>Auto-Heal ON</span>
                      )}
                    </div>
                    <div style={{ marginLeft: "18px", marginTop: "3px" }}>
                      <span style={{ fontSize: "11px", color: "#475569" }}>
                        {p.repository ? `${p.repository.replace("https://github.com/", "gh/")} · ` : ""}
                        {p.branch} · {p.run_count} runs
                      </span>
                    </div>
                  </div>

                  {/* Risk indicator */}
                  {risk && (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0,
                      background: riskBg(risk.risk_level), border: `1px solid ${riskColor(risk.risk_level)}30`,
                      borderRadius: "8px", padding: "6px 10px", minWidth: "80px",
                    }}>
                      <span style={{ fontSize: "17px", fontWeight: "700", color: riskColor(risk.risk_level) }}>{riskPct}%</span>
                      <span style={{ fontSize: "10px", color: riskColor(risk.risk_level), opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{risk.risk_level} risk</span>
                    </div>
                  )}
                </div>

                {/* Row 2: Run history sparkline */}
                {pRuns.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "12px", marginLeft: "18px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", marginRight: "4px" }}>history</span>
                    {pRuns.map(r => (
                      <div key={r.id}
                        title={`Run #${r.id}: ${r.status}`}
                        onClick={() => router.push(`/pipelines/${p.id}`)}
                        style={{
                          width: "12px", height: "12px", borderRadius: "3px", cursor: "pointer",
                          background: statusColor(r.status),
                          opacity: r.status === "running" ? 1 : 0.7,
                        }} />
                    ))}
                  </div>
                )}

                {/* Row 3: Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => handleTrigger(p.id)}
                    disabled={isTriggering}
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "7px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: "500",
                      background: isTriggering ? "#1e2a3a" : "#1d4ed8",
                      color: "white", border: "none", cursor: isTriggering ? "not-allowed" : "pointer",
                    }}>
                    {isTriggering ? (
                      <><span style={{ width: "10px", height: "10px", border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} /> Running...</>
                    ) : "▶ Run now"}
                  </button>

                  <button
                    onClick={() => router.push(`/pipelines/${p.id}`)}
                    style={{ padding: "7px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: "500", background: "#131920", border: "1px solid #1e2a3a", color: "#94a3b8", cursor: "pointer" }}>
                    View details
                  </button>

                  <div style={{ marginLeft: "auto" }}>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={isDeleting}
                      style={{ padding: "7px 12px", borderRadius: "7px", fontSize: "12px", background: "transparent", border: "1px solid #1e2a3a", color: "#475569", cursor: "pointer" }}>
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px" }}>
          <div style={{ background: "#0d1117", border: "1px solid #1e2a3a", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "440px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: "600", color: "#e2e8f0" }}>New Pipeline</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "18px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { label: "Pipeline name *", key: "name",        placeholder: "Backend Deploy" },
                { label: "Description",     key: "description", placeholder: "What does this pipeline do?" },
                { label: "Repository URL",  key: "repository",  placeholder: "https://github.com/org/repo.git" },
                { label: "Branch",          key: "branch",      placeholder: "main" },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "5px", fontWeight: "500" }}>{field.label}</label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    style={{
                      width: "100%", background: "#131920", border: "1px solid #1e2a3a",
                      borderRadius: "8px", padding: "9px 12px", fontSize: "13px",
                      color: "#e2e8f0", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button onClick={handleCreate} style={{
                flex: 1, background: "#1d4ed8", color: "white", border: "none",
                borderRadius: "8px", padding: "10px", fontSize: "13px", fontWeight: "500", cursor: "pointer",
              }}>Create Pipeline</button>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, background: "#131920", border: "1px solid #1e2a3a", color: "#94a3b8",
                borderRadius: "8px", padding: "10px", fontSize: "13px", cursor: "pointer",
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}