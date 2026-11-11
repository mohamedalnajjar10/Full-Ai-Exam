import type { BloomTaxonomyLevel, DifficultyLevel, AssessmentAttemptStatus } from './enums';
import type { Choice } from './questions';
import type { Subject } from './entities';

export interface AssessmentQuestionPublic {
  id: string;
  assessmentId: string;
  questionText: string;
  options: Choice[];
  bloomTaxonomyLevel: BloomTaxonomyLevel;
  createdAt?: string;
}

export interface AssessmentQuestionDetail extends AssessmentQuestionPublic {
  correctAnswer: string;
  explanation: string | null;
}

export interface Assessment {
  id: string;
  title: string;
  subjectId: string;
  difficultyLevel: DifficultyLevel;
  subject?: Subject;
  questions?: (AssessmentQuestionPublic | AssessmentQuestionDetail)[];
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentAnswerDetail {
  id: string;
  attemptId: string;
  questionId: string;
  studentAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string | null;
  bloomTaxonomyLevel?: BloomTaxonomyLevel;
  question?: AssessmentQuestionDetail;
  createdAt: string;
}

export interface AssessmentAttempt {
  id: string;
  userId: string;
  assessmentId: string;
  score: number | null;
  status: AssessmentAttemptStatus;
  aiFeedback: string | null;
  startedAt: string;
  completedAt: string | null;
  assessment?: Assessment;
  answers?: AssessmentAnswerDetail[];
}

export interface GenerateAssessmentRequest {
  subjectId: string;
  difficultyLevel?: DifficultyLevel;
  title?: string;
}

export interface GenerateAssessmentResponse {
  assessment: {
    id: string;
    title: string;
    subjectId: string;
    difficultyLevel: DifficultyLevel;
    subject: {
      id: string;
      name: string;
    };
    questions: AssessmentQuestionPublic[];
    createdAt: string;
    updatedAt: string;
  };
  attemptId: string;
  attempt: {
    id: string;
    status: AssessmentAttemptStatus;
    startedAt: string;
  };
}

export interface AssessmentAttemptDetailResponse {
  id: string;
  userId: string;
  assessmentId: string;
  score: number | null;
  status: AssessmentAttemptStatus;
  aiFeedback: string | null;
  startedAt: string;
  completedAt: string | null;
  assessment: {
    id: string;
    title: string;
    subjectId: string;
    difficultyLevel: DifficultyLevel;
    subject: {
      id: string;
      name: string;
    };
    questions: (AssessmentQuestionPublic | AssessmentQuestionDetail)[];
    createdAt: string;
    updatedAt: string;
  };
  answers: {
    id: string;
    questionId: string;
    studentAnswer: string;
    isCorrect: boolean;
    correctAnswer?: string;
    explanation?: string | null;
    bloomTaxonomyLevel?: BloomTaxonomyLevel;
    createdAt?: string;
  }[];
}

export interface SubmitAssessmentAnswerItem {
  questionId: string;
  answer: string;
}

export interface SubmitAssessmentRequest {
  answers: SubmitAssessmentAnswerItem[];
}

export interface SubmitAssessmentResponse {
  attemptId: string;
  assessmentId: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  status: AssessmentAttemptStatus;
  aiFeedback: string;
  completedAt?: string;
  answers: {
    questionId: string;
    questionText?: string;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string | null;
    bloomTaxonomyLevel: BloomTaxonomyLevel;
  }[];
}

export interface AssessmentHistoryItem {
  id: string;
  assessmentId: string;
  title: string;
  subject: {
    id: string;
    name: string;
  };
  difficultyLevel: DifficultyLevel;
  score: number | null;
  status: AssessmentAttemptStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface AssessmentHistoryQuery {
  page?: number;
  limit?: number;
  subjectId?: string;
  status?: AssessmentAttemptStatus;
}

export interface AssessmentHistoryResponse {
  data: AssessmentHistoryItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
