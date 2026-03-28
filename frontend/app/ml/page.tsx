"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface MLStatus {
  is_trained: boolean;
  trained_at: string | null;
  training_samples: number;
  failure_samples: number;
  success_samples: number;
  cv_auc_score: number;
  feature_importances: Record<string, number> | null;
  total_runs_in_db: number;
  needs_retrain: boolean;
  min_runs_needed: number;
}

const MIN_RUNS = 10;

export default function MLPage() {
  const [status,   setStatus]   = useState<MLStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [training, setTraining] = useState(false);
  const [msg,      setMsg]      = useState<{ type: "success" | "error"; text: string } | null>(null);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${B}/api/v1/ml/status`, { headers: H });
      setStatus(res.data);
    } catch (e: any) {
      setMsg({ type: "error", text: "Failed to load ML status. Check backend connection." });
    } finally {
      setLoading(false);
    }
  }, [B]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleTrain = async () => {
    setTraining(true);
    setMsg(null);
    try {
      const res = await axios.post(`${B}/api/v1/ml/train`, {}, { headers: H });
      const d = res.data;

      if (d.status === "trained") {
        const auc = d.cv_auc ?? 0;
        setMsg({
          type: "success",
          text: auc > 0
            ? `✅ Model trained on ${d.samples} samples! AUC: ${(auc * 100).toFixed(1)}%`
            : `✅ Model trained on ${d.samples} samples! Run more pipelines to improve AUC score.`,
        });
      } else if (d.status === "insufficient_data") {
        setMsg({
          type: "error",
          text: `Need ${d.needed} pipeline runs minimum. You have ${d.samples} right now.`,
        });
      } else {
        setMsg({ type: "error", text: d.message || "Training failed — check backend logs." });
      }
      await fetchStatus();
    } catch (e: any) {
      setMsg({ type: "error", text: e.response?.data?.detail || "Training request failed." });
    } finally {
      setTraining(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────
  const runs       = status?.total_runs_in_db ?? 0;
  const minRuns    = status?.min_runs_needed  ?? MIN_RUNS;
  const progress   = Math.min((runs / minRuns) * 100, 100);
  const isTrained  = status?.is_trained ?? false;
  const samples    = status?.training_samples ?? 0;
  const auc        = status?.cv_auc_score ?? 0;
  const aucPct     = auc > 0 ? `${(auc * 100).toFixed(1)}%` : "N/A";
  const canTrain   = runs >= minRuns;

  const trainedAt  = status?.trained_at
    ? (() => {
        try { return new Date(status.trained_at).toLocaleString(); }
        catch { return null; }
      })()
    : null;

  const aucColor =
    auc >= 0.9 ? "text-green-400"  :
    auc >= 0.8 ? "text-blue-400"   :
    auc >= 0.7 ? "text-yellow-400" :
    auc >  0   ? "text-orange-400" : "text-gray-500";

  const aucLabel =
    auc >= 0.9 ? "Excellent" :
    auc >= 0.8 ? "Good"      :
    auc >= 0.7 ? "Fair"      :
    auc >  0   ? "Weak"      : "—";

  // Feature importances sorted
  const features = status?.feature_importances
    ? Object.entries(status.feature_importances)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
    : [];
  const maxImp = features[0]?.[1] ?? 1;

  // ── Render ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🧠 ML Risk Engine
          </h1>
          <p className="text-gray-500 text-sm mt-1">Predictive failure detection powered by RandomForest</p>
        </div>
        <button
          onClick={handleTrain}
          disabled={training || !canTrain}
          title={!canTrain ? `Need ${minRuns - runs} more pipeline runs` : ""}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {training
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Training...</>
            : isTrained ? "↻ Retrain Model" : "Train Model"
          }
        </button>
      </div>

      {/* Alert banner */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          msg.type === "success"
            ? "bg-green-950 border-green-800 text-green-300"
            : "bg-red-950 border-red-800 text-red-300"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Status</p>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isTrained ? "bg-green-400" : "bg-yellow-400"}`} />
            <p className={`text-lg font-bold ${isTrained ? "text-green-400" : "text-yellow-400"}`}>
              {isTrained ? "Trained" : "Not Trained"}
            </p>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {isTrained ? "Model is active" : `Need ${minRuns} runs`}
          </p>
        </div>

        {/* Samples */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Samples</p>
          <p className="text-3xl font-bold text-blue-400">{samples > 0 ? samples : runs}</p>
          <p className="text-xs text-gray-600 mt-1">
            {isTrained
              ? `${status?.failure_samples ?? 0} fail · ${status?.success_samples ?? 0} pass`
              : `${runs} runs in DB`}
          </p>
        </div>

        {/* AUC Score */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">AUC Score</p>
          {isTrained ? (
            <>
              <p className={`text-3xl font-bold ${aucColor}`}>
                {auc > 0 ? aucPct : "—"}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {auc > 0 ? `${aucLabel} · cross-validated` : "Need 20+ runs for AUC"}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-600">—</p>
              <p className="text-xs text-gray-600 mt-1">Train first</p>
            </>
          )}
        </div>

        {/* Last Trained */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Last Trained</p>
          {trainedAt ? (
            <>
              <p className="text-sm font-bold text-yellow-400">
                {new Date(status!.trained_at!).toLocaleDateString()}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {new Date(status!.trained_at!).toLocaleTimeString()}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-600">Never</p>
              <p className="text-xs text-gray-600 mt-1">Click Train Model</p>
            </>
          )}
        </div>
      </div>

      {/* Progress / Retrain notice */}
      {!isTrained ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-white">Progress to first training</p>
            <p className="text-sm text-gray-400">{runs} / {minRuns} runs</p>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {runs < minRuns
              ? `Run ${minRuns - runs} more pipeline${minRuns - runs !== 1 ? "s" : ""} to unlock training`
              : "✅ Ready to train! Click the button above."}
          </p>
        </div>
      ) : status?.needs_retrain ? (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 flex items-center gap-3">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
          <p className="text-yellow-300 text-sm">
            New pipeline data available — retraining will improve predictions.
          </p>
        </div>
      ) : null}

      {/* Feature Importances */}
      {features.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-1">Feature Importances</h3>
          <p className="text-xs text-gray-500 mb-5">Which signals the model uses most to predict failures</p>
          <div className="space-y-3">
            {features.map(([feat, imp]) => (
              <div key={feat}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-300 capitalize">
                    {feat.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs font-mono text-gray-400">
                    {(imp * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      imp / maxImp > 0.6 ? "bg-purple-500" :
                      imp / maxImp > 0.3 ? "bg-blue-500"   : "bg-gray-600"
                    }`}
                    style={{ width: `${(imp / maxImp) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { n: "1", title: "Data Collection",    desc: "Every pipeline run is stored with timing, stages, and failure info" },
            { n: "2", title: "Feature Extraction", desc: "20 signals extracted: failure rates, streaks, durations, time patterns" },
            { n: "3", title: "Model Training",     desc: "RandomForest learns which signals predict failures from your history" },
            { n: "4", title: "Live Prediction",    desc: "Before each run, model outputs a failure probability (0–100%)" },
          ].map(({ n, title, desc }) => (
            <div key={n} className="flex gap-3">
              <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {n}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AUC guide */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">AUC Score Guide</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { range: "90–100%", label: "Excellent", color: "text-green-400",  bg: "bg-green-950 border-green-800",  desc: "Highly accurate predictions" },
            { range: "80–90%",  label: "Good",      color: "text-blue-400",   bg: "bg-blue-950 border-blue-800",    desc: "Reliable, production-ready" },
            { range: "70–80%",  label: "Fair",       color: "text-yellow-400", bg: "bg-yellow-950 border-yellow-800", desc: "Decent, improving with data" },
            { range: "50–70%",  label: "Weak",       color: "text-orange-400", bg: "bg-orange-950 border-orange-800", desc: "Needs more pipeline runs" },
          ].map(({ range, label, color, bg, desc }) => (
            <div key={range} className={`rounded-lg border p-3 ${bg}`}>
              <p className={`text-sm font-bold ${color}`}>{range}</p>
              <p className="text-xs font-medium text-white mt-0.5">{label}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-4">
          💡 AUC shows as N/A until 20+ runs — cross-validation needs enough samples to be meaningful.
          Keep running pipelines and it will appear automatically.
        </p>
      </div>

    </div>
  );
}