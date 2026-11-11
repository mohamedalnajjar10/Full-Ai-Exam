/**
 * طلبات «المحتوى والمعرفة» للوحة التحكم: رفع ومعالجة الملفات، المكتبة،
 * مراجعة الأسئلة المستخرجة، وبنك الأسئلة. بدّلت بيانات mock.ts لهالأقسام.
 */
import { downloadFile, json, qs, request } from "./http";
import type { Bloom, Difficulty, EmbeddingStatus } from "@/lib/bloom";

/* ───────── خيارات المعالجة ───────── */

export type ChunkStrategy = "structure" | "semantic" | "fixed";
export type OcrLanguage = "ara+eng" | "ara" | "eng";

export type OcrEngine = "local" | "ai";

export interface IngestionOptions {
  ocr: boolean;
  ocrEngine: OcrEngine;
  ocrLang: OcrLanguage;
  strategy: ChunkStrategy;
  chunkSize: number;
  overlap: number;
  stripHeaders: boolean;
  keepLatex: boolean;
  embedNow: boolean;
  dedupe: boolean;
  autoApprove: boolean;
  threshold: number;
}

export const getIngestionSettings = () => request<IngestionOptions>("/admin/knowledge/settings");

/* ───────── المهام ───────── */

export type Stage = "UPLOADED" | "EXTRACTING" | "CHUNKING" | "CHUNKED" | "EMBEDDING" | "INDEXED" | "FAILED";
export type SourceKind = "BOOK" | "EXAM";

export interface Job {
  id: string;
  name: string;
  kind: SourceKind;
  subjectId: string;
  subject: string;
  branch: string;
  year: number | null;
  term: string | null;
  bookPart: string | null;
  bookEdition: number | null;
  sizeMb: number;
  pages: number | null;
  stage: Stage;
  failedStage: Stage | null;
  progress: number;
  chunks: number;
  questions: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  by: string;
}

export interface JobDetail extends Job {
  log: { at: string; level: "info" | "warn" | "error"; step: string; message: string }[];
  stageTimings: Partial<Record<Stage, number>>;
  options: IngestionOptions;
}

export interface JobChunk {
  id: string;
  page: number | null;
  tokens: number | null;
  section: string | null;
  text: string;
  status: EmbeddingStatus;
  confidence?: number | null;
}

export interface JobList {
  data: Job[];
  counts: { all: number; running: number; done: number; failed: number };
  paused: boolean;
}

export interface EmbeddingInfo {
  enabled: boolean;
  provider: "gemini" | "openrouter" | null;
  model: string | null;
  dimensions: number;
}

export interface KnowledgeSummary {
  runningJobs: number;
  pendingReview: number;
  embedding: EmbeddingInfo;
  queuesEnabled: boolean;
  paused: boolean;
  /** عملية الـ worker (يلي بتعالج الملفات) شغّالة */
  workerOnline: boolean;
}

export const getSummary = () => request<KnowledgeSummary>("/admin/knowledge/summary");
export const listJobs = (status: string) => request<JobList>(`/admin/knowledge/jobs${qs({ status, limit: 100 })}`);
export const getJob = (id: string) => request<JobDetail>(`/admin/knowledge/jobs/${id}`);
export const getJobChunks = (id: string) => request<JobChunk[]>(`/admin/knowledge/jobs/${id}/chunks`);
export const retryJob = (id: string) => request<JobDetail>(`/admin/knowledge/jobs/${id}/retry`, { method: "POST" });
export const reembedJob = (id: string) => request<JobDetail>(`/admin/knowledge/jobs/${id}/reembed`, { method: "POST" });
export const rechunkJob = (id: string, options: Partial<IngestionOptions>) =>
  request<JobDetail>(`/admin/knowledge/jobs/${id}/rechunk`, { method: "POST", body: json({ options }) });
export const deleteJob = (id: string) => request<{ deleted: boolean }>(`/admin/knowledge/jobs/${id}`, { method: "DELETE" });
export const setQueuesPaused = (paused: boolean) =>
  request<{ paused: boolean }>("/admin/knowledge/queues", { method: "PUT", body: json({ paused }) });
