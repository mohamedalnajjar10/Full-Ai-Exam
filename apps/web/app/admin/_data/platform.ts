/**
 * طلبات قسم «المنصة» بلوحة التحكم: الفروع والمواد، المستخدمون، الأدوار،
 * المحادثات، والاستهلاك. بدّلت بيانات mock.ts لهالصفحات.
 */
import type { Permission } from "@ai-exam/types";
import { downloadFile, json, qs, request } from "./http";

/* ───────── الفروع والمواد ───────── */

export interface AcademicsBranch {
  id: string;
  name: string;
  students: number;
  subjects: number;
}

export interface AcademicsSubject {
  id: string;
  name: string;
  branchId: string;
  units: string[];
  bankQuestions: number;
  students: number;
  books: { indexed: number; processing: number; failed: number; legacyPdf: string | null };
}

export interface AcademicsTeacher {
  id: string;
  name: string;
  title: string;
  bio: string;
  hasPhoto: boolean;
  yearsOfExperience: number | null;
  isActive: boolean;
  displayOrder: number;
  subjectId: string | null;
  subjectName: string | null;
}

export interface Academics {
  branches: AcademicsBranch[];
  subjects: AcademicsSubject[];
  teachers: AcademicsTeacher[];
}

export const getAcademics = () => request<Academics>("/admin/academics");
/** عام — صفحات بدون صلاحية المنهاج (المستخدمون) بتحتاج أسماء الفروع بس */
export const listBranches = () => request<{ id: string; name: string }[]>("/branches");
export const saveUnits = (subjectId: string, units: string[]) =>
  request<{ id: string; units: string[] }>(`/admin/academics/subjects/${subjectId}/units`, { method: "PUT", body: json({ units }) });

export const createBranch = (name: string) => request<{ id: string; name: string }>("/branches", { method: "POST", body: json({ name }) });
export const renameBranch = (id: string, name: string) =>
  request<{ id: string; name: string }>(`/admin/academics/branches/${id}`, { method: "PATCH", body: json({ name }) });
export const deleteBranch = (id: string) => request<{ id: string }>(`/admin/academics/branches/${id}`, { method: "DELETE" });

export const createSubject = (name: string, branchId: string) => request<{ id: string }>("/subjects", { method: "POST", body: json({ name, branchId }) });
export const renameSubject = (id: string, name: string) => request<{ id: string }>(`/subjects/${id}`, { method: "PATCH", body: json({ name }) });
export const deleteSubject = (id: string) => request<{ message: string }>(`/subjects/${id}`, { method: "DELETE" });

export interface TeacherInput {
  name: string;
  title: string;
  bio: string;
  subjectId?: string;
  yearsOfExperience?: number;
  isActive?: boolean;
}

/** الإنشاء multipart (الصورة اختيارية)، والتعديل JSON */
export function createTeacher(input: TeacherInput, photo?: File | null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(input)) if (v !== undefined && v !== "") fd.append(k, String(v));
  if (photo) fd.append("file", photo);
  return request<{ id: string }>("/teachers", { method: "POST", body: fd });
}
export const updateTeacher = (id: string, patch: Partial<TeacherInput>) =>
  request<{ id: string }>(`/teachers/${id}`, { method: "PATCH", body: json(patch) });
export function uploadTeacherPhoto(id: string, photo: File) {
  const fd = new FormData();
  fd.append("file", photo);
  return request(`/teachers/${id}/photo`, { method: "POST", body: fd });
}
export const deleteTeacher = (id: string) => request(`/teachers/${id}`, { method: "DELETE" });
export const reorderTeachers = (ids: string[]) =>
  request("/teachers/reorder", { method: "POST", body: json({ orders: ids.map((id, i) => ({ id, displayOrder: i + 1 })) }) });

/* ───────── المستخدمون ───────── */

export type UserStatus = "active" | "suspended" | "unverified";

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  /** "student" أو معرّف دور فريق (null = حساب فريق بلا دور) */
  role: string | null;
  roleName: string;
  branch: { id: string; name: string } | null;
  status: UserStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  twoFactor: boolean;
  provider: "google" | "email";
  hasPassword: boolean;
  lastActiveAt: string | null;
  dailyQuota: number | null;
  createdAt: string;
  generationsToday: number;
}

export interface AdminUserDetail extends AdminUserRow {
  quota: { limit: number | null; used: number; resetAt: string };
  sessions: { id: string; createdAt: string; expiresAt: string }[];
  activity: { chats: number; messages: number; generated: number };
}

export interface UserFilters {
  q?: string;
  role?: string;
  status?: string;
  branchId?: string;
  page?: number;
}

export interface UserList {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  stats: { total: number; activeWeek: number; unverified: number; suspended: number };
}

export const listUsers = (f: UserFilters) => request<UserList>(`/admin/users${qs({ ...f, limit: 25 })}`);
export const getUser = (id: string) => request<AdminUserDetail>(`/admin/users/${id}`);
export const updateUser = (id: string, patch: { role?: string; dailyQuota?: number | null }) =>
  request<AdminUserDetail>(`/admin/users/${id}`, { method: "PATCH", body: json(patch) });
export const suspendUser = (id: string, reason: string) =>
  request<AdminUserDetail>(`/admin/users/${id}/suspend`, { method: "POST", body: json({ reason }) });

type UserAction = "unsuspend" | "verify-email" | "disable-2fa" | "end-sessions" | "reset-quota";
export const userAction = (id: string, action: UserAction) => request<AdminUserDetail>(`/admin/users/${id}/${action}`, { method: "POST" });
export const sendPasswordReset = (id: string) => request<{ message: string }>(`/admin/users/${id}/password-reset`, { method: "POST" });
export const inviteUser = (body: { email: string; name?: string; roleId: string }) =>
  request<AdminUserDetail>("/admin/users/invite", { method: "POST", body: json(body) });
