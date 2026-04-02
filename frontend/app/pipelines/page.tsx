"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPipelines, createPipeline, deletePipeline,
  triggerRun, getRuns, getRunStages, getStats,
  getAllRisks, getPipelineRecs, updateHealingConfig,
  getHealingLogs, getAllHealingLogs,
  Pipeline, PipelineRun, StageLog,
  DashboardStats, RiskAssessment,
  RecommendationReport, HealingLog,
} from "@/lib/api";

// ── Style helpers ─────────────────────────────────────────────────

const statusStyle: Record<string, string> = {
  success:   "bg-green-900 text-green-300 border border-green-700",
  failed:    "bg-red-900 text-red-300 border border-red-700",
  running:   "bg-blue-900 text-blue-300 border border-blue-700",
  pending:   "bg-yellow-900 text-yellow-300 border border-yellow-700",
  cancelled: "bg-gray-800 text-gray-400 border border-gray-600",
  passed:    "bg-green-900 text-green-300 border border-green-700",
};
const statusDot: Record<string, string> = {
  success: "bg-green-400", failed: "bg-red-400",
  running: "bg-blue-400 animate-pulse", pending: "bg-yellow-400",
  passed:  "bg-green-400",
};
const categoryStyle: Record<string, string> = {
  test_failure:   "bg-red-900 text-red-300 border border-red-700",
  dependency:     "bg-orange-900 text-orange-300 border border-orange-700",
  build_failure:  "bg-yellow-900 text-yellow-300 border border-yellow-700",
  infrastructure: "bg-purple-900 text-purple-300 border border-purple-700",
  deployment:     "bg-pink-900 text-pink-300 border border-pink-700",
  code_quality:   "bg-blue-900 text-blue-300 border border-blue-700",
  authentication: "bg-red-900 text-red-300 border border-red-700",
  source_control: "bg-gray-800 text-gray-300 border border-gray-600",
  general:        "bg-gray-800 text-gray-300 border border-gray-600",
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
  retry_succeeded: "text-green-400",
  retry_failed:    "text-red-400",
  retry_error:     "text-red-400",
  manual_mode:     "text-gray-500",
  pending:         "text-yellow-400",
};

function parseRootCause(rc: string | null) {
  if (!rc) return { category: "unknown", explanation: "" };
  const m = rc.match(/^\[([^\]]+)\]\s*(.*)$/s);
  return m
    ? { category: m[1].toLowerCase(), explanation: m[2] }
    : { category: "unknown", explanation: rc };
}

// ── Healing Panel ─────────────────────────────────────────────────

