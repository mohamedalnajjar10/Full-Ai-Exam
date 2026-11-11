import type { BloomTaxonomyLevel, AssessmentAttemptStatus, DifficultyLevel } from "@ai-exam/types";

export const BLOOM_LABELS: Record<BloomTaxonomyLevel, { name: string; enName: string; desc: string }> = {
  REMEMBER: {
    name: "تذكّر",
    enName: "Remember",
    desc: "استرجاع المفاهيم والمصطلحات والحقائق الأساسية",
  },
  UNDERSTAND: {
    name: "فهم واستيعاب",
    enName: "Understand",
    desc: "شرح الأفكار وتفسير المعاني والمفاهيم",
  },
  APPLY: {
    name: "تطبيق",
    enName: "Apply",
    desc: "توظيف القوانين والمسائل في مواقف جديدة",
  },
  ANALYZE: {
    name: "تحليل",
    enName: "Analyze",
    desc: "تفكيك العلاقات المنطقية واستنتاج الروابط",
  },
  EVALUATE: {
    name: "تقييم ونقد",
    enName: "Evaluate",
    desc: "الحكم على صحة النتائج والتحقق من الاستدلال",
  },
  CREATE: {
    name: "تركيب وابتكار",
    enName: "Create",
    desc: "صياغة الحلول المركبة وبناء الاستنتاجات",
  },
};

export const BLOOM_BADGE_STYLES: Record<BloomTaxonomyLevel, { bg: string; text: string; border: string; dot: string }> = {
  REMEMBER: {
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    dot: "bg-sky-500",
  },
  UNDERSTAND: {
    bg: "bg-indigo-50",
    text: "text-indigo-800",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
  },
  APPLY: {
    bg: "bg-teal-50",
    text: "text-teal-800",
    border: "border-teal-200",
    dot: "bg-teal-500",
  },
  ANALYZE: {
    bg: "bg-purple-50",
    text: "text-purple-800",
    border: "border-purple-200",
    dot: "bg-purple-500",
  },
  EVALUATE: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  CREATE: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-500",
  },
};

export const STATUS_LABELS: Record<AssessmentAttemptStatus, { label: string; badgeCls: string }> = {
  PENDING: {
    label: "قيد الحل (معلّق)",
    badgeCls: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  },
  COMPLETED: {
    label: "مكتمل",
    badgeCls: "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-700/20",
  },
};

export const DIFFICULTY_AR_LABELS: Record<DifficultyLevel, string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  HARD: "متقدم",
};

export interface ParsedAiDiagnosticFeedback {
  overallEvaluation: string;
  strengths: string[];
  weaknesses: string[];
  studyPlan: string[];
  rawText: string;
}

/**
 * يحلل نص التقرير التشخيصي الصادر من الذكاء الاصطناعي ويقسمه إلى 4 أقسام منظمة
 */
export function parseAiFeedback(feedback: string | null | undefined): ParsedAiDiagnosticFeedback {
  const rawText = feedback?.trim() || "";
  if (!rawText) {
    return {
      overallEvaluation: "لم يتوفر تحليل تشخيصي تفصيلي لهذه المحاولة.",
      strengths: [],
      weaknesses: [],
      studyPlan: [],
      rawText: "",
    };
  }

  // التقسيم بالاعتماد على الترويسات الثلاثية ### 1، ### 2، إلخ
  const parts = rawText.split(/###\s*[1-4]\.\s*/i);

  let overall = "";
  let strengthsText = "";
  let weaknessesText = "";
  let planText = "";

  if (parts.length >= 5) {
    overall = parts[1]?.trim() || "";
    strengthsText = parts[2]?.trim() || "";
    weaknessesText = parts[3]?.trim() || "";
    planText = parts[4]?.trim() || "";
  } else {
    // محاولة تقسيم مرنة لو كانت الترويسات بدون أرقام
    const regex = /###\s*(?:[^\n]+)/g;
    const matches = Array.from(rawText.matchAll(regex));
    if (matches.length > 0) {
      overall = rawText;
    } else {
      overall = rawText;
    }
  }

  const cleanBullets = (text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-") || line.startsWith("•") || line.startsWith("*") || /^\d+\./.test(line))
      .map((line) => line.replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "").trim())
      .filter((line) => line.length > 0);
  };

  const strengths = cleanBullets(strengthsText);
  const weaknesses = cleanBullets(weaknessesText);
  const studyPlan = cleanBullets(planText);

  // إذا لم تكن نقاطاً، نحتفظ بالنص كما هو
  const finalOverall = overall.replace(/^[📊\s]*التقييم العام ومستوى الإتقان\s*:?/i, "").trim();

  return {
    overallEvaluation: finalOverall || (strengthsText ? "" : rawText),
    strengths: strengths.length > 0 ? strengths : strengthsText ? [strengthsText] : [],
    weaknesses: weaknesses.length > 0 ? weaknesses : weaknessesText ? [weaknessesText] : [],
    studyPlan: studyPlan.length > 0 ? studyPlan : planText ? [planText] : [],
    rawText,
  };
}

// ---------- التخزين المحلي للمحاولات قيد التقدم ----------

const STORAGE_PREFIX = "ai_exam_assessment_progress_";

export interface AssessmentDraft {
  answers: Record<string, string>;
  current?: number;
  startedAt?: number;
}

export function getStoredAssessmentDraft(attemptId: string): AssessmentDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `${STORAGE_PREFIX}${attemptId}`;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // قد يفشل الوصول إلى localStorage في حال تعطيله أو تقييده
    }

    // هجرة تلقائية سلسة في حال وُجدت إجابات سابقة في sessionStorage
    if (!raw) {
      try {
        raw = sessionStorage.getItem(key);
        if (raw) {
          try {
            localStorage.setItem(key, raw);
            sessionStorage.removeItem(key);
          } catch {
            // فشلت الهجرة - نواصل استخدام القيمة من sessionStorage
          }
        }
      } catch {
        // تجاهل أخطاء قراءة sessionStorage
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if ("answers" in parsed && typeof parsed.answers === "object" && parsed.answers !== null) {
        return parsed as AssessmentDraft;
      }
      return { answers: parsed as Record<string, string> };
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredAssessmentDraft(attemptId: string, draft: AssessmentDraft): void {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_PREFIX}${attemptId}`;
  const serialized = JSON.stringify(draft);
  try {
    localStorage.setItem(key, serialized);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // تجاهل
    }
  } catch {
    try {
      sessionStorage.setItem(key, serialized);
    } catch {
      // تجاهل أخطاء التخزين المؤقت
    }
  }
}

export function getStoredAssessmentAnswers(attemptId: string): Record<string, string> {
  const draft = getStoredAssessmentDraft(attemptId);
  return draft?.answers ?? {};
}

export function setStoredAssessmentAnswers(attemptId: string, answers: Record<string, string>): void {
  const currentDraft = getStoredAssessmentDraft(attemptId) || { answers: {} };
  setStoredAssessmentDraft(attemptId, {
    ...currentDraft,
    answers,
  });
}

export function clearStoredAssessmentAnswers(attemptId: string): void {
  if (typeof window === "undefined") return;
  const key = `${STORAGE_PREFIX}${attemptId}`;
  try {
    localStorage.removeItem(key);
  } catch {
    // تجاهل
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // تجاهل
  }
}

