import { Injectable } from '@nestjs/common';
import { StyleMatrix } from '../interfaces/generated-question.interface';
import {
  CONTENT_FORMAT_RULES,
  JSON_LATEX_ESCAPING,
} from '../../common/content-format';
import { sanitizeTopicInput } from '../../common/prompt-security.util';

/** A bank question used as a few-shot reference anchor */
export interface BankQuestionAnchor {
  id: string;
  questionText: string;
  choices: { label: string; text: string }[];
  correctAnswer: string;
  explanation?: string | null;
  bloomTaxonomy: string;
  difficulty: string;
}

/** مقطع من الكتاب المدرسي الرسمي — مرجع للمحتوى */
export interface TextbookPassage {
  section: string | null;
  pageStart: number;
  pageEnd: number;
  text: string;
}

export interface SubjectWithBranch {
  id?: string;
  name: string;
  branch?: { name: string } | null;
  branchName?: string;
}

export type SubjectPromptInput = SubjectWithBranch | string;

function extractSubjectAndBranch(subject: SubjectPromptInput): {
  subjectName: string;
  branchName: string;
} {
  if (typeof subject === 'string') {
    return { subjectName: subject, branchName: 'General' };
  }
  const subjectName = subject.name;
  const branchName = subject.branch?.name ?? subject.branchName ?? 'General';
  return { subjectName, branchName };
}

/** مقاطع الكتاب كقسم بالـ prompt — فاضي إذا ما في مقاطع */
function formatPassages(
  passages: TextbookPassage[],
  subjectName: string,
): string {
  if (!passages.length) return '';
  return `\n\nOFFICIAL TEXTBOOK PASSAGES FOR "${subjectName}" (ministry textbook — the facts, definitions, values and notation in your questions MUST agree with these):
${passages
  .map(
    (p, i) =>
      `[Passage ${i + 1}]${p.section ? ` ${p.section}` : ''} (p. ${p.pageStart}${p.pageEnd !== p.pageStart ? `–${p.pageEnd}` : ''})\n${p.text}`,
  )
  .join('\n\n')}`;
}

@Injectable()
export class GenerationPromptBuilder {
  /**
   * Build a few-shot generation prompt using Palestinian exam bank questions as style & curriculum anchors.
   * Strictly grounded in the Palestinian National Curriculum (Tawjihi).
   * Used for US-14 (BANK_RAG source type).
   */
  buildBankRagPrompt(
    anchors: BankQuestionAnchor[],
    subject: SubjectPromptInput,
    topicId: string | undefined,
    difficulty: string,
    bloomTaxonomy: string | undefined,
    count: number,
    passages: TextbookPassage[] = [],
  ): string {
    const { subjectName, branchName } = extractSubjectAndBranch(subject);
    const topicText = sanitizeTopicInput(topicId);

    const passageSection = formatPassages(passages, subjectName);

    const anchorSection =
      anchors.length > 0
        ? `OFFICIAL PALESTINIAN EXAM BANK REFERENCE QUESTIONS FOR "${subjectName}" (use as style, difficulty, and curriculum anchors — do NOT reproduce verbatim):
${anchors
  .map((q, i) =>
    `
[Reference ${i + 1}] (Difficulty: ${q.difficulty}, Bloom: ${q.bloomTaxonomy})
Question: ${q.questionText}
${q.choices.map((c) => `  ${c.label}. ${c.text}`).join('\n')}
Correct Answer: ${q.correctAnswer}
${q.explanation ? `Explanation: ${q.explanation}` : ''}`.trim(),
  )
  .join('\n\n')}`
        : passages.length
          ? `No reference questions available from the bank for "${subjectName}". Base every question on the textbook passages below and follow official Palestinian board exam style.`
          : `No reference questions available from the bank for "${subjectName}". Generate strictly from official Palestinian "${subjectName}" curriculum knowledge.`;

    return `You are an expert Palestinian Tawjihi exam creator (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم) strictly for the subject: "${subjectName}" (Branch / الفرع: "${branchName}").

CRITICAL CURRICULUM GROUNDING INSTRUCTIONS:
- You MUST strictly generate questions adhering 100% to the official Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم / المنهاج الفلسطيني الرسمي المعتمد للتوجيهي - الثانوية العامة).
- The questions MUST belong EXCLUSIVELY to "${subjectName}" for the "${branchName}" branch.
- Do NOT generate questions for any other subject (e.g. Physics, Chemistry, Biology, Math, History) unless "${subjectName}" explicitly requires it.
- Replicate the exact official Palestinian Board Exam (امتحانات الثانوية العامة / الإنجاز / التوجيهي) terminology, scientific conventions, Arabic phrasing standards, and question taxonomy.
- Maintain rigorous mathematical/scientific LaTeX formatting using $...$ for inline and $$...$$ for block formulas.
- All Arabic scientific/mathematical phrasing MUST match Palestinian textbook conventions and ministry standards.
- If target topic is provided: "${topicText}", strictly constrain questions to this curriculum unit/topic.

TASK: Generate exactly ${count} original multiple-choice questions for the following curriculum parameters:
- Subject: ${subjectName} (Branch: ${branchName})
- Curriculum: Palestinian National Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم)
- Target Topic: ${topicText}
- Target Difficulty: ${difficulty}
- Target Bloom's Taxonomy Level: ${bloomTaxonomy ?? 'Any appropriate level'}

CRITICAL FORMATTING RULES:
1. All mathematical and chemical formulas MUST use LaTeX: $...$ for inline math, $$...$$ for display/block math.
2. Each question MUST have exactly 4 choices labeled A, B, C, D (أ، ب، ج، د equivalent).
3. Exactly one choice must be correct — label it in correctAnswer (A, B, C, or D).
4. Provide a concise, educationally rigorous explanation for the correct answer grounded in the Palestinian textbook.
5. Do NOT reproduce any reference question verbatim — use them as style, depth, and terminology anchors.

${CONTENT_FORMAT_RULES}
${JSON_LATEX_ESCAPING}

${anchorSection}${passageSection}

Generate ${count} NEW, ORIGINAL questions strictly aligned with the Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم) for "${subjectName}". Respond with valid JSON only.`;
  }

