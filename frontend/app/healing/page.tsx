"use client";

import { useEffect, useState } from "react";
import { getAllHealingLogs, getPipelines, HealingLog, Pipeline } from "@/lib/api";

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
const categoryStyle: Record<string, string> = {
  test_failure:   "bg-red-900 text-red-300 border border-red-700",
  dependency:     "bg-orange-900 text-orange-300 border border-orange-700",
  build_failure:  "bg-yellow-900 text-yellow-300 border border-yellow-700",
  infrastructure: "bg-purple-900 text-purple-300 border border-purple-700",
  deployment:     "bg-pink-900 text-pink-300 border border-pink-700",
  unknown:        "bg-gray-800 text-gray-400 border border-gray-600",
};

export default function HealingPage() {
  const [logs, setLogs]         = useState<HealingLog[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([getAllHealingLogs(), getPipelines()])
      .then(([hl, p]) => { setLogs(hl); setPipelines(p); })
      .finally(() => setLoading(false));
    const i = setInterval(() => {
      Promise.all([getAllHealingLogs(), getPipelines()])
        .then(([hl, p]) => { setLogs(hl); setPipelines(p); });
    }, 5000);
    return () => clearInterval(i);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalRetries  = logs.filter(l => l.action === "retry").length;
  const succeeded     = logs.filter(l => l.result === "retry_succeeded").length;
  const failed        = logs.filter(l => l.result === "retry_failed").length;
  const alerts        = logs.filter(l => l.action === "alert").length;

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Actions", value: logs.length,   color: "text-blue-400"   },
          { label: "Auto Retries",  value: totalRetries,  color: "text-purple-400" },
          { label: "Succeeded",     value: succeeded,     color: "text-green-400"  },
          { label: "Alerts Raised", value: alerts,        color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Audit log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Full Healing Audit Trail</h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">Live</span>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-4xl mb-4">✦</p>
            <p className="text-white font-medium mb-2">No healing actions yet</p>
            <p className="text-gray-500 text-sm">Enable auto-heal on a pipeline, then trigger some runs.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Pipeline</th>
                <th className="text-left px-4 py-3">Run</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Result</th>
                <th className="text-left px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const pipeline = pipelines.find(p => p.id === log.pipeline_id);
                return (
                  <tr key={log.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{pipeline?.name || `Pipeline ${log.pipeline_id}`}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      #{log.run_id}
                      {log.new_run_id && <span className="text-blue-400"> → #{log.new_run_id}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${healingActionStyle[log.action]}`}>
                        {log.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.failure_category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${categoryStyle[log.failure_category] || categoryStyle.unknown}`}>
                          {log.failure_category.replace("_", " ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${healingResultStyle[log.result || "pending"]}`}>
                        {log.result?.replace("_", " ") || "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                      {log.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}