export const downloadJobFile = (id: string, name: string) => downloadFile(`/admin/knowledge/jobs/${id}/file`, name);

export interface UploadInput {
  file: File;
  kind: SourceKind;
  subjectId: string;
  year?: number;
  term?: string;
  bookPart?: string;
  bookEdition?: number;
  options: IngestionOptions;
}

export function uploadSource(input: UploadInput) {
  const fd = new FormData();
  fd.set("file", input.file);
  fd.set("kind", input.kind);
  fd.set("subjectId", input.subjectId);
  if (input.kind === "EXAM") {
    fd.set("year", String(input.year));
    fd.set("term", input.term ?? "");
  } else {
    if (input.bookPart) fd.set("bookPart", input.bookPart);
    if (input.bookEdition) fd.set("bookEdition", String(input.bookEdition));
  }
  fd.set("options", json(input.options));
  return request<JobDetail>("/admin/knowledge/upload", { method: "POST", body: fd });
}

/* ───────── المكتبة ───────── */

export interface LibraryBook {
  id: string;
  name: string;
  pages: number | null;
  sizeMb: number;
  stage: Stage;
  progress: number;
  part: string | null;
  edition: number | null;
  chunks: number;
  options: IngestionOptions;
}

export interface LibrarySubject {
  id: string;
  name: string;
  branch: string;
  branchId: string;
  units: string[];
  bankQuestions: number;
  books: LibraryBook[];
  chunks: { total: number; indexed: number; failed: number; avgTokens: number };
  hasBook?: boolean;
  bookPdfOriginalName?: string | null;
  bookPdfSize?: number | null;
}

export interface LibraryChunk {
  id: string;
  documentId: string;
  ordinal: number;
  pageStart: number;
  pageEnd: number;
  section: string | null;
  unit: string | null;
  text: string;
  tokens: number;
  embeddingStatus: EmbeddingStatus;
}

