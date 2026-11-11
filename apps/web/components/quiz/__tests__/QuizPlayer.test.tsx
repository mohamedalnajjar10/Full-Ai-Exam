import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import QuizPlayer from "../QuizPlayer";
import type { GeneratedQuestion } from "@/lib/api";

const mockQuestions: GeneratedQuestion[] = [
  {
    id: "q-1",
    questionText: "ما هو ناتج تفاعل حمض الهيدروكلوريك مع هيدروكسيد الصوديوم؟",
    choices: [
      { label: "A", text: "ماء وكلوريد الصوديوم" },
      { label: "B", text: "غاز الهيدروجين" },
      { label: "C", text: "حمض الكبريتيك" },
      { label: "D", text: "أكسيد الصوديوم" },
    ],
    correctAnswer: "A",
    explanation: "تفاعل تعادل ينتج ملحاً وماء.",
    bloomTaxonomy: "REMEMBER",
    difficulty: "MEDIUM",
    sourceType: "BANK_RAG",
    subjectId: "sub-chem",
    topicId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "q-2",
    questionText: "أي العناصر التالية يعد من الغازات النبيلة؟",
    choices: [
      { label: "A", text: "الهيليوم" },
      { label: "B", text: "الأكسجين" },
      { label: "C", text: "النيتروجين" },
      { label: "D", text: "الكلور" },
    ],
    correctAnswer: "A",
    explanation: "الهيليوم غاز خامل نبيل.",
    bloomTaxonomy: "UNDERSTAND",
    difficulty: "EASY",
    sourceType: "BANK_RAG",
    subjectId: "sub-chem",
    topicId: null,
    createdAt: new Date().toISOString(),
  },
];

describe("QuizPlayer Component", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the question and choices", () => {
    render(
      <QuizPlayer
        questions={mockQuestions}
        subjectName="الكيمياء"
        difficulty="MEDIUM"
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText("الكيمياء")).toBeInTheDocument();
    expect(
      screen.getByText(/ما هو ناتج تفاعل حمض الهيدروكلوريك/i),
    ).toBeInTheDocument();
    expect(screen.getByText("ماء وكلوريد الصوديوم")).toBeInTheDocument();
  });

  it("allows selecting choices and navigating to next question", () => {
    const onFinish = vi.fn();
    render(
      <QuizPlayer
        questions={mockQuestions}
        subjectName="الكيمياء"
        difficulty="MEDIUM"
        onFinish={onFinish}
        onExit={vi.fn()}
      />,
    );

    // Select choice A for question 1
    const choiceA = screen.getByText("ماء وكلوريد الصوديوم");
    fireEvent.click(choiceA);

    // Click Next
    const nextBtn = screen.getByRole("button", { name: /التالي/i });
    fireEvent.click(nextBtn);

    // Check Question 2 is rendered
    expect(
      screen.getByText(/أي العناصر التالية يعد من الغازات النبيلة/i),
    ).toBeInTheDocument();

    // Select choice A for question 2
    fireEvent.click(screen.getByText("الهيليوم"));

    // Finish button should appear on last question
    const finishBtn = screen.getByRole("button", { name: /إنهاء وتصحيح/i });
    fireEvent.click(finishBtn);

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: { "q-1": "A", "q-2": "A" },
      }),
    );
  });
});