  /**
   * Build a dual-context prompt merging Style Blueprint (from upload) +
   * Curriculum Knowledge Anchors (from official Palestinian exam bank).
   * Used for US-16 (UPLOAD_STYLE_MATCH).
   */
  buildDualContextPrompt(
    styleMatrix: StyleMatrix,
    anchors: BankQuestionAnchor[],
    subject: SubjectPromptInput,
    topicId: string | undefined,
    count: number,
    passages: TextbookPassage[] = [],
  ): string {
    const { subjectName, branchName } = extractSubjectAndBranch(subject);
    const topicText = topicId
      ? sanitizeTopicInput(topicId)
      : 'General topics for this subject';

    const styleSection = `STYLE BLUEPRINT (extracted from student's uploaded question sheet):
- Average Question Length: ~${styleMatrix.averageQuestionLength} words
- LaTeX Math Density: ${styleMatrix.latexDensity}
- Distractor Complexity: ${styleMatrix.distractorComplexity}
- Dominant Cognitive Depth (Bloom's): ${styleMatrix.cognitiveDepth}
- Style Notes: ${styleMatrix.questionStructureNotes}
${
  styleMatrix.sampleQuestions.length > 0
    ? `\nSAMPLE QUESTIONS FROM UPLOAD (match this structure and phrasing style closely):
${styleMatrix.sampleQuestions.map((q, i) => `[Sample ${i + 1}] ${q}`).join('\n\n')}`
    : ''
}`;

    const anchorSection =
      anchors.length > 0
        ? `CURRICULUM KNOWLEDGE ANCHORS FOR "${subjectName}" (official Palestinian exam bank — content grounding, do NOT reproduce verbatim):
${anchors
  .map((q, i) =>
    `
[Reference ${i + 1}] (Difficulty: ${q.difficulty}, Bloom: ${q.bloomTaxonomy})
${q.questionText}
${q.choices.map((c) => `  ${c.label}. ${c.text}`).join('\n')}
Answer: ${q.correctAnswer}`.trim(),
  )
  .join('\n\n')}`
        : passages.length
          ? `No exam bank anchors available — ground every question's content in the textbook passages below.`
          : `No curriculum anchors available — generate strictly from official Palestinian "${subjectName}" curriculum knowledge.`;

    return `You are an expert Palestinian Tawjihi exam creator (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم) strictly for the subject: "${subjectName}" (Branch / الفرع: "${branchName}").

CRITICAL CURRICULUM GROUNDING INSTRUCTIONS:
- You MUST synthesize questions that match the student's uploaded exam style WHILE strictly adhering to the official Palestinian Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم / المنهاج الفلسطيني المعتمد للتوجيهي).
- All questions MUST belong EXCLUSIVELY to "${subjectName}" for the "${branchName}" branch.
- Do NOT drift into other subjects.
- Replicate official Palestinian Board Exam (امتحانات الثانوية العامة / الإنجاز / التوجيهي) formatting, scientific terminology, and question structure.
- Maintain rigorous mathematical/scientific LaTeX formatting using $...$ for inline math/formulas and $$...$$ for block formulas.
- All Arabic scientific and mathematical phrasing MUST match Palestinian textbook conventions and ministry standards.
- If target topic is provided: "${topicText}", strictly constrain questions to this unit/topic.

TASK: Synthesize exactly ${count} original multiple-choice questions that MATCH THE STUDENT'S STYLE while being STRICTLY GROUNDED IN THE PALESTINIAN CURRICULUM FOR "${subjectName}".
- Subject: ${subjectName} (Branch: ${branchName})
- Curriculum: Palestinian National Curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم)
- Target Topic: ${topicText}

${styleSection}

${anchorSection}${formatPassages(passages, subjectName)}

GENERATION REQUIREMENTS:
1. CURRICULUM GROUNDING: Questions MUST strictly belong to the official Palestinian "${subjectName}" curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم).
2. STYLE ALIGNMENT: Emulate the question phrasing, length, cognitive depth, and distractor profile from the Style Blueprint while keeping Palestinian board exam rigor.
3. CONTENT FIDELITY: Ensure all questions, terms, and values align with official Palestinian Tawjihi exam standards and reference anchors.
4. LATEX FORMATTING: ${styleMatrix.latexDensity === 'HIGH' ? 'Extensively use' : styleMatrix.latexDensity === 'MEDIUM' ? 'Moderately use' : 'Minimally use'} LaTeX — $...$ for inline, $$...$$ for display math.
5. DISTRACTORS: Generate ${styleMatrix.distractorComplexity.toLowerCase()} plausible distractors following Palestinian exam patterns.
6. Each question MUST have exactly 4 choices (A, B, C, D), one correct answer, and a clear textbook-aligned explanation.
7. Do NOT reproduce any reference or sample question verbatim.

${CONTENT_FORMAT_RULES}
${JSON_LATEX_ESCAPING}

Generate ${count} NEW, ORIGINAL questions strictly for the Palestinian "${subjectName}" curriculum (منهاج التوجيهي الفلسطيني - وزارة التربية والتعليم). Respond with valid JSON only.`;
  }
}
