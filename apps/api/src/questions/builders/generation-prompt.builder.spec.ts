import {
  GenerationPromptBuilder,
  BankQuestionAnchor,
} from './generation-prompt.builder';
import { StyleMatrix } from '../interfaces/generated-question.interface';

describe('GenerationPromptBuilder', () => {
  let builder: GenerationPromptBuilder;

  beforeEach(() => {
    builder = new GenerationPromptBuilder();
  });

  const mockSubject = {
    id: 'sub-1',
    name: 'Mathematics',
    branch: { name: 'Scientific' },
  };

  const mockAnchors: BankQuestionAnchor[] = [
    {
      id: 'a1',
      questionText: 'Solve for x: $2x + 4 = 10$',
      choices: [
        { label: 'A', text: '$x = 2$' },
        { label: 'B', text: '$x = 3$' },
        { label: 'C', text: '$x = 4$' },
        { label: 'D', text: '$x = 5$' },
      ],
      correctAnswer: 'B',
      explanation: '$2x = 6 \\implies x = 3$',
      bloomTaxonomy: 'APPLY',
      difficulty: 'MEDIUM',
    },
  ];

  const mockStyleMatrix: StyleMatrix = {
    averageQuestionLength: 20,
    latexDensity: 'HIGH',
    distractorComplexity: 'MODERATE',
    cognitiveDepth: 'APPLY',
    questionStructureNotes: 'Direct calculation questions with LaTeX',
    sampleQuestions: ['What is the derivative of $x^2$?'],
  };

  describe('buildBankRagPrompt', () => {
    it('should inject strict Palestinian Curriculum (Tawjihi) and Subject/Branch instructions at the top', () => {
      const prompt = builder.buildBankRagPrompt(
        mockAnchors,
        mockSubject,
        'Algebra',
        'MEDIUM',
        'APPLY',
        2,
      );

      expect(prompt).toContain(
        'منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم',
      );
      expect(prompt).toContain(
        'You are an expert Palestinian Tawjihi exam creator (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم) strictly for the subject: "Mathematics" (Branch / الفرع: "Scientific").',
      );
      expect(prompt).toContain('CRITICAL CURRICULUM GROUNDING INSTRUCTIONS:');
      expect(prompt).toContain(
        'You MUST strictly generate questions adhering 100% to the official Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم / المنهاج الفلسطيني الرسمي المعتمد للتوجيهي - الثانوية العامة).',
      );
      expect(prompt).toContain(
        'The questions MUST belong EXCLUSIVELY to "Mathematics" for the "Scientific" branch.',
      );
      expect(prompt).toContain(
        'Do NOT generate questions for any other subject (e.g. Physics, Chemistry, Biology, Math, History) unless "Mathematics" explicitly requires it.',
      );
      expect(prompt).toContain(
        'Replicate the exact official Palestinian Board Exam (امتحانات الثانوية العامة / الإنجاز / التوجيهي) terminology',
      );
      expect(prompt).toContain(
        'If target topic is provided: "Algebra", strictly constrain questions to this curriculum unit/topic.',
      );
      expect(prompt).toContain(
        'Maintain rigorous mathematical/scientific LaTeX formatting using $...$ for inline and $$...$$ for block formulas',
      );
      expect(prompt).toContain(
        'All Arabic scientific/mathematical phrasing MUST match Palestinian textbook conventions and ministry standards.',
      );
      expect(prompt).toContain(
        'OFFICIAL PALESTINIAN EXAM BANK REFERENCE QUESTIONS FOR "Mathematics"',
      );
    });

    it('should include fallback text strictly bound to Palestinian Curriculum when no anchors provided', () => {
      const prompt = builder.buildBankRagPrompt(
        [],
        mockSubject,
        undefined,
        'HARD',
        'EVALUATE',
        3,
      );

      expect(prompt).toContain(
        'No reference questions available from the bank for "Mathematics". Generate strictly from official Palestinian "Mathematics" curriculum knowledge.',
      );
      expect(prompt).toContain(
        'strictly aligned with the Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم) for "Mathematics"',
      );
    });
  });

  describe('buildDualContextPrompt', () => {
    it('should inject strict Palestinian Curriculum instructions for style-matched generation', () => {
      const prompt = builder.buildDualContextPrompt(
        mockStyleMatrix,
        mockAnchors,
        mockSubject,
        'Calculus',
        2,
      );

      expect(prompt).toContain(
        'منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم',
      );
      expect(prompt).toContain(
        "You MUST synthesize questions that match the student's uploaded exam style WHILE strictly adhering to the official Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم / المنهاج الفلسطيني المعتمد للتوجيهي).",
      );
      expect(prompt).toContain(
        'All questions MUST belong EXCLUSIVELY to "Mathematics" for the "Scientific" branch.',
      );
      expect(prompt).toContain(
        'Replicate official Palestinian Board Exam (امتحانات الثانوية العامة / الإنجاز / التوجيهي) formatting, scientific terminology, and question structure.',
      );
      expect(prompt).toContain(
        'Maintain rigorous mathematical/scientific LaTeX formatting using $...$ for inline math/formulas and $$...$$ for block formulas.',
      );
      expect(prompt).toContain(
        'All Arabic scientific and mathematical phrasing MUST match Palestinian textbook conventions and ministry standards.',
      );
      expect(prompt).toContain(
        'CURRICULUM KNOWLEDGE ANCHORS FOR "Mathematics"',
      );
      expect(prompt).toContain(
        'strictly for the Palestinian "Mathematics" curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم)',
      );
    });
  });
});
