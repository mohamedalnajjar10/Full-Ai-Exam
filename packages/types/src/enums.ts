/**
 * Enum values mirrored from apps/api/prisma/schema.prisma.
 *
 * These are declared as const objects + union types rather than TS `enum`s so
 * they are safe to import into client bundles and compare against raw JSON.
 * Keep them in sync with the Prisma schema — the `AssertEnumParity` checks in
 * apps/api turn any drift into a compile error.
 */

export const Role = {
  STUDENT: 'STUDENT',
  ADMIN: 'ADMIN',
  PARENT: 'PARENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ParentLinkStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type ParentLinkStatus =
  (typeof ParentLinkStatus)[keyof typeof ParentLinkStatus];

export const DifficultyLevel = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;
export type DifficultyLevel = (typeof DifficultyLevel)[keyof typeof DifficultyLevel];

export const BloomTaxonomyLevel = {
  REMEMBER: 'REMEMBER',
  UNDERSTAND: 'UNDERSTAND',
  APPLY: 'APPLY',
  ANALYZE: 'ANALYZE',
  EVALUATE: 'EVALUATE',
  CREATE: 'CREATE',
} as const;
export type BloomTaxonomyLevel =
  (typeof BloomTaxonomyLevel)[keyof typeof BloomTaxonomyLevel];

export const GeneratedQuestionSourceType = {
  BANK_RAG: 'BANK_RAG',
  UPLOAD_STYLE_MATCH: 'UPLOAD_STYLE_MATCH',
} as const;
export type GeneratedQuestionSourceType =
  (typeof GeneratedQuestionSourceType)[keyof typeof GeneratedQuestionSourceType];

export const StyleSourceUploadStatus = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type StyleSourceUploadStatus =
  (typeof StyleSourceUploadStatus)[keyof typeof StyleSourceUploadStatus];

export const ChatMessageRole = {
  STUDENT: 'STUDENT',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;
export type ChatMessageRole = (typeof ChatMessageRole)[keyof typeof ChatMessageRole];

export const ChatMessageType = {
  TEXT: 'TEXT',
  FILE_UPLOAD: 'FILE_UPLOAD',
  QUESTIONS: 'QUESTIONS',
  ERROR: 'ERROR',
} as const;
export type ChatMessageType = (typeof ChatMessageType)[keyof typeof ChatMessageType];

export const AssessmentAttemptStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;
export type AssessmentAttemptStatus =
  (typeof AssessmentAttemptStatus)[keyof typeof AssessmentAttemptStatus];

