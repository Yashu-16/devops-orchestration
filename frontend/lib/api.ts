import axios from "axios";

// Gets backend URL at request time from config.js
// config.js sets window.__API_URL__ = "https://your-backend.railway.app"
function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const w = window as any;
    if (w.__API_URL__) return w.__API_URL__;
  }
  return "http://localhost:8000";
}

const api = axios.create({
  headers: { "Content-Type": "application/json" },
});

// Set correct baseURL and token on EVERY request
api.interceptors.request.use(config => {
  config.baseURL = `${getBackendUrl()}/api/v1`;
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("org");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ── Types ─────────────────────────────────────────────────────────

export interface Pipeline {
  id: number; name: string; description: string;
  repository: string; branch: string;
  created_at: string; updated_at: string;
  run_count: number; last_status: string | null;
  self_heal_enabled: boolean; max_retries: number;
}

export interface StageLog {
  id: number; run_id: number; order: number;
  name: string; status: string; passed: boolean;
  started_at: string; completed_at: string;
  duration_seconds: number;
  output: string | null; error_output: string | null;
}

export interface PipelineRun {
  id: number; pipeline_id: number; status: string;
  triggered_by: string; environment: string;
  git_commit: string | null; git_author: string | null;
  started_at: string | null; completed_at: string | null;
  duration_seconds: number | null;
  stages_total: number; stages_passed: number; stages_failed: number;
  failed_stage: string | null; root_cause: string | null;
  recommendation: string | null; logs: string | null;
  is_retry: boolean; retry_count: number; stage_logs: StageLog[];
}

export interface DashboardStats {
  total_pipelines: number; total_runs: number;
  successful_runs: number; failed_runs: number;
  success_rate: number; avg_duration_seconds: number;
  most_failing_stage: string | null; total_stage_runs: number;
  failure_categories: Record<string, number>;
}

export interface RiskFactor {
  name: string; score: number; weight: number; description: string;
}

export interface RiskAssessment {
  pipeline_id: number; risk_score: number; risk_level: string;
  confidence: number; factors: RiskFactor[];
  recommendation: string; based_on_runs: number;
}

export interface Recommendation {
  id: string; title: string; description: string;
  action_steps: string[]; priority: string;
  effort: string; impact: string; category: string;
  applies_to_stage: string | null;
}

export interface RecommendationReport {
  pipeline_id: number; run_id: number | null;
  recommendations: Recommendation[]; summary: string;
  total_count: number; p1_count: number; generated_from: string;
}

export interface HealingLog {
  id: number; pipeline_id: number; run_id: number;
  new_run_id: number | null; action: string;
  reason: string; result: string | null;
  failure_category: string | null; created_at: string;
}

// ── API Functions ─────────────────────────────────────────────────

export const getPipelines     = () => api.get<Pipeline[]>("/pipelines").then(r => r.data);
export const createPipeline   = (data: any) => api.post<Pipeline>("/pipelines", data).then(r => r.data);
export const deletePipeline   = (id: number) => api.delete(`/pipelines/${id}`);
export const triggerRun       = (id: number) => api.post<PipelineRun>(`/pipelines/${id}/run`).then(r => r.data);
export const getRuns          = () => api.get<PipelineRun[]>("/runs").then(r => r.data);
export const getRunStages     = (id: number) => api.get<StageLog[]>(`/runs/${id}/stages`).then(r => r.data);
export const getStats         = () => api.get<DashboardStats>("/dashboard/stats").then(r => r.data);
export const getAllRisks       = () => api.get<RiskAssessment[]>("/dashboard/risks").then(r => r.data);
export const getPipelineRecs  = (id: number) => api.get<RecommendationReport>(`/pipelines/${id}/recommendations`).then(r => r.data);
export const updateHealingConfig = (id: number, config: any) => api.patch(`/pipelines/${id}/healing`, config).then(r => r.data);
export const getHealingLogs   = (id: number) => api.get<HealingLog[]>(`/pipelines/${id}/healing`).then(r => r.data);
export const getAllHealingLogs = () => api.get<HealingLog[]>("/dashboard/healing").then(r => r.data);