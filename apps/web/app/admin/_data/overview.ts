import { request } from "./http";

export interface OverviewKpi {
  value: number;
  delta: number;
  trend: number[];
}

export interface OverviewJob {
  id: string;
  name: string;
  kind: "book" | "exam";
  subject: string;
  branch: string;
  stage: "uploaded" | "extracting" | "chunking" | "embedding" | "indexed" | "failed";
  progress: number;
  chunks: number;
  error: string | null;
  startedAt: string;
}

export interface OverviewSubjectReadiness {
  id: string;
  name: string;
  branch: string;
  chunks: number;
  indexed: number;
  percent: number;
}

export interface OverviewServiceHealth {
  name: string;
  detail: string;
  status: "ok" | "degraded" | "down";
}

export interface OverviewQueue {
  name: string;
  label: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface OverviewActivity {
  id: string;
  icon: "upload" | "check" | "cpu" | "book" | "shield" | "user";
  who: string;
  what: string;
  target: string;
  when: string;
}

export interface AdminOverviewData {
  timestamp: string;
  rangeDays: number;
  kpis: {
    students: OverviewKpi;
    activeToday: OverviewKpi;
    bankQuestions: OverviewKpi;
    aiCost: {
      value: string;
      rawCost: number;
      note?: string;
    };
  };
  aiRequestsSeries: { day: string; value: number }[];
  requestsByTask: { label: string; value: number }[];
  pipeline: {
    activeJobsCount: number;
    jobs: OverviewJob[];
  };
  knowledgeReadiness: {
    overallPercent: number;
    totalChunks: number;
    indexedChunks: number;
    subjects: OverviewSubjectReadiness[];
  };
  services: OverviewServiceHealth[];
  queues: OverviewQueue[];
  activity: OverviewActivity[];
}

export function getAdminOverview(range: "7" | "30" = "30"): Promise<AdminOverviewData> {
  return request<AdminOverviewData>(`/admin/overview?range=${range}`);
}
