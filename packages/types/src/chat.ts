import type { ChatMessageRole, ChatMessageType } from './enums';
import type { GeneratedQuestion } from './questions';
import type { BranchSummary } from './entities';

/** مقطع من الكتاب المدرسي استُند إليه في الرد */
export interface ChatSource {
  documentId: string;
  /** اسم ملف الكتاب بدون الامتداد */
  title: string;
  section: string | null;
  pageStart: number;
  pageEnd: number;
}

export interface ChatMessageMetadata {
  questions?: GeneratedQuestion[];
  sources?: ChatSource[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id?: string;
  role: ChatMessageRole;
  type: ChatMessageType;
  content: string;
  fileUrl?: string | null;
  fileMimeType?: string | null;
  metadata?: ChatMessageMetadata | null;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  studentId: string;
  subjectId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subject: {
    id: string;
    name: string;
    branch?: BranchSummary | null;
  };
  messages?: ChatMessage[];
}

export interface SendMessageRequest {
  message: string;
  locale?: string;
}

export interface CreateSessionRequest {
  subjectId: string;
}
