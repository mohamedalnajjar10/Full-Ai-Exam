// طبقة موحّدة للتعامل مع الباك اند: أنواع البيانات + دوال الطلبات + رسائل الأخطاء بالعربي
import { fetchWithAuth } from "./apiClient";
import { notifyQuotaChanged } from "./quotaSync";


// ---------- الأنواع ----------
// كلها صارت مشتركة مع الباك اند: packages/types
// منعيد تصديرها هون حتى ما تنكسر الاستيرادات الموجودة.

export type {
  Choice,
  GeneratedQuestion,
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  Quota,
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  ChatSession,
  ChatSource,
  AssessmentQuestionPublic,
  AssessmentQuestionDetail,
  Assessment,
  AssessmentAnswerDetail,
  AssessmentAttempt,
  GenerateAssessmentRequest,
  GenerateAssessmentResponse,
  SubmitAssessmentAnswerItem,
  SubmitAssessmentRequest,
  SubmitAssessmentResponse,
  AssessmentAttemptDetailResponse,
  AssessmentHistoryItem,
  AssessmentHistoryQuery,
  AssessmentHistoryResponse,
  BloomTaxonomyLevel,
  AssessmentAttemptStatus,
} from "@ai-exam/types";

import type {
  DifficultyLevel as Difficulty,
  GenerateQuestionsResponse,
  Quota,
  ChatMessage,
  ChatSession,
} from "@ai-exam/types";

/** كان اسمه Difficulty بالواجهة، وDifficultyLevel بالباك اند. */
export type { DifficultyLevel, DifficultyLevel as Difficulty } from "@ai-exam/types";

// ---------- الأخطاء ----------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetchWithAuth(path, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    let payload: any = undefined;
    try {
      const body = await res.json();
      payload = body;
      message = Array.isArray(body.message) ? body.message.join("، ") : (body.message ?? message);
    } catch {
      // الرد مش JSON
    }
    throw new ApiError(res.status, message, payload);
  }

  return res.json() as Promise<T>;
}

/** يحوّل أي خطأ من الطلبات لرسالة عربية مفهومة للطالب */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "انتهت صلاحية الجلسة، سجّل الدخول من جديد";
    if (err.status === 403) return "هذه الميزة متاحة لحسابات الطلاب فقط";
    if (err.status === 404) return "العنصر المطلوب غير موجود";
    if (err.status === 429) return "استنفدت الحد اليومي لتوليد الأسئلة، حاول غداً";
    if (err.status === 400 && /exam bank|No approved/i.test(err.message)) {
      return "لا توجد أسئلة معتمدة في بنك الامتحانات لهذه المادة بعد، جرّب مادة أخرى";
    }
    if (err.status === 400) return "الطلب غير صالح، تأكد من المدخلات وحاول مرة أخرى";
    if (err.status >= 500) return "خدمة الذكاء الاصطناعي غير متاحة حالياً، حاول بعد قليل";
    return err.message || "حدث خطأ غير متوقع";
  }
  if (err instanceof TypeError) return "تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت";
  return "حدث خطأ غير متوقع، حاول مرة أخرى";
}

// ---------- الأسئلة ----------

export async function generateQuestions(input: {
  subjectId: string;
  difficulty: Difficulty;
  count: number;
  topicId?: string;
}) {
  const res = await request<GenerateQuestionsResponse>("/questions/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  notifyQuotaChanged({ feature: "quiz" });
  return res;
}

export function getQuota() {
  return request<Quota>("/questions/quota");
}

// ---------- المحادثة ----------

export function listChatSessions() {
  return request<ChatSession[]>("/chat/sessions");
}

export function createChatSession(subjectId: string) {
  return request<ChatSession>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ subjectId }),
  });
}

export function getChatSession(id: string) {
  return request<ChatSession>(`/chat/sessions/${id}`);
}

export function closeChatSession(id: string) {
  return request<{ message: string }>(`/chat/sessions/${id}`, { method: "DELETE" });
}

export async function sendChatMessage(sessionId: string, message: string) {
  const res = await request<ChatMessage>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, locale: "ar" }),
  });
  notifyQuotaChanged({ feature: "chat" });
  return res;
}

export async function uploadChatFile(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await request<ChatMessage>(`/chat/sessions/${sessionId}/upload`, {
    method: "POST",
    body: form,
  });
  notifyQuotaChanged({ feature: "chat" });
  return res;
}

// ---------- تقييم القدرات (Student Capabilities Assessments) ----------

export async function generateAssessment(input: {
  subjectId: string;
  difficultyLevel?: string;
  title?: string;
}) {
  const res = await request<import("@ai-exam/types").GenerateAssessmentResponse>("/assessments/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
  notifyQuotaChanged({ feature: "assessment" });
  return res;
}

export function getAssessmentAttempt(id: string) {
  return request<import("@ai-exam/types").AssessmentAttemptDetailResponse>(`/assessments/attempts/${id}`);
}

export async function submitAssessmentAttempt(id: string, input: { answers: { questionId: string; answer: string }[] }) {
  const res = await request<import("@ai-exam/types").SubmitAssessmentResponse>(`/assessments/attempts/${id}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  notifyQuotaChanged({ feature: "assessment" });
  return res;
}

export function getAssessmentHistory(query: import("@ai-exam/types").AssessmentHistoryQuery = {}) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.status) params.set("status", query.status);
  const q = params.toString();
  return request<import("@ai-exam/types").AssessmentHistoryResponse>(`/assessments/history${q ? `?${q}` : ""}`);
}

// ---------- الاشتراكات والباقات (Subscriptions & Quotas) ----------

export type {
  SubscriptionPlanItem,
  UserSubscriptionStatus,
  RedeemVoucherResponse,
  FeatureDailyQuota,
  SubscriptionFeatureType,
} from "@ai-exam/types";

export function getSubscriptionPlans() {
  return request<import("@ai-exam/types").SubscriptionPlanItem[]>("/subscriptions/plans");
}

export function getMySubscriptionStatus() {
  return request<import("@ai-exam/types").UserSubscriptionStatus>("/subscriptions/my-status");
}

export async function redeemSubscriptionVoucher(code: string) {
  const res = await request<import("@ai-exam/types").RedeemVoucherResponse>("/subscriptions/redeem-voucher", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  notifyQuotaChanged();
  return res;
}

export function createSubscriptionCheckout(planCode: string) {
  return request<{ checkoutUrl: string; planCode: string; message: string }>("/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify({ planCode }),
  });
}

// مزامنة الرصيد اللحظية
export {
  notifyQuotaChanged,
  subscribeToQuotaChanges,
  getCachedQuotaStatus,
} from "./quotaSync";
export type { QuotaFeature, QuotaChangeEventDetail } from "./quotaSync";


