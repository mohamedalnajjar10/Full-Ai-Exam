-- CreateIndex
CREATE INDEX "ChatSession_studentId_updatedAt_idx" ON "ChatSession"("studentId", "updatedAt");

-- CreateIndex
CREATE INDEX "ExamBankQuestion_sourceFileId_idx" ON "ExamBankQuestion"("sourceFileId");

-- CreateIndex
CREATE INDEX "ExamBankQuestion_deletedAt_subjectId_difficulty_idx" ON "ExamBankQuestion"("deletedAt", "subjectId", "difficulty");

-- CreateIndex
CREATE INDEX "ExamFile_uploadedBy_idx" ON "ExamFile"("uploadedBy");

-- CreateIndex
CREATE INDEX "GeneratedQuestion_styleUploadId_idx" ON "GeneratedQuestion"("styleUploadId");

-- CreateIndex
CREATE INDEX "StagedQuestion_status_createdAt_idx" ON "StagedQuestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Subject_branchId_idx" ON "Subject"("branchId");

-- CreateIndex
CREATE INDEX "Teacher_isActive_displayOrder_idx" ON "Teacher"("isActive", "displayOrder");
