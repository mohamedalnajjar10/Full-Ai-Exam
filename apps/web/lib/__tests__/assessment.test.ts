import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredAssessmentDraft,
  setStoredAssessmentDraft,
  getStoredAssessmentAnswers,
  setStoredAssessmentAnswers,
  clearStoredAssessmentAnswers,
  parseAiFeedback,
  BLOOM_LABELS,
} from "../assessment";

describe("Assessment Utilities & State Persistence", () => {
  const attemptId = "att_test_456";

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("Draft Persistence", () => {
    it("returns null when no draft exists", () => {
      expect(getStoredAssessmentDraft(attemptId)).toBeNull();
      expect(getStoredAssessmentAnswers(attemptId)).toEqual({});
    });

    it("saves and retrieves full assessment draft with current question index", () => {
      const draft = {
        answers: { "q-1": "A", "q-2": "D" },
        current: 2,
        startedAt: 1700000000000,
      };

      setStoredAssessmentDraft(attemptId, draft);
      const retrieved = getStoredAssessmentDraft(attemptId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.answers).toEqual({ "q-1": "A", "q-2": "D" });
      expect(retrieved?.current).toBe(2);
      expect(retrieved?.startedAt).toBe(1700000000000);
      expect(getStoredAssessmentAnswers(attemptId)).toEqual({
        "q-1": "A",
        "q-2": "D",
      });
    });

    it("supports setting answers incrementally while preserving state", () => {
      setStoredAssessmentAnswers(attemptId, { "q-1": "B" });
      expect(getStoredAssessmentAnswers(attemptId)).toEqual({ "q-1": "B" });

      setStoredAssessmentAnswers(attemptId, { "q-1": "B", "q-2": "C" });
      expect(getStoredAssessmentAnswers(attemptId)).toEqual({
        "q-1": "B",
        "q-2": "C",
      });
    });

    it("clears assessment draft on submit or exit", () => {
      setStoredAssessmentDraft(attemptId, { answers: { "q-1": "A" } });
      expect(getStoredAssessmentDraft(attemptId)).not.toBeNull();

      clearStoredAssessmentAnswers(attemptId);
      expect(getStoredAssessmentDraft(attemptId)).toBeNull();
      expect(getStoredAssessmentAnswers(attemptId)).toEqual({});
    });
  });

  describe("AI Feedback Parsing", () => {
    it("handles null or empty feedback gracefully", () => {
      const parsed = parseAiFeedback(null);
      expect(parsed.overallEvaluation).toContain("لم يتوفر تحليل تشخيصي تفصيلي");
      expect(parsed.strengths).toEqual([]);
      expect(parsed.weaknesses).toEqual([]);
      expect(parsed.studyPlan).toEqual([]);
    });

    it("parses structured four-section markdown feedback", () => {
      const markdown = `
### 1. التقييم العام
أداء الطالب ممتاز في المفاهيم الأساسية.
### 2. نقاط القوة
- الفهم الدقيق لتعريفات التكامل
- السرعة في الحل الحسابي
### 3. نقاط الضعف
- التعثر في التطبيقات الهندسية
### 4. الخطة العلاجية
- مراجعة درس المساحات وحجوم الأجسام الدورانية
`;
      const parsed = parseAiFeedback(markdown);
      expect(parsed.overallEvaluation).toContain("أداء الطالب ممتاز");
      expect(parsed.strengths).toContain("الفهم الدقيق لتعريفات التكامل");
      expect(parsed.weaknesses).toContain("التعثر في التطبيقات الهندسية");
      expect(parsed.studyPlan).toContain(
        "مراجعة درس المساحات وحجوم الأجسام الدورانية",
      );
    });
  });

  describe("Bloom Taxonomy Definitions", () => {
    it("defines Arabic names and descriptions for all 6 Bloom levels", () => {
      const levels = [
        "REMEMBER",
        "UNDERSTAND",
        "APPLY",
        "ANALYZE",
        "EVALUATE",
        "CREATE",
      ] as const;

      for (const level of levels) {
        expect(BLOOM_LABELS[level]).toBeDefined();
        expect(BLOOM_LABELS[level].name.length).toBeGreaterThan(0);
        expect(BLOOM_LABELS[level].enName.length).toBeGreaterThan(0);
        expect(BLOOM_LABELS[level].desc.length).toBeGreaterThan(0);
      }
    });
  });
});
