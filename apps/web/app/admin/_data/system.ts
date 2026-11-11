import { json, qs, request } from "./http";

export interface CatalogModel {
  id: string;
  provider: string;
  context: number;
  input: ("text" | "image" | "pdf")[];
  structured: boolean;
  priceIn: number;
  priceOut: number;
  latencyP50: number;
  successRate: number;
  arabic: 1 | 2 | 3;
}

export interface TaskRoute {
  task: string;
  label: string;
  description: string;
  model: string;
  temperature: number;
  maxTokens: number;
  needs: ("image" | "pdf" | "structured")[];
}

export interface PromptTemplate {
  id: string;
  task: string;
  name: string;
  version: number;
  updated: string;
  by: string;
  variables: string[];
  body: string;
  history: { version: number; when: string; by: string; note: string }[];
}

export interface AiConfigResponse {
  catalog: CatalogModel[];
  routes: TaskRoute[];
  fallbackChain: string[];
  prompts: PromptTemplate[];
  guardrails: {
    strictness?: "lenient" | "balanced" | "strict";
    categories?: boolean[];
    confidenceThreshold?: number;
    fileValidationEnabled?: boolean;
    fileConfidenceThreshold?: number;
    piiMaskingEnabled?: boolean;
    rateLimitPerMinute?: number;
    autoSuspendAbuse?: boolean;
    rejectionMessage?: string;
  };
}

export interface PlatformSettings {
  general: {
    siteName: string;
    slogan?: string;
    academicYear?: string;
    timezone?: string;
    seoDescription?: string;
    supportEmail?: string;
    phone?: string;
  };
  auth: {
    openRegistration: boolean;
    verifyEmail: boolean;
    allowGoogleLogin: boolean;
    enforceAdmin2fa: boolean;
  };
  email: {
    smtpHost: string;
    smtpPort: number;
    senderName: string;
    senderEmail: string;
  };
  storage: {
    driver: "local" | "s3";
    bucket: string;
    endpoint?: string;
  };
  features: {
    aiAssistant: boolean;
    styleMatching: boolean;
    ministerialQuizzes: boolean;
    dailyPlan: boolean;
    successStories: boolean;
    bookDownload: boolean;
  };
  maintenance: {
    enabled: boolean;
    message?: string;
  };
}

export interface FailedJobEntry {
  id: string;
  queue: string;
  error: string;
  attempts: number;
  when: string;
}

export interface HealthDiagnosticsResponse {
  timestamp: string;
  overall: "ok" | "warn" | "error";
  summary: string;
  services: {
    name: string;
    detail: string;
    status: "ok" | "degraded" | "down";
    latencyMs: number;
    metrics: Record<string, string | number>;
  }[];
  queues: {
    name: string;
    label: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    paused: boolean;
  }[];
  failedJobs: FailedJobEntry[];
}

export interface SystemAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  detail: string;
  ip: string;
}

/* ───────── API Client Calls ───────── */

export const getAiConfig = () => request<AiConfigResponse>("/admin/system/ai-config");

export const saveAiRoutes = (routes: TaskRoute[]) =>
  request<{ success: boolean; routes: TaskRoute[] }>("/admin/system/ai-routes", {
    method: "PUT",
    body: json({ routes }),
  });

export const saveAiPrompts = (prompts: PromptTemplate[]) =>
  request<{ success: boolean; prompts: PromptTemplate[] }>("/admin/system/ai-prompts", {
    method: "PUT",
    body: json({ prompts }),
  });

export const saveAiGuardrails = (guardrails: Record<string, unknown>) =>
  request<{ success: boolean; guardrails: Record<string, unknown> }>("/admin/system/ai-guardrails", {
    method: "PUT",
    body: json(guardrails),
  });

export const getPlatformSettings = () => request<PlatformSettings>("/admin/system/settings");

export const savePlatformSettings = (settings: Partial<PlatformSettings>) =>
  request<{ success: boolean; settings: PlatformSettings }>("/admin/system/settings", {
    method: "PUT",
    body: json(settings),
  });

export const getHealthDiagnostics = () => request<HealthDiagnosticsResponse>("/admin/system/health");

export const getAuditLogs = (params?: { q?: string; area?: string; range?: string | number }) =>
  request<SystemAuditEntry[]>(`/admin/system/audit${qs(params || {})}`);

export const getIngestionSettings = () =>
  request<Record<string, unknown>>("/admin/knowledge/settings");

export const saveIngestionSettings = (settings: Record<string, unknown>) =>
  request<Record<string, unknown>>("/admin/knowledge/settings", {
    method: "PUT",
    body: json(settings),
  });

export const searchRetrieval = (params: {
  query: string;
  subjectId?: string;
  limit?: number;
  minSimilarity?: number;
}) =>
  request<
    {
      id: string;
      text: string;
      subject?: string;
      unit?: string;
      similarity: number;
      keywordScore?: number;
      fusedScore?: number;
      sourceKind?: string;
    }[]
  >("/admin/knowledge/search", {
    method: "POST",
    body: json(params),
  });
