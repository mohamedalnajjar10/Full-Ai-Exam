/** Output shape of a single generated question returned to the client */
export interface GeneratedQuestionOutput {
  id: string;
  questionText: string;
  choices: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  bloomTaxonomy: string | null;
  difficulty: string | null;
  sourceType: string;
  referenceMetadata: ReferenceMetadata | null;
  subjectId: string;
  topicId: string | null;
  createdAt: Date;
}

/** Provenance metadata attached to every generated question */
export interface ReferenceMetadata {
  styleUploadId?: string;
  bankQuestionIds: string[];
  /** مقاطع الكتاب المدرسي يلي انحطت بالـ prompt */
  textbookChunkIds?: string[];
}

/** Style blueprint extracted from a student-uploaded question sheet */
export interface StyleMatrix {
  averageQuestionLength: number;
  latexDensity: 'LOW' | 'MEDIUM' | 'HIGH';
  distractorComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX';
  cognitiveDepth: string;
  questionStructureNotes: string;
  sampleQuestions: string[];
}
