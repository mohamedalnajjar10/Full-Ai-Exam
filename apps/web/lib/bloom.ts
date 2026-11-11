/**
 * تعريفات وثوابت مستويات بلوم ومستويات الصعوبة المستخدمة في لوحة التحكم وبنك الأسئلة.
 */

export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export type Bloom = "REMEMBER" | "UNDERSTAND" | "APPLY" | "ANALYZE" | "EVALUATE" | "CREATE";
export type EmbeddingStatus = "PENDING" | "INDEXED" | "FAILED";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  HARD: "صعب",
};

export const BLOOM_LABEL: Record<Bloom, string> = {
  REMEMBER: "تذكّر",
  UNDERSTAND: "فهم",
  APPLY: "تطبيق",
  ANALYZE: "تحليل",
  EVALUATE: "تقويم",
  CREATE: "إبداع",
};