function HealingPanel({
  pipeline, onClose, onConfigChange,
}: {
  pipeline: Pipeline;
  onClose: () => void;
  onConfigChange: () => void;
}) {
  const [logs, setLogs]             = useState<HealingLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [enabled, setEnabled]       = useState(pipeline.self_heal_enabled);
  const [maxRetries, setMaxRetries] = useState(pipeline.max_retries);
  const [saveError, setSaveError]   = useState<string | null>(null);

  useEffect(() => {
    getHealingLogs(pipeline.id)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [pipeline.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateHealingConfig(pipeline.id, {
        self_heal_enabled: enabled,
        max_retries: maxRetries,
      });
      onConfigChange();
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
            <h3 className="font-semibold text-white">Self-Healing</h3>
            <p className="text-xs text-gray-500 mt-0.5">{pipeline.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {saveError && (
            <div className="bg-red-950 border border-red-800 text-red-300 px-3 py-2 rounded-lg text-xs">
              ⚠️ {saveError}
            </div>
          )}

          <div className="bg-gray-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white mb-4">Configuration</h4>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-300">Auto-Heal Mode</p>
                <p className="text-xs text-gray-500 mt-0.5">Automatically retry or rollback on failure</p>
              </div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-green-600" : "bg-gray-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-300">Max Retries</p>
                <p className="text-xs text-gray-500 mt-0.5">Before escalating to rollback</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMaxRetries(Math.max(1, maxRetries - 1))}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">-</button>
                <span className="text-white font-mono w-6 text-center">{maxRetries}</span>
                <button onClick={() => setMaxRetries(Math.min(5, maxRetries + 1))}
                  className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold">+</button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-400 font-medium mb-2">Auto-retry applies to:</p>
              <div className="flex flex-wrap gap-1.5">
                {["infrastructure", "source_control", "unknown"].map(c => (
                  <span key={c} className={`text-xs px-2 py-0.5 rounded-full ${categoryStyle[c]}`}>
                    {c.replace("_", " ")}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Code failures (tests, lint, build) require a human fix.
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-sm py-2 rounded-lg transition-colors"
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Healing Audit Trail</h4>
            {loading && (
              <div className="text-center py-6">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            )}
            {!loading && logs.length === 0 && (
              <div className="bg-gray-800 rounded-xl p-6 text-center">
                <p className="text-gray-500 text-sm">No healing actions yet.</p>
              </div>
            )}
            {!loading && logs.length > 0 && (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${healingActionStyle[log.action]}`}>
                          {log.action.toUpperCase()}
                        </span>
                        {log.failure_category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryStyle[log.failure_category] || categoryStyle.unknown}`}>
                            {log.failure_category.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${healingResultStyle[log.result || "pending"]}`}>
                        {log.result?.replace("_", " ") || "pending"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mt-1">{log.reason}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span>Run #{log.run_id}</span>
                      {log.new_run_id && <span>→ Retry #{log.new_run_id}</span>}
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
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

// ── Recommendations Panel ─────────────────────────────────────────

function RecommendationsPanel({ pipeline, onClose }: { pipeline: Pipeline; onClose: () => void }) {
  const [report, setReport]     = useState<RecommendationReport | null>(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getPipelineRecs(pipeline.id)
      .then(setReport).catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [pipeline.id]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-white">Recommendations</h3>
            <p className="text-xs text-gray-500 mt-0.5">{pipeline.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && !report && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">No recommendations yet.</p>
            </div>
          )}
          {!loading && report && (
            <div className="space-y-4">
              <div className={`rounded-lg px-4 py-3 ${report.p1_count > 0 ? "bg-red-950 border border-red-800" : "bg-blue-950 border border-blue-800"}`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${report.p1_count > 0 ? "text-red-300" : "text-blue-300"}`}>
                    {report.summary}
                  </p>
                  <div className="flex gap-2 ml-3 shrink-0">
                    {report.p1_count > 0 && (
                      <span className="text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">
                        {report.p1_count} P1
                      </span>
                    )}
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {report.total_count} total
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Based on {report.generated_from}</p>
              </div>
              {report.recommendations.map(rec => (
                <div key={rec.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${priorityStyle[rec.priority]}`}>{rec.priority}</span>
                          <span className={`text-xs font-medium ${impactStyle[rec.impact]}`}>{rec.impact} impact</span>
                          <span className="text-xs text-gray-600">~{rec.effort}</span>
                          {rec.applies_to_stage && (
                            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded font-mono">
                              {rec.applies_to_stage}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-white mt-1.5">{rec.title}</p>
                      </div>
                      <span className="text-gray-500 text-xs mt-1 shrink-0">
                        {expanded === rec.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>
                  {expanded === rec.id && (
                    <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
                      <p className="text-xs text-gray-400 leading-relaxed">{rec.description}</p>
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wider">Action Steps</p>
                        <ol className="space-y-1.5">
                          {rec.action_steps.map((step, i) => (
                            <li key={i} className="flex gap-2 text-xs text-gray-300">
                              <span className="text-blue-500 font-mono shrink-0">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
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

// ── Risk Modal ────────────────────────────────────────────────────

function RiskModal({ assessment, pipelineName, onClose, onRun }: {
  assessment: RiskAssessment; pipelineName: string;
  onClose: () => void; onRun: () => void;
}) {
  const pct = Math.round(assessment.risk_score * 100);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h3 className="font-semibold text-white">Risk Assessment</h3>
            <p className="text-xs text-gray-500 mt-0.5">{pipelineName}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="text-center py-2">
            <div className={`text-5xl font-bold mb-1 ${pct >= 75 ? "text-red-400" : pct >= 50 ? "text-orange-400" : pct >= 25 ? "text-yellow-400" : "text-green-400"}`}>
              {pct}%
            </div>
            <p className="text-gray-400 text-sm">Predicted failure probability</p>
            <div className="mt-3 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${riskBarColor[assessment.risk_level]}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${riskStyle[assessment.risk_level]}`}>
                {assessment.risk_level.toUpperCase()} RISK
              </span>
              <span className="text-gray-600 text-xs">
                {Math.round(assessment.confidence * 100)}% confidence · {assessment.based_on_runs} runs
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Contributing Factors</p>
            <div className="space-y-2">
              {assessment.factors.map(f => (
                <div key={f.name} className="bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-300">{f.name}</span>
                    <span className={`text-xs font-bold ${f.score >= 0.7 ? "text-red-400" : f.score >= 0.4 ? "text-yellow-400" : "text-green-400"}`}>
                      {Math.round(f.score * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
                    <div className={`h-full rounded-full ${f.score >= 0.7 ? "bg-red-500" : f.score >= 0.4 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${f.score * 100}%` }} />
                  </div>
                  <p className="text-xs text-gray-500">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-blue-400 font-semibold mb-1">Recommendation</p>
            <p className="text-xs text-gray-300 leading-relaxed">{assessment.recommendation}</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => { onClose(); onRun(); }}
              className={`flex-1 text-sm py-2 rounded-lg font-medium text-white ${
                assessment.risk_level === "critical" ? "bg-red-700 hover:bg-red-600" :
                assessment.risk_level === "high"     ? "bg-orange-700 hover:bg-orange-600" :
                "bg-blue-600 hover:bg-blue-700"
              }`}>
              {assessment.risk_level === "critical" ? "Run Anyway (High Risk)" :
               assessment.risk_level === "high"     ? "Run (Review Recommended)" : "Run Pipeline"}
            </button>
            <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 rounded-lg">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
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
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
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
                  {selected.output && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Output</p>
                      <pre className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 font-mono whitespace-pre-wrap">{selected.output}</pre>
                    </div>
                  )}
                  {selected.error_output && (
                    <div>
                      <p className="text-xs text-red-500 mb-1">Error</p>
                      <pre className="bg-red-950 border border-red-900 rounded-lg p-3 text-xs text-red-300 font-mono whitespace-pre-wrap">{selected.error_output}</pre>
                    </div>
                  )}
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
                  style={{ width: `${width}%` }}
                  className={`rounded-sm ${s.passed ? "bg-green-700" : "bg-red-700"}`} />;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Pipelines Page ───────────────────────────────────────────

export default function PipelinesPage() {
  const router = useRouter();

  const [pipelines, setPipelines]             = useState<Pipeline[]>([]);
  const [runs, setRuns]                       = useState<PipelineRun[]>([]);
  const [stats, setStats]                     = useState<DashboardStats | null>(null);
  const [risks, setRisks]                     = useState<Record<number, RiskAssessment>>({});
  const [healingLogs, setHealingLogs]         = useState<HealingLog[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [triggering, setTriggering]           = useState<number | null>(null);
  const [showForm, setShowForm]               = useState(false);
  const [selectedRun, setSelectedRun]         = useState<PipelineRun | null>(null);
  const [selectedRisk, setSelectedRisk]       = useState<{ assessment: RiskAssessment; pipeline: Pipeline } | null>(null);
  const [selectedRecs, setSelectedRecs]       = useState<Pipeline | null>(null);
  const [selectedHealing, setSelectedHealing] = useState<Pipeline | null>(null);
  const [pendingRunId, setPendingRunId]       = useState<number | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", repository: "", branch: "main",
  });

  const fetchAll = async () => {
    try {
      const [p, r, s, riskList, hl] = await Promise.all([
        getPipelines(), getRuns(), getStats(), getAllRisks(), getAllHealingLogs(),
      ]);
      setPipelines(p); setRuns(r); setStats(s); setHealingLogs(hl);
      const riskMap: Record<number, RiskAssessment> = {};
      riskList.forEach(ra => { riskMap[ra.pipeline_id] = ra; });
      setRisks(riskMap);
      setError(null);
    } catch {
      setError("Cannot reach backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRunClick = (pipeline: Pipeline) => {
    const assessment = risks[pipeline.id];
    if (assessment && assessment.based_on_runs >= 2) {
      setSelectedRisk({ assessment, pipeline });
      setPendingRunId(pipeline.id);
    } else {
      handleTrigger(pipeline.id);
    }
  };

  const handleTrigger = async (id: number) => {
    setTriggering(id);
    try { await triggerRun(id); await fetchAll(); }
    catch { setError("Failed to trigger pipeline."); }
    finally { setTriggering(null); }
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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this pipeline and all its runs?")) return;
    try { await deletePipeline(id); await fetchAll(); }
    catch { setError("Failed to delete pipeline."); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Pipelines",    value: stats.total_pipelines,            color: "text-blue-400"   },
            { label: "Total Runs",   value: stats.total_runs,                 color: "text-purple-400" },
            { label: "Success Rate", value: `${stats.success_rate}%`,         color: "text-green-400"  },
            { label: "Avg Duration", value: `${stats.avg_duration_seconds}s`, color: "text-yellow-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Failure categories */}
      {stats && Object.keys(stats.failure_categories).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Failure Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stats.failure_categories).map(([cat, count]) => (
              <div key={cat} className={`rounded-lg px-3 py-2 ${categoryStyle[cat] || categoryStyle.unknown}`}>
                <p className="text-xs font-medium capitalize">{cat.replace("_", " ")}</p>
                <p className="text-xl font-bold mt-1">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most failing stage alert */}
      {stats?.most_failing_stage && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl px-5 py-3 flex items-center gap-3">
          <span className="text-orange-400 text-lg">⚠</span>
          <div>
            <p className="text-orange-300 text-sm font-medium">
              Most Failing Stage: <span className="font-mono">{stats.most_failing_stage}</span>
            </p>
            <p className="text-orange-600 text-xs">This stage has failed most frequently</p>
          </div>
        </div>
      )}

      {/* Healing activity */}
      {healingLogs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Recent Healing Activity
          </h2>
          <div className="space-y-2">
            {healingLogs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${healingActionStyle[log.action]}`}>
                  {log.action.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400 flex-1 truncate">{log.reason}</span>
                <span className={`text-xs font-medium shrink-0 ${healingResultStyle[log.result || "pending"]}`}>
                  {log.result?.replace("_", " ") || "pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pipelines list ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Pipelines ({pipelines.length})
          </h2>
          <button onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-xs font-medium px-3 py-2 rounded-lg">
            + New Pipeline
          </button>
        </div>

        {pipelines.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No pipelines yet.</p>
            <button onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-sm px-4 py-2 rounded-lg">
              Create your first pipeline
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pipelines.map(p => {
              const risk = risks[p.id];
              return (
                <div key={p.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 hover:border-gray-700 transition-colors">

                  {/* Top row: name + status + risk + detail button */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-white">{p.name}</h3>
                        {p.last_status ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle[p.last_status]}`}>
                            ● {p.last_status}
                          </span>
                        ) : (
                          <span className="text-gray-600 text-xs">never run</span>
                        )}
                        {p.self_heal_enabled && (
                          <span className="text-xs bg-green-900 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
                            Auto-heal ON
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        {p.repository ? `${p.repository} · ` : ""}{p.branch} · {p.run_count} runs
                      </p>
                    </div>

                    {/* Risk badge */}
                    {risk && (
                      <button onClick={() => setSelectedRisk({ assessment: risk, pipeline: p })}
                        className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${riskBarColor[risk.risk_level]}`}
                            style={{ width: `${Math.round(risk.risk_score * 100)}%` }} />
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskStyle[risk.risk_level]}`}>
                          {Math.round(risk.risk_score * 100)}% risk
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Recent run sparkline */}
                  {p.run_count > 0 && (
                    <div className="flex items-center gap-1 mt-3">
                      <span className="text-xs text-gray-600 mr-1">recent runs</span>
                      {runs
                        .filter(r => r.pipeline_id === p.id)
                        .slice(0, 10)
                        .reverse()
                        .map(r => (
                          <div key={r.id}
                            title={`Run #${r.id}: ${r.status}`}
                            className={`w-3 h-3 rounded-sm cursor-pointer ${
                              r.status === "success" ? "bg-green-500" :
                              r.status === "failed"  ? "bg-red-500"   :
                              r.status === "running" ? "bg-blue-500 animate-pulse" :
                              "bg-gray-600"
                            }`}
                            onClick={() => setSelectedRun(r)}
                          />
                        ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4">
                    {/* Run button */}
                    <button
                      onClick={() => handleRunClick(p)}
                      disabled={triggering === p.id}
                      className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors disabled:bg-gray-700 ${
                        risk?.risk_level === "critical" ? "bg-red-700 hover:bg-red-600 text-white" :
                        risk?.risk_level === "high"     ? "bg-orange-700 hover:bg-orange-600 text-white" :
                        "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}>
                      {triggering === p.id
                        ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running...</>
                        : "▶ Run"}
                    </button>

                    {/* Recs */}
                    <button onClick={() => setSelectedRecs(p)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                      💡 Recs
                    </button>

                    {/* Heal */}
                    <button onClick={() => setSelectedHealing(p)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                      ✚ Heal
                    </button>

                    {/* ── View Details → pipeline detail page ── */}
                    <button
                      onClick={() => router.push(`/pipelines/${p.id}`)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-blue-900 hover:text-blue-300 text-gray-300 transition-colors ml-auto">
                      View Details →
                    </button>

                    {/* Delete */}
                    <button onClick={() => handleDelete(p.id)}
                      className="text-xs px-3 py-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-950 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── All Runs table ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          All Runs ({runs.length})
        </h2>
        {runs.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">No runs yet. Click Run on a pipeline above.</p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
                        {r.is_retry && <span className="ml-1 text-blue-400 text-xs">retry-{r.retry_count}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <button
                          onClick={() => router.push(`/pipelines/${r.pipeline_id}`)}
                          className="font-medium text-white hover:text-blue-300 transition-colors">
                          {pipeline?.name || `Pipeline #${r.pipeline_id}`}
                        </button>
                      </td>
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
                        <button onClick={() => setSelectedRun(r)}
                          className="text-blue-400 hover:text-blue-300 text-xs underline">
                          Stages
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Pipeline Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4 text-white">Create New Pipeline</h3>
            <div className="space-y-3">
              {[
                { label: "Name *",       key: "name",        placeholder: "Deploy Backend Service" },
                { label: "Description",  key: "description", placeholder: "What does this do?" },
                { label: "Repository",   key: "repository",  placeholder: "https://github.com/org/repo" },
                { label: "Branch",       key: "branch",      placeholder: "main" },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
                  <input type="text" placeholder={field.placeholder}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleCreate()}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-sm py-2 rounded-lg font-medium">
                Create Pipeline
              </button>
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-sm py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedRun     && <StagePanel run={selectedRun} onClose={() => setSelectedRun(null)} />}
      {selectedRisk    && <RiskModal assessment={selectedRisk.assessment} pipelineName={selectedRisk.pipeline.name} onClose={() => setSelectedRisk(null)} onRun={() => pendingRunId !== null && handleTrigger(pendingRunId)} />}
      {selectedRecs    && <RecommendationsPanel pipeline={selectedRecs} onClose={() => setSelectedRecs(null)} />}
      {selectedHealing && <HealingPanel pipeline={selectedHealing} onClose={() => setSelectedHealing(null)} onConfigChange={fetchAll} />}
    </div>
  );
}