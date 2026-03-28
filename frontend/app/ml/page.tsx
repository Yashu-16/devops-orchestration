"use client";

import { useEffect, useState } from "react";
import axios from "axios";

interface ModelStatus {
  is_trained: boolean;
  trained_at: string | null;
  training_samples: number;
  failure_samples: number;
  success_samples: number;
  cv_auc_score: number;
  feature_importances: Record<string, number>;
  total_runs_in_db: number;
  needs_retrain: boolean;
  min_runs_needed: number;
}

export default function MLPage() {
  const [status, setStatus]       = useState<ModelStatus | null>(null);
  const [loading, setLoading]     = useState(true);
  const [training, setTraining]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [trainResult, setTrainResult] = useState<any>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchStatus = async () => {
    try {
      const res = await axios.get("/api/v1/ml/status", {
        headers: getAuthHeaders(),
      });
      setStatus(res.data);
    } catch (err: any) {
      setError("Failed to load ML status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleTrain = async () => {
    setTraining(true);
    setError(null);
    setSuccess(null);
    setTrainResult(null);
    try {
      const res = await axios.post(
        "/api/v1/ml/train", {},
        { headers: getAuthHeaders() }
      );
      setTrainResult(res.data);
      if (res.data.status === "trained") {
        setSuccess(
          `Model trained on ${res.data.samples} samples! ` +
          `AUC score: ${(res.data.cv_auc * 100).toFixed(1)}%`
        );
      } else {
        setError(
          res.data.message ||
          `Need ${res.data.needed} runs, only have ${res.data.samples}`
        );
      }
      await fetchStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Training failed");
    } finally {
      setTraining(false);
    }
  };

  const getAucColor = (auc: number) => {
    if (auc >= 0.8) return "text-green-400";
    if (auc >= 0.6) return "text-yellow-400";
    return "text-red-400";
  };

  const getAucLabel = (auc: number) => {
    if (auc >= 0.9) return "Excellent";
    if (auc >= 0.8) return "Good";
    if (auc >= 0.7) return "Fair";
    if (auc >= 0.6) return "Weak";
    return "Poor";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const importances = status?.feature_importances
    ? Object.entries(status.feature_importances)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
    : [];

  const maxImportance = importances[0]?.[1] || 1;

  return (
    <div className="max-w-4xl space-y-6">

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-950 border border-green-800 text-green-300 px-4 py-3 rounded-lg text-sm">
          ✓ {success}
        </div>
      )}

      {/* Model Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Model Status
          </p>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              status?.is_trained ? "bg-green-400" : "bg-yellow-400"
            }`} />
            <p className={`text-lg font-bold ${
              status?.is_trained ? "text-green-400" : "text-yellow-400"
            }`}>
              {status?.is_trained ? "Trained" : "Not Trained"}
            </p>
          </div>
          {status?.trained_at && (
            <p className="text-xs text-gray-600 mt-1">
              {new Date(status.trained_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Training Data
          </p>
          <p className="text-3xl font-bold text-blue-400">
            {status?.training_samples || 0}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {status?.failure_samples || 0} failures ·{" "}
            {status?.success_samples || 0} successes
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            AUC Score
          </p>
          {status?.is_trained ? (
            <>
              <p className={`text-3xl font-bold ${getAucColor(status.cv_auc_score)}`}>
                {(status.cv_auc_score * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {getAucLabel(status.cv_auc_score)} · Cross-validated
              </p>
            </>
          ) : (
            <p className="text-3xl font-bold text-gray-600">—</p>
          )}
        </div>
      </div>

      {/* Train / Retrain */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white mb-1">
              {status?.is_trained ? "Retrain Model" : "Train Model"}
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              {status?.is_trained
                ? `Model trained on ${status.training_samples} samples. ` +
                  (status.needs_retrain
                    ? "New data available — retraining recommended."
                    : "Model is up to date.")
                : `Collect at least ${status?.min_runs_needed || 10} pipeline runs to train the model. ` +
                  `You have ${status?.total_runs_in_db || 0} runs so far.`}
            </p>

            {/* Progress bar to training threshold */}
            {!status?.is_trained && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    Progress to training
                  </span>
                  <span className="text-xs text-gray-400">
                    {status?.total_runs_in_db || 0} /{" "}
                    {status?.min_runs_needed || 10} runs
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        ((status?.total_runs_in_db || 0) /
                          (status?.min_runs_needed || 10)) * 100,
                        100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {status?.needs_retrain && status?.is_trained && (
              <div className="mt-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-xs text-yellow-400">
                  New runs available — model should be retrained
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleTrain}
            disabled={
              training ||
              (status?.total_runs_in_db || 0) < (status?.min_runs_needed || 10)
            }
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700
              disabled:text-gray-500 text-sm px-5 py-2.5 rounded-lg
              transition-colors shrink-0 font-medium"
          >
            {training ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Training...
              </div>
            ) : status?.is_trained ? "Retrain Model" : "Train Model"}
          </button>
        </div>

        {/* Train result */}
        {trainResult?.status === "trained" && (
          <div className="mt-4 bg-green-950 border border-green-800 rounded-lg p-4">
            <p className="text-green-300 text-sm font-medium mb-2">
              ✓ Training Complete
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Samples</p>
                <p className="text-white font-medium">{trainResult.samples}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">AUC Score</p>
                <p className={`font-medium ${getAucColor(trainResult.cv_auc)}`}>
                  {(trainResult.cv_auc * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            {trainResult.top_features && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">
                  Top Predictive Features
                </p>
                <div className="space-y-1">
                  {Object.entries(trainResult.top_features)
                    .slice(0, 3)
                    .map(([feature, importance]) => (
                      <div key={feature} className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 w-36 truncate">
                          {feature.replace(/_/g, " ")}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{
                              width: `${Number(importance) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {(Number(importance) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feature Importances */}
      {importances.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">
            Feature Importances
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Which signals matter most for predicting failures
          </p>
          <div className="space-y-3">
            {importances.map(([feature, importance]) => (
              <div key={feature}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-300 capitalize">
                    {feature.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">
                    {(importance * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      importance / maxImportance > 0.6
                        ? "bg-blue-500"
                        : importance / maxImportance > 0.3
                        ? "bg-purple-500"
                        : "bg-gray-600"
                    }`}
                    style={{
                      width: `${(importance / maxImportance) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">
          How the ML Model Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            {
              step: "1",
              title: "Data Collection",
              desc:  "Every pipeline run is stored with timing, stages, and failure info",
            },
            {
              step: "2",
              title: "Feature Extraction",
              desc:  "20 signals extracted: failure rates, streaks, durations, time patterns",
            },
            {
              step: "3",
              title: "Model Training",
              desc:  "RandomForest learns which signals predict failures from your history",
            },
            {
              step: "4",
              title: "Live Prediction",
              desc:  "Before each run, model outputs a failure probability (0-100%)",
            },
          ].map(item => (
            <div key={item.step} className="flex gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AUC explanation */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-3">
          Understanding AUC Score
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { range: "90-100%", label: "Excellent", color: "text-green-400",  desc: "Model is highly accurate" },
            { range: "80-90%",  label: "Good",      color: "text-blue-400",   desc: "Reliable predictions" },
            { range: "70-80%",  label: "Fair",       color: "text-yellow-400", desc: "Decent but improving" },
            { range: "50-70%",  label: "Weak",       color: "text-red-400",    desc: "Needs more run data" },
          ].map(item => (
            <div key={item.range} className="bg-gray-800 rounded-lg p-3">
              <p className={`text-sm font-bold ${item.color}`}>{item.range}</p>
              <p className="text-xs text-white font-medium mt-0.5">{item.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}