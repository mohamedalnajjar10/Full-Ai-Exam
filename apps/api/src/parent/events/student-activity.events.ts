/**
 * Constants for student activity events emitted throughout the application.
 */
export const STUDENT_EVENTS = {
  ASSESSMENT_COMPLETED: 'assessment.completed',
  QUIZ_COMPLETED: 'quiz.completed',
  QUESTIONS_GENERATED: 'questions.generated',
  CHAT_FILE_UPLOADED: 'chat.file.uploaded',
  CHAT_SESSION_CLOSED: 'chat.session.closed',
} as const;

export type StudentEventType =
  | 'ASSESSMENT_COMPLETED'
  | 'QUIZ_COMPLETED'
  | 'QUESTIONS_GENERATED'
  | 'CHAT_FILE_UPLOADED'
  | 'CHAT_SESSION_CLOSED';

/**
 * Standardized activity payload format for all student events.
 */
export interface StudentActivityEventPayload {
  studentId: string;
  type: StudentEventType;
  title: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
}
