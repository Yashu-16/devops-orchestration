"use client";

import { useEffect, useState } from "react";
import {
  getPipelines, createPipeline, deletePipeline,
  triggerRun, getRuns, getRunStages, getStats,
  getAllRisks, getPipelineRecs, updateHealingConfig,
  getHealingLogs,
  Pipeline, PipelineRun, StageLog,
  RiskAssessment, RecommendationReport, HealingLog,
} from "@/lib/api";

const statusStyle: Record<string, string> = {
  success:   "bg-green-900 text-green-300 border border-green-700",
  failed:    "bg-red-900 text-red-300 border border-red-700",
  running:   "bg-blue-900 text-blue-300 border border-blue-700",
  pending:   "bg-yellow-900 text-yellow-300 border border-yellow-700",
  passed:    "bg-green-900 text-green-300 border border-green-700",
};
const statusDot: Record<string, string> = {
  success: "bg-green-400", failed: "bg-red-400",
  running: "bg-blue-400 animate-pulse", pending: "bg-yellow-400",
  passed: "bg-green-400",
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
const riskStyle: Record<string, string> = {
  low:      "bg-green-900 text-green-300 border border-green-700",
  medium:   "bg-yellow-900 text-yellow-300 border border-yellow-700",
  high:     "bg-orange-900 text-orange-300 border border-orange-700",
  critical: "bg-red-900 text-red-300 border border-red-700",
};
const riskBarColor: Record<string, string> = {
  low: "bg-green-500", medium: "bg-yellow-500",
  high: "bg-orange-500", critical: "bg-red-500",
};
const priorityStyle: Record<string, string> = {
  P1: "bg-red-900 text-red-300 border border-red-700",
  P2: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  P3: "bg-gray-800 text-gray-400 border border-gray-600",
};
const impactStyle: Record<string, string> = {
  critical: "text-red-400", high: "text-orange-400",
  medium: "text-yellow-400", low: "text-gray-400",
};
const healingActionStyle: Record<string, string> = {
  retry:    "bg-blue-900 text-blue-300 border border-blue-700",
  rollback: "bg-red-900 text-red-300 border border-red-700",
  alert:    "bg-yellow-900 text-yellow-300 border border-yellow-700",
  skipped:  "bg-gray-800 text-gray-400 border border-gray-600",
};
const healingResultStyle: Record<string, string> = {
  retry_succeeded: "text-green-400", retry_failed: "text-red-400",
  retry_error: "text-red-400", manual_mode: "text-gray-500", pending: "text-yellow-400",
};

function parseRootCause(rc: string | null) {
  if (!rc) return { category: "unknown", explanation: "" };
  const bracket = rc.indexOf("]");
  if (rc.startsWith("[") && bracket > 0) {
    const category = rc.slice(1, bracket).toLowerCase();
    const explanation = rc.slice(bracket + 1).trim();
    return { category, explanation };
  }
  return { category: "unknown", explanation: rc };
}

// ── Stage Panel ───────────────────────────────────────────────────
function StagePanel({ run, onClose }: { run: PipelineRun; onClose: () => void }) {
  const [stages, setStages]     = useState<StageLog[]>(run.stage_logs || []);
  const [selected, setSelected] = useState<StageLog | null>(null);
  const [loading, setLoading]   = useState(false);
  const { category, explanation } = parseRootCause(run.root_cause);

  useEffect(() => {
    if (run.stage_logs?.length > 0) { setStages(run.stage_logs); return; }
    setLoading(true);
    getRunStages(run.id).then(setStages).finally(() => setLoading(false));
  }, [run.id]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white">Run #{run.id}</h3>
              {run.is_retry && (
                <span className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full">
                  Auto-Retry #{run.retry_count}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
              {run.git_commit && <span>commit: <span className="font-mono text-gray-400">{run.git_commit}</span></span>}
              {run.git_author && <span>by {run.git_author}</span>}
              {run.environment && <span className="capitalize">{run.environment}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        {run.status === "failed" && run.root_cause && (
          <div className="mx-4 mt-3 rounded-lg border border-red-800 bg-red-950 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-red-400 text-xs font-bold uppercase">Root Cause</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryStyle[category]}`}>
                {category.replace("_", " ")}
              </span>
            </div>
            <p className="text-red-200 text-xs leading-relaxed">{explanation}</p>
            {run.recommendation && (
              <div className="mt-2 pt-2 border-t border-red-800">
                <p className="text-xs text-red-400 font-medium mb-1">Suggestion</p>
                <p className="text-red-300 text-xs leading-relaxed">{run.recommendation}</p>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-1 overflow-hidden mt-3">
          <div className="w-56 border-r border-gray-800 overflow-y-auto p-3 space-y-1 shrink-0">
            {loading && <p className="text-gray-500 text-xs p-2">Loading...</p>}
            {stages.map(s => (
              <button key={s.id} onClick={() => setSelected(s)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selected?.id === s.id ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-800"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.passed ? "bg-green-400" : "bg-red-400"}`} />
                  <span className="font-medium truncate">{s.name}</span>
                </div>
                <div className="ml-4 text-gray-600 mt-0.5">{s.duration_seconds}s</div>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!selected
              ? <div className="h-full flex items-center justify-center text-gray-600 text-sm">Select a stage</div>
              : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[selected.status]}`}>{selected.status}</span>
                    <span className="text-gray-400 text-xs">{selected.duration_seconds}s</span>
                  </div>
                  {selected.output && <div><p className="text-xs text-gray-500 mb-1">Output</p><pre className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 font-mono whitespace-pre-wrap">{selected.output}</pre></div>}
                  {selected.error_output && <div><p className="text-xs text-red-500 mb-1">Error</p><pre className="bg-red-950 border border-red-900 rounded-lg p-3 text-xs text-red-300 font-mono whitespace-pre-wrap">{selected.error_output}</pre></div>}
                </div>
              )}
          </div>
        </div>
        {stages.length > 0 && (
          <div className="border-t border-gray-800 px-5 py-3">
            <div className="flex gap-1 h-4">
              {stages.map(s => {
                const total = stages.reduce((a, b) => a + (b.duration_seconds || 0), 0);
                const width = total > 0 ? ((s.duration_seconds || 0) / total) * 100 : 0;
                return <div key={s.id} title={`${s.name}: ${s.duration_seconds}s`}
                  style={{ width: `${width}%` }} className={`rounded-sm ${s.passed ? "bg-green-700" : "bg-red-700"}`} />;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recommendations Panel ─────────────────────────────────────────
function RecommendationsPanel({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  const [report, setReport]     = useState<RecommendationReport | null>(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getPipelineRecs(pipeline.id).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [pipeline.id]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-white">Recommendations</h3>
            <p className="text-xs text-gray-500 mt-0.5">{pipeline.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}
          {!loading && !report && <div className="text-center py-12"><p className="text-gray-500 text-sm">No recommendations yet.</p></div>}
          {!loading && report && (
            <div className="space-y-4">
              <div className={`rounded-lg px-4 py-3 ${report.p1_count > 0 ? "bg-red-950 border border-red-800" : "bg-blue-950 border border-blue-800"}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${report.p1_count > 0 ? "text-red-300" : "text-blue-300"}`}>{report.summary}</p>
                  <div className="flex gap-2 ml-3">
                    {report.p1_count > 0 && <span className="text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">{report.p1_count} P1</span>}
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{report.total_count} total</span>
                  </div>
                </div>
              </div>
              {report.recommendations.map(rec => (
                <div key={rec.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                  <button onClick={() => setExpanded(expanded === rec.id ? null : rec.id)} className="w-full text-left px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${priorityStyle[rec.priority]}`}>{rec.priority}</span>
                          <span className={`text-xs font-medium ${impactStyle[rec.impact]}`}>{rec.impact} impact</span>
                          <span className="text-xs text-gray-600">~{rec.effort}</span>
                        </div>
                        <p className="text-sm font-medium text-white mt-1.5">{rec.title}</p>
                      </div>
                      <span className="text-gray-500 text-xs mt-1">{expanded === rec.id ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {expanded === rec.id && (
                    <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
                      <p className="text-xs text-gray-400 leading-relaxed">{rec.description}</p>
                      <ol className="space-y-1.5">
                        {rec.action_steps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-300">
                            <span className="text-blue-500 font-mono shrink-0">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Healing Panel ─────────────────────────────────────────────────
function HealingPanel({ pipeline, onClose, onConfigChange }: {
  pipeline: Pipeline; onClose: () => void; onConfigChange: () => void;
}) {
  const [logs, setLogs]             = useState<HealingLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [enabled, setEnabled]       = useState(pipeline.self_heal_enabled);
  const [maxRetries, setMaxRetries] = useState(pipeline.max_retries);
  const [saveError, setSaveError]   = useState<string | null>(null);

  useEffect(() => {
    getHealingLogs(pipeline.id).then(setLogs).finally(() => setLoading(false));
  }, [pipeline.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateHealingConfig(pipeline.id, { self_heal_enabled: enabled, max_retries: maxRetries });
      onConfigChange();
      onClose();
    } catch (err: any) {
      setSaveError(err?.response?.data?.detail || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-white">Self-Healing — {pipeline.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {saveError && <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-xs">⚠️ {saveError}</div>}
          <div className="bg-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Auto-Heal Mode</p>
                <p className="text-xs text-gray-500">Retry transient failures automatically</p>
              </div>
              <button onClick={() => setEnabled(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-green-600" : "bg-gray-600"}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Max Retries</p>
                <p className="text-xs text-gray-500">Before escalating to rollback</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMaxRetries(Math.max(1, maxRetries - 1))} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">-</button>
                <span className="text-white font-mono w-6 text-center">{maxRetries}</span>
                <button onClick={() => setMaxRetries(Math.min(5, maxRetries + 1))} className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">+</button>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-sm py-2 rounded-lg">
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Audit Trail</h4>
            {loading && <div className="text-center py-4"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>}
            {!loading && logs.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No healing actions yet.</p>}
            {!loading && logs.length > 0 && (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${healingActionStyle[log.action]}`}>{log.action.toUpperCase()}</span>
                      </div>
                      <span className={`text-xs font-medium ${healingResultStyle[log.result || "pending"]}`}>
                        {log.result?.replace("_", " ") || "pending"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{log.reason}</p>
                    <p className="text-xs text-gray-600 mt-1">Run #{log.run_id} · {new Date(log.created_at).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Risk Modal ────────────────────────────────────────────────────
function RiskModal({ assessment, pipelineName, onClose, onRun }: {
  assessment: RiskAssessment; pipelineName: string; onClose: () => void; onRun: () => void;
}) {
  const pct = Math.round(assessment.risk_score * 100);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div><h3 className="font-semibold text-white">Risk Assessment</h3><p className="text-xs text-gray-500">{pipelineName}</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-center">
            <div className={`text-5xl font-bold mb-1 ${pct >= 75 ? "text-red-400" : pct >= 50 ? "text-orange-400" : pct >= 25 ? "text-yellow-400" : "text-green-400"}`}>{pct}%</div>
            <p className="text-gray-400 text-sm">Predicted failure probability</p>
            <div className="mt-3 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${riskBarColor[assessment.risk_level]}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${riskStyle[assessment.risk_level]}`}>{assessment.risk_level.toUpperCase()} RISK</span>
              <span className="text-gray-600 text-xs">{Math.round(assessment.confidence * 100)}% confidence · {assessment.based_on_runs} runs</span>
            </div>
          </div>
          <div className="space-y-2">
            {assessment.factors.map(f => (
              <div key={f.name} className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-300">{f.name}</span>
                  <span className={`text-xs font-bold ${f.score >= 0.7 ? "text-red-400" : f.score >= 0.4 ? "text-yellow-400" : "text-green-400"}`}>{Math.round(f.score * 100)}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${f.score >= 0.7 ? "bg-red-500" : f.score >= 0.4 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${f.score * 100}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{f.description}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { onClose(); onRun(); }}
              className={`flex-1 text-sm py-2 rounded-lg font-medium text-white ${assessment.risk_level === "critical" ? "bg-red-700" : assessment.risk_level === "high" ? "bg-orange-700" : "bg-blue-600"}`}>
              Run Pipeline
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-800 text-sm py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Pipelines Page ───────────────────────────────────────────
export default function PipelinesPage() {
  const [pipelines, setPipelines]         = useState<Pipeline[]>([]);
  const [runs, setRuns]                   = useState<PipelineRun[]>([]);
  const [risks, setRisks]                 = useState<Record<number, RiskAssessment>>({});
  const [loading, setLoading]             = useState(true);
  const [triggering, setTriggering]       = useState<number | null>(null);
  const [showForm, setShowForm]           = useState(false);
  const [selectedRun, setSelectedRun]     = useState<PipelineRun | null>(null);
  const [selectedRisk, setSelectedRisk]   = useState<{ assessment: RiskAssessment; pipeline: Pipeline } | null>(null);
  const [selectedRecs, setSelectedRecs]   = useState<Pipeline | null>(null);
  const [selectedHealing, setSelectedHealing] = useState<Pipeline | null>(null);
  const [pendingRunId, setPendingRunId]   = useState<number | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", repository: "", branch: "main" });

  const fetchAll = async () => {
    try {
      const [p, r, riskList] = await Promise.all([getPipelines(), getRuns(), getAllRisks()]);
      setPipelines(p); setRuns(r);
      const rm: Record<number, RiskAssessment> = {};
      riskList.forEach(ra => { rm[ra.pipeline_id] = ra; });
      setRisks(rm);
      setError(null);
    } catch { setError("Cannot reach backend."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 5000); return () => clearInterval(i); }, []);

  const handleRunClick = (pipeline: Pipeline) => {
    const assessment = risks[pipeline.id];
    if (assessment && assessment.based_on_runs >= 2) {
      setSelectedRisk({ assessment, pipeline }); setPendingRunId(pipeline.id);
    } else { handleTrigger(pipeline.id); }
  };

  const handleTrigger = async (id: number) => {
    setTriggering(id);
    try { await triggerRun(id); await fetchAll(); }
    catch { setError("Failed to trigger pipeline."); }
    finally { setTriggering(null); }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try { await createPipeline(form); setForm({ name: "", description: "", repository: "", branch: "main" }); setShowForm(false); await fetchAll(); }
    catch { setError("Failed to create pipeline."); }
  };

  const handleDelete = async (id: number) => {
    try { await deletePipeline(id); await fetchAll(); }
    catch { setError("Failed to delete."); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} · {runs.length} total runs</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 text-xs font-medium px-4 py-2 rounded-lg">
          + New Pipeline
        </button>
      </div>

      {/* Pipelines */}
      {pipelines.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <p className="text-4xl mb-4">⚙</p>
          <p className="text-white font-medium mb-2">No pipelines yet</p>
          <p className="text-gray-500 text-sm mb-6">Create your first pipeline to get started</p>
          <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-lg text-sm font-medium">
            Create Pipeline
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pipelines.map(p => {
            const risk = risks[p.id];
            const pipelineRuns = runs.filter(r => r.pipeline_id === p.id).slice(0, 10);
            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white">{p.name}</h3>
                      {p.last_status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[p.last_status]}`}>
                          {p.last_status}
                        </span>
                      )}
                      {p.self_heal_enabled && (
                        <span className="text-xs bg-green-900 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                          Auto-heal ON
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs">{p.description || "No description"} · {p.branch} · {p.run_count} runs</p>

                    {/* Mini run history */}
                    {pipelineRuns.length > 0 && (
                      <div className="flex items-center gap-1 mt-3">
                        {pipelineRuns.slice(0, 15).reverse().map(r => (
                          <div key={r.id} title={`Run #${r.id}: ${r.status}`}
                            className={`w-2 h-5 rounded-sm cursor-pointer ${
                              r.status === "success" ? "bg-green-600 hover:bg-green-500" :
                              r.status === "failed"  ? "bg-red-600 hover:bg-red-500" : "bg-gray-600"
                            }`}
                            onClick={() => setSelectedRun(r)}
                          />
                        ))}
                        <span className="text-gray-600 text-xs ml-2">recent runs</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    {/* Risk */}
                    {risk && (
                      <button onClick={() => setSelectedRisk({ assessment: risk, pipeline: p })}
                        className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${riskBarColor[risk.risk_level]}`}
                            style={{ width: `${Math.round(risk.risk_score * 100)}%` }} />
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${riskStyle[risk.risk_level]}`}>
                          {Math.round(risk.risk_score * 100)}% risk
                        </span>
                      </button>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRunClick(p)} disabled={triggering === p.id}
                        className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors disabled:bg-gray-700 ${
                          risk?.risk_level === "critical" ? "bg-red-700 hover:bg-red-600" :
                          risk?.risk_level === "high" ? "bg-orange-700 hover:bg-orange-600" :
                          "bg-blue-600 hover:bg-blue-700"
                        }`}>
                        {triggering === p.id
                          ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running</>
                          : "▶ Run"}
                      </button>
                      <button onClick={() => setSelectedRecs(p)} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">💡 Recs</button>
                      <button onClick={() => setSelectedHealing(p)} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">🔧 Heal</button>
                      <button onClick={() => handleDelete(p.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900 text-gray-500 hover:text-red-400">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Runs Table */}
      {runs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">All Runs</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Run</th>
                <th className="text-left px-4 py-3">Pipeline</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Env</th>
                <th className="text-left px-4 py-3">Stages</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Root Cause</th>
                <th className="text-left px-4 py-3">Logs</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const pipeline = pipelines.find(p => p.id === r.pipeline_id);
                const { category } = parseRootCause(r.root_cause);
                return (
                  <tr key={r.id} className={`border-b border-gray-800 last:border-0 hover:bg-gray-800/40 ${r.is_retry ? "bg-blue-950/20" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="text-gray-500">#{r.id}</span>
                      {r.is_retry && <span className="ml-1 text-blue-400">↺</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-xs">{pipeline?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${statusDot[r.status] || "bg-gray-500"}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[r.status]}`}>{r.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs capitalize">{r.environment || "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.stages_passed}/{r.stages_total}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.duration_seconds ? `${r.duration_seconds}s` : "—"}</td>
                    <td className="px-4 py-3">
                      {r.root_cause
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryStyle[category] || categoryStyle.unknown}`}>{category.replace("_", " ")}</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedRun(r)} className="text-blue-400 hover:text-blue-300 text-xs underline">Stages</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">Create New Pipeline</h3>
            <div className="space-y-3">
              {[
                { label: "Name", key: "name", placeholder: "Deploy Backend Service" },
                { label: "Description", key: "description", placeholder: "What does this pipeline do?" },
                { label: "Repository", key: "repository", placeholder: "github.com/org/repo" },
                { label: "Branch", key: "branch", placeholder: "main" },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
                  <input type="text" placeholder={field.placeholder}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate} className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm py-2 rounded-lg">Create</button>
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {selectedRun     && <StagePanel run={selectedRun} onClose={() => setSelectedRun(null)} />}
      {selectedRisk    && <RiskModal assessment={selectedRisk.assessment} pipelineName={selectedRisk.pipeline.name} onClose={() => setSelectedRisk(null)} onRun={() => pendingRunId !== null && handleTrigger(pendingRunId)} />}
      {selectedRecs    && <RecommendationsPanel pipeline={selectedRecs} onClose={() => setSelectedRecs(null)} />}
      {selectedHealing && <HealingPanel pipeline={selectedHealing} onClose={() => setSelectedHealing(null)} onConfigChange={fetchAll} />}
    </div>
  );
}