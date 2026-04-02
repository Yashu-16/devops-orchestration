"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { getBackend, getAuthHeaders } from "@/lib/backend-url";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

type Tab = "overview" | "runs" | "analytics" | "healing" | "agent" | "ml" | "members";

const TABS: { id: Tab; label: string; badge?: string }[] = [
  { id: "overview",  label: "Overview"  },
  { id: "runs",      label: "Runs"      },
  { id: "analytics", label: "Analytics" },
  { id: "healing",   label: "Healing"   },
  { id: "agent",     label: "AI Agent", badge: "NEW" },
  { id: "ml",        label: "ML Risk"   },
  { id: "members",   label: "Access"    },
];

const PIE_COLORS = ["#3b82f6","#ef4444","#f59e0b","#10b981","#8b5cf6","#ec4899"];

const riskColor = (score: number) =>
  score >= 0.75 ? "text-red-400"    :
  score >= 0.50 ? "text-orange-400" :
  score >= 0.25 ? "text-yellow-400" : "text-green-400";

const statusBadge = (s: string) =>
  s === "success" ? "bg-green-900 text-green-300" :
  s === "failed"  ? "bg-red-900  text-red-300"    :
  s === "running" ? "bg-blue-900 text-blue-300"   :
                    "bg-gray-800 text-gray-400";


// ── Agent Chat Component ───────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const QUICK_PROMPTS = [
  "What is wrong with this pipeline?",
  "Why does it keep failing?",
  "How do I fix the latest error?",
  "What is the risk score based on?",
  "Summarise all failures in the last 10 runs",
];

