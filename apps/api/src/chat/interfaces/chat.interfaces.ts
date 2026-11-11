import type { Subject, Branch } from '@prisma/client';
/** Intent types recognized by the NLP intent classifier */
export enum ChatIntent {
  /** Student wants to generate questions (with optional NL parameters) */
  GENERATE_QUESTIONS = 'GENERATE_QUESTIONS',
  /** Student uploaded a file and wants questions matching its style/level */
  UPLOAD_ANALYSIS = 'UPLOAD_ANALYSIS',
  /** Message is off-topic / unrelated to the subject */
  OFF_TOPIC = 'OFF_TOPIC',
  /** Greeting or help request */
  GREETING = 'GREETING',
  /** Follow-up to a previous generation (e.g. "give me harder ones") */
  FOLLOW_UP = 'FOLLOW_UP',
  /** سؤال عن محتوى المادة (شرح، تعريف، حل مثال) — الجواب من الكتاب */
  ASK_CONTENT = 'ASK_CONTENT',
}

/** Structured intent classification result from Gemini */
export interface IntentClassification {
  intent: ChatIntent;
  /** Extracted topic/chapter from natural language (e.g. "Calculus", "Newton Laws") */
  topic?: string;
  /** Extracted difficulty from natural language (e.g. "EASY", "MEDIUM", "HARD") */
  difficulty?: string;
  /** Extracted Bloom's Taxonomy level */
  bloomTaxonomy?: string;
  /** Extracted year reference (e.g. 2020) */
  year?: number;
  /** Number of questions requested (default 5) */
  count?: number;
  /** Confidence score 0–1 */
  confidence: number;
  /** Reason for off-topic classification (shown to user) */
  offTopicReason?: string;
  /** Follow-up modifier (e.g. "harder", "easier", "more") */
  followUpModifier?: string;
}

/** Shape of a chat AI response before persistence */
export interface ChatAIResponse {
  role: 'ASSISTANT';
  type: 'TEXT' | 'QUESTIONS' | 'ERROR';
  content: string;
  metadata?: Record<string, unknown>;
}

/** Context window assembled from conversation history */
export interface ConversationContext {
  messages: {
    role: 'user' | 'model';
    parts: { text: string }[];
  }[];
  /** معرّف الجلسة ومادتها — منرجّعهم حتى ما يضطر المستدعي يجيب الجلسة من جديد */
  subjectId: string;
  /** كائن المادة كامل (مع الفرع) لبناء الـ prompt */
  subject: Subject & { branch: Branch | null };
  /** Subject name for prompt injection */
  subjectName: string;
  /** Branch name for prompt injection */
  branchName: string;
  /** Last intent classification (for follow-up support) */
  lastIntent?: IntentClassification;
  /** Last generation parameters (for follow-ups like "give me harder ones") */
  lastGenerationParams?: {
    topic?: string;
    difficulty?: string;
    bloomTaxonomy?: string;
    count?: number;
    /** نص البحث بالكتاب، حتى «المزيد» يضل على نفس المحتوى */
    query?: string;
  };
}

/** مقطع من الكتاب استُعمل بالجواب — نفس العقد يلي بتعرضه الواجهة */
export type { ChatSource } from '@ai-exam/types';

/** Content validation result for uploaded files */
export interface ContentValidationResult {
  isRelevant: boolean;
  detectedSubject?: string;
  confidence: number;
  reason: string;
}