export interface ExamFileRow {
  id: string;
  documentId: string | null;
  name: string;
  subject: string;
  branch: string;
  year: number;
  term: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  sizeMb: number;
  extracted: number;
  approved: number;
  pending: number;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export const getLibrarySubjects = () => request<LibrarySubject[]>("/admin/knowledge/library/subjects");
export const getSubjectChunks = (id: string, p: { q?: string; unit?: string; page?: number }) =>
  request<Paged<LibraryChunk>>(`/admin/knowledge/library/subjects/${id}/chunks${qs({ ...p, limit: 30 })}`);
export const getSubjectUnits = (id: string) => request<string[]>(`/admin/knowledge/library/subjects/${id}/units`);
export const reembedSubject = (id: string) =>
  request<{ queued: number }>(`/admin/knowledge/library/subjects/${id}/reembed`, { method: "POST" });
export const deleteSubjectBooks = (id: string) =>
  request<{ deleted: number }>(`/admin/knowledge/library/subjects/${id}/books`, { method: "DELETE" });

export function uploadSubjectBook(subjectId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return request<{ message: string; subject: unknown }>(`/subjects/${subjectId}/book`, {
    method: "POST",
    body: fd,
  });
}

export const deleteSubjectBook = (subjectId: string) =>
  request<{ message: string }>(`/subjects/${subjectId}/book`, { method: "DELETE" });
export const getExamFiles = (p: { branch?: string; q?: string }) =>
  request<ExamFileRow[]>(`/admin/knowledge/library/exams${qs(p)}`);

export interface RetrievedChunk {
  id: string;
  text: string;
  section: string | null;
  pageStart: number;
  pageEnd: number;
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

export const searchKnowledge = (subjectId: string, query: string, unit?: string) =>
  request<RetrievedChunk[]>("/admin/knowledge/search", { method: "POST", body: json({ subjectId, query, unit, limit: 8 }) });

/* ───────── المراجعة ───────── */

export interface Choice {
  label: string;
  text: string;
}

export interface StagedQuestion {
  id: string;
  examFileId: string;
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  explanation: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  number: number | null;
  confidence: number | null;
  flags: string[];
  suggestedDifficulty: Difficulty | null;
  suggestedBloom: Bloom | null;
  suggestedUnit: string | null;
  examFile: { originalName: string; subjectId: string; year: number; term: string; subject: { name: string } };
}

export const listStaged = (p: { subjectId?: string; flaggedOnly?: boolean; examFileId?: string }) =>
  request<Paged<StagedQuestion>>(`/admin/staged-questions${qs({ ...p, status: "PENDING", limit: 200 })}`);
export const updateStaged = (id: string, patch: Partial<Pick<StagedQuestion, "questionText" | "choices" | "correctAnswer" | "explanation">>) =>
  request<StagedQuestion>(`/admin/staged-questions/${id}`, {
    method: "PATCH",
    body: json({ ...patch, explanation: patch.explanation ?? undefined }),
  });
export const approveStaged = (id: string, body: { difficulty: Difficulty; bloomTaxonomy: Bloom; topicId?: string }) =>
  request<{ id: string }>(`/admin/staged-questions/${id}/approve`, { method: "POST", body: json(body) });
export const rejectStaged = (id: string) => request(`/admin/staged-questions/${id}/reject`, { method: "POST" });

/* ───────── البنك ───────── */

export interface BankQuestion {
  id: string;
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  explanation: string | null;
  subjectId: string;
  year: number;
  term: string;
  difficulty: Difficulty;
  bloomTaxonomy: Bloom;
  topicId: string | null;
  sourceFileId: string | null;
  embeddingStatus: EmbeddingStatus;
  usageCount: number;
  subject: { name: string };
  branch: { name: string };
}

export interface BankFilters {
  q?: string;
  subjectId?: string;
  difficulty?: string;
  bloomTaxonomy?: string;
  embeddingStatus?: string;
  page?: number;
}

export const listBank = (f: BankFilters) => request<Paged<BankQuestion>>(`/admin/exam-bank/questions${qs({ ...f, limit: 20 })}`);
export const getBankStats = () => request<{ total: number; indexed: number; pending: number; failed: number }>("/admin/exam-bank/stats");
export const getBankQuestion = (id: string) =>
  request<BankQuestion & { source: { originalName: string; year: number; term: string } | null }>(`/admin/exam-bank/questions/${id}`);
export const getSimilar = (id: string) =>
  request<{ id: string; questionText: string; similarity: number }[]>(`/admin/exam-bank/questions/${id}/similar`);
export const updateBankQuestion = (id: string, patch: Partial<BankQuestion>) =>
  request<BankQuestion>(`/admin/exam-bank/questions/${id}`, { method: "PATCH", body: json(patch) });
export const deleteBankQuestion = (id: string) => request(`/admin/exam-bank/questions/${id}`, { method: "DELETE" });
export const createBankQuestion = (body: {
  subjectId: string;
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  explanation?: string;
  year: number;
  term: string;
  difficulty: Difficulty;
  bloomTaxonomy: Bloom;
  topicId?: string;
}) => request<BankQuestion>("/admin/exam-bank/questions", { method: "POST", body: json(body) });
export const bulkBank = (action: "reembed" | "difficulty" | "delete", ids: string[], difficulty?: Difficulty) =>
  request<{ affected: number }>("/admin/exam-bank/questions/bulk", { method: "POST", body: json({ action, ids, difficulty }) });
export const exportBank = (f: BankFilters) => downloadFile(`/admin/exam-bank/export${qs({ ...f, page: undefined })}`, "question-bank.csv");
export function importBankCsv(subjectId: string, file: File) {
  const fd = new FormData();
  fd.set("subjectId", subjectId);
  fd.set("file", file);
  return request<{ imported: number; errors: { row: number; message: string }[] }>("/admin/exam-bank/import", { method: "POST", body: fd });
}

/* ───────── مساعدات ───────── */

// كانت معرّفة هون؛ صارت مشتركة بـ http.ts — منعيد تصديرها حتى ما تنكسر الاستيرادات
export { ApiError, downloadFile, errorMessage } from "./http";

/** حجم بالميجابايت للعرض — الملفات الصغيرة كانت تطلع «0» */
export function mb(n: number) {
  return n < 0.1 ? "< 0.1 م.ب" : `${n} م.ب`;
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function duration(ms?: number) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  return `${m} د ${s % 60} ث`;
}
