"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Brain, TrendingUp, RefreshCw } from "lucide-react";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";

interface MLStatus { model_trained: boolean; model_path: string | null; training_samples: number; last_trained: string | null; auc_score: number | null; feature_importance: Record<string, number>; }

export default function MLPage() {
  const [status,   setStatus]   = useState<MLStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [training, setTraining] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${B}/api/v1/ml/status`, { headers: H });
      setStatus(res.data);
      setError(null);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load ML status");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchStatus(); }, []);

  const trainModel = async () => {
    setTraining(true);
    try {
      await axios.post(`${B}/api/v1/ml/train`, {}, { headers: H });
      await fetchStatus();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Training failed");
    } finally { setTraining(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400">Loading ML status...</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" /> ML Risk Engine
          </h1>
          <p className="text-gray-500 text-sm mt-1">Predictive failure detection powered by RandomForest</p>
        </div>
        <button onClick={trainModel} disabled={training}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <RefreshCw className={`w-4 h-4 ${training ? "animate-spin" : ""}`} />
          {training ? "Training..." : "Train Model"}
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm mb-6">
          {error}
        </div>
      )}

      {status && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Model Status",       value: status.model_trained ? "Trained ✅" : "Not Trained ❌", color: status.model_trained ? "text-green-400" : "text-red-400" },
              { label: "Training Samples",   value: status.training_samples.toString(), color: "text-blue-400" },
              { label: "AUC Score",          value: status.auc_score ? `${(status.auc_score * 100).toFixed(1)}%` : "N/A", color: "text-purple-400" },
              { label: "Last Trained",       value: status.last_trained ? new Date(status.last_trained).toLocaleDateString() : "Never", color: "text-yellow-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {Object.keys(status.feature_importance).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" /> Feature Importance
              </h3>
              <div className="space-y-3">
                {Object.entries(status.feature_importance)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([feature, importance]) => (
                    <div key={feature}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">{feature.replace(/_/g, " ")}</span>
                        <span className="text-purple-400">{(importance * 100).toFixed(2)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${importance * 100}%` }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {!status.model_trained && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <Brain className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No model trained yet</p>
              <p className="text-gray-600 text-sm mt-1 mb-4">Run at least 10 pipelines then click Train Model</p>
              <button onClick={trainModel} disabled={training}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                Train Now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}