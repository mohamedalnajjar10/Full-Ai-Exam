-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamFile_status_createdAt_idx" ON "ExamFile"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamFile_subjectId_createdAt_idx" ON "ExamFile"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamFile_createdAt_idx" ON "ExamFile"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_deletedAt_subjectId_year_idx" ON "ExamBankQuestion"("deletedAt", "subjectId", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_embeddingStatus_deletedAt_idx" ON "ExamBankQuestion"("embeddingStatus", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_subjectId_kind_createdAt_idx" ON "KnowledgeDocument"("subjectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_branchId_stage_idx" ON "KnowledgeDocument"("branchId", "stage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_embeddingStatus_idx" ON "KnowledgeChunk"("documentId", "embeddingStatus");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GeneratedQuestion_studentId_subjectId_createdAt_idx" ON "GeneratedQuestion"("studentId", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatSession_studentId_isActive_updatedAt_idx" ON "ChatSession"("studentId", "isActive", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_subjectId_createdAt_idx" ON "Assessment"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_userId_startedAt_idx" ON "AssessmentAttempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_assessmentId_status_idx" ON "AssessmentAttempt"("assessmentId", "status");
