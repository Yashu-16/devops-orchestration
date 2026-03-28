// lib/api.ts — Updated in Phase 7

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : "http://localhost:8000/api/v1";

// Add this after the existing API_BASE line

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Automatically attach the JWT token to every request
api.interceptors.request.use(config => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Redirect to login if token expires
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

export interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  repository: string | null;
  branch: string;
  created_at: string;
  run_count: number;
  last_status: string | null;
  self_heal_enabled: boolean;
  max_retries: number;
}

export interface StageLog {
  id: number;
  run_id: number;
  order: number;
  name: string;
  status: string;
  passed: boolean;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  output: string | null;
  error_output: string | null;
}

export interface PipelineRun {
  id: number;
  pipeline_id: number;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  triggered_by: string;
  environment: string | null;
  git_commit: string | null;
  git_author: string | null;
  runner_os: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  stages_total: number;
  stages_passed: number;
  stages_failed: number;
  failed_stage: string | null;
  error_message: string | null;
  logs: string | null;
  risk_score: number | null;
  root_cause: string | null;
  recommendation: string | null;
  created_at: string;
  stage_logs: StageLog[];
  is_retry: boolean;
  retry_count: number;
  parent_run_id: number | null;
}

export interface DashboardStats {
  total_pipelines: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_duration_seconds: number;
  most_failing_stage: string | null;
  total_stage_runs: number;
  failure_categories: Record<string, number>;
}

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface RiskAssessment {
  pipeline_id: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  confidence: number;
  factors: RiskFactor[];
  recommendation: string;
  based_on_runs: number;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  action_steps: string[];
  priority: string;
  effort: string;
  impact: string;
  category: string;
  applies_to_stage: string | null;
}

export interface RecommendationReport {
  pipeline_id: number;
  run_id: number | null;
  recommendations: Recommendation[];
  summary: string;
  total_count: number;
  p1_count: number;
  generated_from: string;
}

export interface HealingLog {
  id: number;
  pipeline_id: number;
  run_id: number;
  action: string;
  reason: string;
  result: string | null;
  retry_number: number;
  new_run_id: number | null;
  failure_category: string | null;
  risk_score: number | null;
  created_at: string;
}

export const getPipelines      = () =>
  api.get<Pipeline[]>("/pipelines").then(r => r.data);
export const createPipeline    = (
  data: Omit<Pipeline, "id"|"created_at"|"run_count"|"last_status"|"self_heal_enabled"|"max_retries">
) => api.post<Pipeline>("/pipelines", data).then(r => r.data);
export const deletePipeline    = (id: number) =>
  api.delete(`/pipelines/${id}`);
export const triggerRun        = (id: number) =>
  api.post<PipelineRun>(`/pipelines/${id}/run`).then(r => r.data);
export const getRuns           = () =>
  api.get<PipelineRun[]>("/runs").then(r => r.data);
export const getRunStages      = (runId: number) =>
  api.get<StageLog[]>(`/runs/${runId}/stages`).then(r => r.data);
export const getStats          = () =>
  api.get<DashboardStats>("/dashboard/stats").then(r => r.data);
export const getAllRisks        = () =>
  api.get<RiskAssessment[]>("/dashboard/risks").then(r => r.data);
export const getPipelineRecs   = (id: number) =>
  api.get<RecommendationReport>(
    `/pipelines/${id}/recommendations`
  ).then(r => r.data);
export const updateHealingConfig = async (
  id: number,
  config: { self_heal_enabled: boolean; max_retries: number }
): Promise<Pipeline> => {
  try {
    const response = await api.patch<Pipeline>(
      `/pipelines/${id}/healing`,
      config
    );
    return response.data;
  } catch (error: any) {
    console.error("updateHealingConfig error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: error.config?.url,
    });
    throw error;
  }
};
export const getHealingLogs    = (id: number) =>
  api.get<HealingLog[]>(`/pipelines/${id}/healing`).then(r => r.data);
export const getAllHealingLogs  = () =>
  api.get<HealingLog[]>("/dashboard/healing").then(r => r.data);