function AgentChat({ pipelineId, pipelineName, healing, overview, runs, ml }: {
  pipelineId: string;
  pipelineName: string;
  healing: any;
  overview: any;
  runs: any;
  ml: any;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([{
    role: "agent",
    content: `Hi! I am the AI agent for **${pipelineName}**. I have full knowledge of this pipeline — every run, every error, every healing event, and the current risk score. What would you like to know or fix?`,
    timestamp: new Date(),
  }]);
  const [input,   setInput]   = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Build a rich context string from all available pipeline data
  const buildContext = () => {
    const lines: string[] = [];

    // ── Overview ──────────────────────────────────────────
    if (overview) {
      lines.push("=== PIPELINE OVERVIEW ===");
      lines.push(`Name: ${overview.name}`);
      lines.push(`Status: ${overview.last_run_status || "never run"}`);
      lines.push(`Total runs: ${overview.total_runs}`);
      lines.push(`Success rate: ${100 - (overview.failure_rate || 0)}%`);
      lines.push(`Failure rate: ${overview.failure_rate || 0}%`);
      lines.push(`Avg duration: ${overview.avg_duration}s`);
      lines.push(`Risk score: ${Math.round((overview.risk_score || 0) * 100)}% — ${overview.risk_level || "unknown"} risk`);
      lines.push(`Auto-heal: ${overview.self_heal_enabled ? "ENABLED (max retries: " + overview.max_retries + ")" : "DISABLED"}`);
      lines.push(`Repository: ${overview.repository || "not set"}`);
      lines.push(`Branch: ${overview.branch || "main"}`);
    }

    // ── Recent runs with errors ────────────────────────────
    if (runs?.runs?.length > 0) {
      lines.push("
=== RECENT RUNS (last 10) ===");
      runs.runs.slice(0, 10).forEach((r: any) => {
        lines.push(`Run #${r.id}: ${r.status.toUpperCase()} | stage: ${r.failed_stage || "all passed"} | duration: ${r.duration_seconds}s | env: ${r.environment}`);
        if (r.root_cause) lines.push(`  Root cause: ${r.root_cause}`);
        if (r.risk_score != null) lines.push(`  Risk: ${Math.round(r.risk_score * 100)}%`);
      });

      // Failed runs summary
      const failed = runs.runs.filter((r: any) => r.status === "failed");
      if (failed.length > 0) {
        lines.push(`
Failed runs: ${failed.length}/${runs.runs.length}`);
        const stages: Record<string, number> = {};
        failed.forEach((r: any) => {
          if (r.failed_stage) stages[r.failed_stage] = (stages[r.failed_stage] || 0) + 1;
        });
        if (Object.keys(stages).length > 0) {
          lines.push("Most failing stages: " + Object.entries(stages).sort((a,b) => b[1]-a[1]).map(([s,c]) => `${s}(${c}x)`).join(", "));
        }
      }
    }

    // ── Healing events ─────────────────────────────────────
    if (healing?.events?.length > 0) {
      lines.push("
=== HEALING HISTORY ===");
      healing.events.slice(0, 8).forEach((e: any) => {
        lines.push(`Run #${e.run_id}: ${e.action} → ${e.result} | ${e.reason}`);
        if (e.agent_analysed) {
          if (e.agent_summary)      lines.push(`  AI diagnosis: ${e.agent_summary}`);
          if (e.agent_root_cause)   lines.push(`  Root cause: ${e.agent_root_cause}`);
          if (e.agent_proposed_fix) lines.push(`  Proposed fix: ${e.agent_proposed_fix}`);
          if (e.agent_fix_code)     lines.push(`  Fix code: ${e.agent_fix_code}`);
          if (e.agent_affected_file) lines.push(`  File to change: ${e.agent_affected_file}`);
        }
      });

      const healed = healing.events.filter((e: any) => e.result === "retry_succeeded").length;
      lines.push(`Healing success rate: ${healed}/${healing.events.length} (${Math.round(healed/healing.events.length*100)}%)`);
    }

    // ── ML risk factors ────────────────────────────────────
    if (ml?.factors?.length > 0) {
      lines.push("
=== ML RISK FACTORS ===");
      ml.factors.forEach((f: any) => {
        lines.push(`${f.name}: ${Math.round((f.score || 0) * 100)}% (weight: ${f.weight}) — ${f.description}`);
      });
      if (ml.current_risk?.used_ml) {
        lines.push(`ML model confidence: ${Math.round((ml.current_risk.confidence || 0) * 100)}% based on ${ml.current_risk.based_on_runs} runs`);
      }
    }

    return lines.join("
");
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: ChatMessage = { role: "user",  content: text, timestamp: new Date() };
    const loadMsg: ChatMessage = { role: "agent", content: "", timestamp: new Date(), isLoading: true };
    setMessages(prev => [...prev, userMsg, loadMsg]);
    setInput("");
    setSending(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";
      if (!apiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY not set. Go to Railway → devops-orchestration (frontend service) → Variables → add NEXT_PUBLIC_ANTHROPIC_API_KEY"
        );
      }

      const context = buildContext();

      const history = messages
        .filter(m => !m.isLoading)
        .map(m => ({
          role:    m.role === "user" ? "user" : "assistant" as const,
          content: m.content,
        }));

      const systemPrompt = `You are an intelligent AI DevOps agent exclusively for the pipeline "${pipelineName}" (Pipeline ID: ${pipelineId}).

You have complete, real-time knowledge of this pipeline:

${context}

YOUR CAPABILITIES:
1. Answer any question about this pipeline specifically — failures, errors, patterns, risk
2. When asked to fix an error, provide the EXACT file and code change needed
3. Identify patterns across multiple runs (e.g. "this stage always fails on Mondays")
4. Explain risk scores in plain English based on the actual factors above
5. Suggest preventive actions based on the failure history

YOUR RULES:
- You ONLY help with this specific pipeline — never generic advice
- Always reference specific run numbers, error messages, and stage names from the context above
- When suggesting a code fix, format it as:
  **File:** filename.py
  \`\`\`
  exact code to add/change
  \`\`\`
- If the user asks to "fix" something, give them the exact change — not "you should consider"
- Be direct, specific, and actionable
- If you don't have enough information to answer, say exactly what information is missing`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":       "application/json",
          "x-api-key":          apiKey,
          "anthropic-version":  "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system:     systemPrompt,
          messages:   [...history, { role: "user", content: text }],
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `API returned ${resp.status}`);
      }

      const data  = await resp.json();
      const reply = data.content?.[0]?.text || "Sorry, I could not generate a response.";

      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1
          ? { role: "agent", content: reply, timestamp: new Date() }
          : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1
          ? { role: "agent", content: `⚠️ ${err.message}`, timestamp: new Date() }
          : m
      ));
    } finally {
      setSending(false);
    }
  };

  const fmt = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/```([\s\S]*?)```/g, "<pre class="cb">$1</pre>")
      .replace(/`([^`]+)`/g, "<code class="ic">$1</code>")
      .replace(/
/g, "<br/>");

  return (
    <div className="flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: "600px" }}>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 bg-purple-950/30">
        <span className="text-base">🤖</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-purple-200">Pipeline Agent</p>
          <p className="text-xs text-purple-500">{pipelineName} — {runs?.total || 0} runs · {healing?.summary?.total || 0} healing events</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-green-400">Active</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "agent" && (
              <div className="w-7 h-7 rounded-full bg-purple-800 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">🤖</div>
            )}
            <div className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-br-none"
                : "bg-gray-800 text-gray-200 rounded-bl-none"
            }`}>
              {msg.isLoading ? (
                <div className="flex items-center gap-1.5 py-1">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              ) : (
                <>
                  <div dangerouslySetInnerHTML={{ __html: fmt(msg.content) }} />
                  <p className="text-xs opacity-30 mt-1.5">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">Y</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      {messages.length === 1 && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-600 mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => sendMessage(p)}
                className="text-xs bg-gray-800 hover:bg-purple-900/40 border border-gray-700 hover:border-purple-700 text-gray-400 hover:text-purple-300 px-2.5 py-1.5 rounded-full transition-all">
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Ask about this pipeline — errors, fixes, risk..."
          disabled={sending}
          className="flex-1 bg-gray-800 border border-gray-700 focus:border-purple-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none disabled:opacity-50 transition-colors"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={sending || !input.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors min-w-[44px] flex items-center justify-center">
          {sending
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            : "→"}
        </button>
      </div>

      <style>{`
        .cb { background: #030712; border: 1px solid #374151; border-radius: 6px; padding: 10px 12px; font-family: monospace; font-size: 11px; color: #86efac; white-space: pre-wrap; margin: 6px 0; display: block; overflow-x: auto; line-height: 1.6; }
        .ic { background: #1f2937; color: #93c5fd; padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 11px; }
      `}</style>
    </div>
  );
}

export default function PipelineDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params?.id as string;

  const [tab,      setTab]      = useState<Tab>("overview");
  const [overview, setOverview] = useState<any>(null);
  const [runs,     setRuns]     = useState<any>(null);
  const [analytics,setAnalytics]= useState<any>(null);
  const [healing,  setHealing]  = useState<any>(null);
  const [ml,       setMl]       = useState<any>(null);
  const [members,  setMembers]  = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [running,  setRunning]  = useState(false);

  const B = getBackend();
  const H = getAuthHeaders();

  const fetch = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (t === "overview" || !overview) {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/overview`, { headers: H });
        setOverview(r.data);
      }
      if (t === "runs") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/runs`, { headers: H });
        setRuns(r.data);
      }
      if (t === "analytics") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/analytics`, { headers: H });
        setAnalytics(r.data);
      }
      if (t === "healing" || t === "agent") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/healing`, { headers: H });
        setHealing(r.data);
      }
      if (t === "agent") {
        const [rr, mr] = await Promise.all([
          axios.get(`${B}/api/v1/pipelines/${id}/runs`, { headers: H }),
          axios.get(`${B}/api/v1/pipelines/${id}/ml`, { headers: H }),
        ]);
        setRuns(rr.data);
        setMl(mr.data);
      }
      if (t === "ml") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/ml`, { headers: H });
        setMl(r.data);
      }
      if (t === "members") {
        const r = await axios.get(`${B}/api/v1/pipelines/${id}/members`, { headers: H });
        setMembers(r.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [id, B]);

  useEffect(() => { fetch(tab); }, [tab]);

  const handleRun = async () => {
    setRunning(true);
    try {
      await axios.post(`${B}/api/v1/pipelines/${id}/run`, {}, { headers: H });
      setTimeout(() => { fetch("runs"); fetch("overview"); }, 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to trigger run");
    } finally { setRunning(false); }
  };

  const handleAssign = async (userId: number) => {
    try {
      await axios.post(`${B}/api/v1/pipelines/${id}/members`, { user_id: userId }, { headers: H });
      fetch("members");
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to assign"); }
  };

  const handleRemove = async (userId: number) => {
    try {
      await axios.delete(`${B}/api/v1/pipelines/${id}/members/${userId}`, { headers: H });
      fetch("members");
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to remove"); }
  };

  // Events that have agent analysis
  const agentEvents = (healing?.events ?? []).filter((e: any) => e.agent_analysed);

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Back + Run button */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push("/pipelines")}
          className="text-gray-500 hover:text-white text-sm flex items-center gap-1">
          ← All Pipelines
        </button>
        <button onClick={handleRun} disabled={running}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2">
          {running
            ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block"/>Running...</>
            : "▶ Run Pipeline"}
        </button>
      </div>

      {/* Pipeline header */}
      {overview && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">{overview.name}</h1>
              {overview.description && (
                <p className="text-gray-500 text-sm mt-0.5">{overview.description}</p>
              )}
              {overview.repository && (
                <p className="text-xs text-gray-600 mt-1 font-mono">{overview.repository} @ {overview.branch}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-sm font-bold ${riskColor(overview.risk_score)}`}>
                {Math.round(overview.risk_score * 100)}% risk
              </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(overview.last_run_status || "")}`}>
                {overview.last_run_status || "no runs"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Runs",   value: overview.total_runs },
              { label: "Success Rate", value: `${100 - overview.failure_rate}%`, color: "text-green-400" },
              { label: "Failure Rate", value: `${overview.failure_rate}%`, color: "text-red-400" },
              { label: "Avg Duration", value: `${overview.avg_duration}s` },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-lg font-bold text-white ${color || ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? t.id === "agent" ? "bg-purple-700 text-white" : "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}>
            {t.label}
            {t.badge && (
              <span className="text-xs bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                {t.badge}
              </span>
            )}
            {t.id === "agent" && agentEvents.length > 0 && tab !== "agent" && (
              <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                {agentEvents.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <>

          {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
          {tab === "overview" && overview && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Pipeline Details</h3>
                <div className="space-y-3">
                  {[
                    { label: "Repository", value: overview.repository || "Not set" },
                    { label: "Branch",     value: overview.branch || "main" },
                    { label: "Created",    value: new Date(overview.created_at).toLocaleDateString() },
                    { label: "Auto-Heal",  value: overview.self_heal_enabled ? "Enabled" : "Disabled" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{label}</span>
                      <span className="text-xs text-white font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {TABS.filter(t => t.id !== "overview").map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={`w-full text-left text-sm text-white px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                        t.id === "agent" ? "bg-purple-900/40 hover:bg-purple-900/60 border border-purple-800/50" : "bg-gray-800 hover:bg-gray-700"
                      }`}>
                      <span className="flex items-center gap-2">
                        {t.id === "agent" && <span>🤖</span>}
                        {t.label}
                        {t.id === "agent" && agentEvents.length > 0 && (
                          <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full">{agentEvents.length}</span>
                        )}
                      </span>
                      <span className="text-gray-500 text-xs">→</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── RUNS TAB ─────────────────────────────────────────── */}
          {tab === "runs" && runs && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Run History</h2>
                <p className="text-xs text-gray-500 mt-0.5">{runs.total} total runs</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left">
                      {["Run","Status","Environment","Triggered By","Stages","Duration","Root Cause","Risk"].map(h => (
                        <th key={h} className="px-4 py-3 text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {runs.runs.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">#{r.id}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(r.status)}`}>
                            ● {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 capitalize">{r.environment}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.triggered_by || "manual"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.stages_passed}/{r.stages_total}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{r.duration_seconds}s</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                          {r.root_cause ? r.root_cause.replace(/\[.*?\]\s*/, "") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {r.risk_score != null && (
                            <span className={`text-xs font-medium ${riskColor(r.risk_score)}`}>
                              {Math.round(r.risk_score * 100)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ANALYTICS TAB ────────────────────────────────────── */}
          {tab === "analytics" && analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Runs",   value: analytics.summary.total_runs },
                  { label: "Success Rate", value: `${analytics.summary.success_rate}%`, color: "text-green-400" },
                  { label: "Avg Duration", value: `${analytics.summary.avg_duration}s` },
                  { label: "Failed Runs",  value: analytics.summary.failed_runs, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold text-white ${color || ""}`}>{value}</p>
                  </div>
                ))}
              </div>
              {analytics.trend.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Daily Run Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={analytics.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      <Line type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} dot={false}/>
                      <Line type="monotone" dataKey="failed"  stroke="#ef4444" strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {analytics.stage_failures.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Stage Failures</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={analytics.stage_failures}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                        <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#6b7280" }}/>
                        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }}/>
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                        <Bar dataKey="failures" fill="#ef4444" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {analytics.root_causes.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Root Cause Breakdown</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={analytics.root_causes} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" outerRadius={70} label={({ name }) => name}>
                          {analytics.root_causes.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HEALING TAB — system actions only, no AI clutter ── */}
          {tab === "healing" && healing && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total Events", value: healing?.summary?.total ?? 0 },
                  { label: "Auto-Healed",  value: healing?.summary?.succeeded ?? 0, color: "text-green-400" },
                  { label: "Not Healed",   value: healing?.summary?.failed ?? 0, color: "text-red-400" },
                  { label: "Heal Rate",    value: `${healing?.summary?.success_rate ?? 0}%`, color: "text-blue-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold text-white ${color || ""}`}>{value}</p>
                  </div>
                ))}
              </div>

              {agentEvents.length > 0 && (
                <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">🤖</span>
                    <span className="text-sm text-purple-300 font-medium">
                      {agentEvents.length} AI Agent {agentEvents.length === 1 ? "analysis" : "analyses"} available
                    </span>
                    <span className="text-xs text-purple-500">— view detailed diagnoses and code fixes</span>
                  </div>
                  <button onClick={() => setTab("agent")}
                    className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                    Open AI Agent →
                  </button>
                </div>
              )}

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Healing Events</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Every action the system took when this pipeline failed</p>
                </div>
                {(healing?.events?.length ?? 0) === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-400 text-sm">No healing events yet</p>
                    <p className="text-gray-600 text-xs mt-1">Events appear here when a pipeline fails and the system takes action</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {(healing?.events ?? []).map((e: any) => (
                      <div key={e.id} className="px-5 py-4 flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              e.result === "retry_succeeded" ? "bg-green-900 text-green-300 border border-green-700" :
                              e.result === "retry_failed"   ? "bg-red-900 text-red-300 border border-red-700" :
                              "bg-gray-800 text-gray-400 border border-gray-700"
                            }`}>
                              {e.result === "retry_succeeded" ? "✓ Auto-Healed" :
                               e.result === "retry_failed"   ? "✗ Retry Failed" :
                               e.action === "rollback"       ? "⟳ Rolled Back" :
                               "● " + (e.action || "Alert")}
                            </span>
                            <span className="text-xs text-gray-500">Run #{e.run_id}</span>
                            {e.retry_number > 0 && <span className="text-xs text-gray-600">Attempt {e.retry_number}</span>}
                            {e.agent_analysed && (
                              <span className="text-xs bg-purple-900/50 text-purple-400 border border-purple-800/50 px-2 py-0.5 rounded-full">
                                🤖 AI analysed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">{e.reason}</p>
                        </div>
                        <span className="text-xs text-gray-600 flex-shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── AI AGENT TAB ─────────────────────────────────────────── */}
          {tab === "agent" && (
            <div className="space-y-4">

              {/* Header stats */}
              <div className="bg-purple-950/30 border border-purple-800/40 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🤖</span>
                  <div>
                    <h2 className="text-base font-semibold text-purple-200">AI Agent — {overview?.name}</h2>
                    <p className="text-xs text-purple-400 mt-0.5">
                      Chat with the agent about this pipeline. Ask it to explain errors, analyse failures, and tell you exactly how to fix them.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Auto-analyses done",  value: agentEvents.length },
                    { label: "High confidence",     value: agentEvents.filter((e: any) => e.agent_confidence === "high").length },
                    { label: "Auto-fixable errors", value: agentEvents.filter((e: any) => e.agent_can_auto_apply).length },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-purple-300">{value}</p>
                      <p className="text-xs text-purple-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two columns: chat + past analyses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

                {/* Chat panel */}
                <AgentChat
                  pipelineId={id}
                  pipelineName={overview?.name || "Pipeline"}
                  healing={healing}
                  overview={overview}
                  runs={runs}
                  ml={ml}
                />

                {/* Past auto-analyses */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-400">Past Auto-Analyses</h3>
                  {agentEvents.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                      <div className="text-3xl mb-3">🤖</div>
                      <p className="text-gray-400 text-sm mb-1">No automatic analyses yet</p>
                      <p className="text-gray-600 text-xs">The agent auto-analyses failures when they happen. Use the chat panel to ask questions right now.</p>
                    </div>
                  ) : agentEvents.map((e: any) => (
                    <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            e.result === "retry_succeeded" ? "bg-green-900 text-green-300" :
                            e.result === "retry_failed"   ? "bg-red-900 text-red-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>
                            {e.result === "retry_succeeded" ? "✓ Healed" : e.result === "retry_failed" ? "✗ Failed" : "● " + (e.action || "Alert")}
                          </span>
                          <span className="text-xs text-gray-500">Run #{e.run_id}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          e.agent_confidence === "high"   ? "bg-green-900/40 text-green-300 border-green-800" :
                          e.agent_confidence === "medium" ? "bg-yellow-900/40 text-yellow-300 border-yellow-800" :
                          "bg-gray-800 text-gray-500 border-gray-700"
                        }`}>{e.agent_confidence} confidence</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {e.agent_summary && (
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">What went wrong</p>
                            <p className="text-sm text-white">{e.agent_summary}</p>
                          </div>
                        )}
                        {e.agent_proposed_fix && (
                          <div>
                            <p className="text-xs text-green-400 uppercase tracking-wide font-semibold mb-1">How to fix</p>
                            <p className="text-xs text-gray-300">{e.agent_proposed_fix}</p>
                          </div>
                        )}
                        {e.agent_fix_code && (
                          <pre className="bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap font-mono">{e.agent_fix_code}</pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ML TAB ───────────────────────────────────────────── */}
          {tab === "ml" && ml && (
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Current Risk Assessment</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Risk Score",  value: `${Math.round((ml?.current_risk?.score ?? 0) * 100)}%`, color: riskColor(ml?.current_risk?.score ?? 0) },
                    { label: "Risk Level",  value: ml?.current_risk?.level ?? "unknown", color: riskColor(ml?.current_risk?.score ?? 0) },
                    { label: "Confidence",  value: `${Math.round((ml?.current_risk?.confidence ?? 0) * 100)}%` },
                    { label: "Based On",    value: `${ml?.current_risk?.based_on_runs ?? 0} runs` },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color || "text-white"}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {ml?.current_risk?.used_ml && (
                  <p className="text-xs text-blue-400 mt-3">✓ ML model active for this pipeline</p>
                )}
              </div>
              {(ml?.factors?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Risk Factors</h2>
                  <div className="space-y-3">
                    {(ml?.factors ?? []).map((f: any) => (
                      <div key={f.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-xs text-white">{f.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{f.description}</span>
                          </div>
                          <span className={`text-xs font-mono ${riskColor(f.score ?? 0)}`}>
                            {Math.round((f.score ?? 0) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(f.score ?? 0) * 100}%` }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(ml?.risk_trend?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Risk Score Trend (Last 10 Runs)</h2>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={ml.risk_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
                      <XAxis dataKey="run_id" tickFormatter={(v) => `#${v}`} tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <YAxis domain={[0,1]} tickFormatter={(v) => `${Math.round(v*100)}%`} tick={{ fontSize: 10, fill: "#6b7280" }}/>
                      <Tooltip formatter={(v: any) => [`${Math.round(Number(v)*100)}%`, "Risk"]} contentStyle={{ background: "#111827", border: "1px solid #374151" }}/>
                      <Line type="monotone" dataKey="risk_score" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316" }}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {(ml?.recommendations?.length ?? 0) > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">Recommendations</h2>
                  <div className="space-y-3">
                    {(ml?.recommendations ?? []).map((r: any, i: number) => (
                      <div key={i} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            r.priority === "P1" ? "bg-red-900 text-red-300" :
                            r.priority === "P2" ? "bg-yellow-900 text-yellow-300" :
                            "bg-gray-700 text-gray-300"
                          }`}>{r.priority}</span>
                          <span className="text-sm font-medium text-white">{r.title}</span>
                        </div>
                        <p className="text-xs text-gray-400">{r.description}</p>
                        {r.action && <p className="text-xs text-blue-400 mt-1 font-mono">→ {r.action}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MEMBERS TAB ──────────────────────────────────────── */}
          {tab === "members" && members && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Has Access ({members.assigned_members.length})</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Admins and owners always have access.</p>
                </div>
                {members.assigned_members.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No members assigned yet.</div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {members.assigned_members.map((m: any) => (
                      <div key={m.user_id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {m.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-sm text-white font-medium">{m.name}</p>
                            <p className="text-xs text-gray-500">{m.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            m.role === "owner" ? "bg-purple-900 text-purple-300" :
                            m.role === "admin" ? "bg-blue-900 text-blue-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>{m.role}</span>
                          {m.role === "member" && (
                            <button onClick={() => handleRemove(m.user_id)}
                              className="text-xs text-gray-600 hover:text-red-400 transition-colors">Remove</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {members.available_to_assign.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Assign Access</h2>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {members.available_to_assign.map((m: any) => (
                      <div key={m.user_id} className="px-5 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-xs font-bold">
                            {m.name?.[0]?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="text-sm text-white">{m.name}</p>
                            <p className="text-xs text-gray-500">{m.email}</p>
                          </div>
                        </div>
                        <button onClick={() => handleAssign(m.user_id)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                          + Assign
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}