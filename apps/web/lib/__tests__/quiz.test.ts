import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredQuizDraft,
  setStoredQuizDraft,
  clearStoredQuizDraft,
  queuePendingQuizSubmission,
  scorePercent,
  formatDuration,
  scoreTone,
} from "../quiz";

describe("Quiz Utilities & Draft Persistence", () => {
  const quizKey = "test_quiz_123";

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("Draft Persistence", () => {
    it("returns null when no draft exists", () => {
      expect(getStoredQuizDraft(quizKey)).toBeNull();
    });

    it("saves and retrieves draft correctly", () => {
      const draft = {
        answers: { q1: "A", q2: "B" },
        current: 1,
        startedAt: 1700000000000,
      };

      setStoredQuizDraft(quizKey, draft);
      const retrieved = getStoredQuizDraft(quizKey);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.answers).toEqual({ q1: "A", q2: "B" });
      expect(retrieved?.current).toBe(1);
      expect(retrieved?.startedAt).toBe(1700000000000);
    });

    it("clears draft from both local and session storage", () => {
      setStoredQuizDraft(quizKey, {
        answers: { q1: "C" },
        current: 0,
        startedAt: Date.now(),
      });

      expect(getStoredQuizDraft(quizKey)).not.toBeNull();
      clearStoredQuizDraft(quizKey);
      expect(getStoredQuizDraft(quizKey)).toBeNull();
    });
  });

  describe("Pending Cloud Queue", () => {
    it("enqueues pending quiz submissions for offline retry", () => {
      const payload = { subjectId: "sub-1", correct: 5, total: 10 };
      queuePendingQuizSubmission(payload);

      const raw = localStorage.getItem("quiz_pending_cloud_sync");
      expect(raw).not.toBeNull();
      const list = JSON.parse(raw!);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ subjectId: "sub-1", correct: 5 });
    });
  });

  describe("Score and Duration Formatting", () => {
    it("calculates score percentage correctly", () => {
      expect(scorePercent({ correct: 8, total: 10 })).toBe(80);
      expect(scorePercent({ correct: 0, total: 10 })).toBe(0);
      expect(scorePercent({ correct: 10, total: 10 })).toBe(100);
      expect(scorePercent({ correct: 5, total: 0 })).toBe(0);
    });

    it("formats duration in MM:SS correctly", () => {
      expect(formatDuration(0)).toBe("0:00");
      expect(formatDuration(65)).toBe("1:05");
      expect(formatDuration(600)).toBe("10:00");
    });

    it("determines score tone based on thresholds", () => {
      expect(scoreTone(90).label).toBe("ممتاز");
      expect(scoreTone(75).label).toBe("جيد جداً");
      expect(scoreTone(40).label).toBe("يحتاج مراجعة");
    });
  });
});