export const exportUsers = (f: UserFilters) => downloadFile(`/admin/users/export.csv${qs({ ...f, page: undefined })}`, "users.csv");

/* ───────── الأدوار ───────── */

export interface StaffRole {
  id: string;
  name: string;
  description: string;
  system: boolean;
  dailyQuota: number | null;
  members: number;
  permissions: Permission[];
}

export const listRoles = () => request<{ roles: StaffRole[]; students: number }>("/admin/roles");
export const saveMatrix = (roles: { id: string; permissions: string[] }[]) =>
  request<{ roles: StaffRole[]; students: number }>("/admin/roles/matrix", { method: "PUT", body: json({ roles }) });
export const createRole = (body: { id: string; name: string; description?: string; permissions: string[] }) =>
  request<{ roles: StaffRole[]; students: number }>("/admin/roles", { method: "POST", body: json(body) });
export const updateRole = (id: string, body: { name: string; description?: string; permissions: string[] }) =>
  request<{ roles: StaffRole[]; students: number }>(`/admin/roles/${id}`, { method: "PUT", body: json(body) });
export const deleteRole = (id: string) => request<{ roles: StaffRole[]; students: number }>(`/admin/roles/${id}`, { method: "DELETE" });

/* ───────── المحادثات ───────── */

export type Intent = "GENERATE_QUESTIONS" | "FOLLOW_UP" | "ASK_CONTENT" | "GREETING" | "OFF_TOPIC";

export const INTENT_LABEL: Record<string, string> = {
  GENERATE_QUESTIONS: "طلب أسئلة",
  FOLLOW_UP: "متابعة",
  ASK_CONTENT: "سؤال عن الدرس",
  GREETING: "تحية",
  OFF_TOPIC: "خارج المادة",
};

export interface ConversationStats {
  days: number;
  intents: { intent: string; count: number }[];
  sessions: number;
  studentMessages: number;
  offTopicRate: number | null;
  errorRate: number | null;
  medianLatencyMs: Record<string, number | null>;
}

export interface ConversationRow {
  id: string;
  student: { id: string; name: string | null; email: string };
  subject: { id: string; name: string };
  isActive: boolean;
  flagged: boolean;
  flagNote: string | null;
  messages: number;
  errors: number;
  updatedAt: string;
}

export interface TranscriptMessage {
  id: string;
  role: "STUDENT" | "ASSISTANT" | "SYSTEM";
  type: "TEXT" | "QUESTIONS" | "FILE_UPLOAD" | "ERROR";
  content: string;
  fileMimeType: string | null;
  createdAt: string;
  intent: string | null;
  confidence: number | null;
  questionCount: number;
  sourceCount: number;
  sourceType: string | null;
}

export interface Transcript {
  id: string;
  isActive: boolean;
  flagged: boolean;
  flaggedAt: string | null;
  flagNote: string | null;
  flaggedBy: { name: string | null; email: string } | null;
  student: { id: string; name: string | null; email: string };
  subject: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  messages: TranscriptMessage[];
}

export const getConversationStats = () => request<ConversationStats>("/admin/conversations/stats");
export const listConversations = (f: { filter?: string; q?: string; page?: number }) =>
  request<{ items: ConversationRow[]; total: number; page: number; limit: number }>(`/admin/conversations${qs({ ...f, limit: 30 })}`);
export const getTranscript = (id: string) => request<Transcript>(`/admin/conversations/${id}`);
export const flagConversation = (id: string, flagged: boolean, note?: string) =>
  request<Transcript>(`/admin/conversations/${id}/flag`, { method: "PUT", body: json({ flagged, note }) });

/* ───────── الاستهلاك ───────── */

export interface UsageLimits {
  dailyQuota: number;
  perRequestMax: number;
  monthlyBudgetUsd: number;
  alertAtPct: number;
  hardStop: boolean;
}

export interface UsageOverview {
  days: number;
  series: { day: string; requests: number; errors: number; cost: number }[];
  totals: { requests: number; errors: number; cost: number };
  models: {
    model: string;
    provider: string;
    requests: number;
    errorRate: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    medianLatencyMs: number | null;
  }[];
  tasks: { task: string; requests: number; errors: number; cost: number }[];
  topStudents: { id: string; name: string; branch: string | null; requests: number }[];
  budget: UsageLimits & { spentUsd: number; blocked: boolean };
  roleQuotas: { id: string; name: string; dailyQuota: number | null; system: boolean }[];
}

export const TASK_LABEL: Record<string, string> = {
  classification: "تصنيف الرسائل",
  generation: "توليد الأسئلة",
  answer: "شرح الدروس",
  extraction: "استخراج الامتحانات",
  validation: "فحص الملفات",
  style: "تحليل النمط",
  transcription: "التعرّف الضوئي",
  embedding: "التضمين",
  other: "أخرى",
};

export const getUsage = () => request<UsageOverview>("/admin/usage");
export const saveUsageLimits = (patch: Partial<UsageLimits>) => request<UsageLimits>("/admin/usage/limits", { method: "PUT", body: json(patch) });
export const saveRoleQuotas = (roles: { id: string; dailyQuota: number | null }[]) =>
  request<UsageOverview>("/admin/usage/role-quotas", { method: "PUT", body: json({ roles }) });

/* ───────── مساعدات ───────── */

/** «قبل 3 دقائق» — للنشاط والتواريخ القريبة */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "short", day: "numeric" });
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`;
}

export function usd(v: number): string {
  return v === 0 ? "$0" : v < 0.01 ? "< $0.01" : `$${v.toFixed(2)}`;
}
