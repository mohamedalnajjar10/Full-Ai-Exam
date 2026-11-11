-- Sprint 2 + Sprint 3: Exam Bank + AI Question Generation (RAG)
-- This migration creates Sprint 2 enums/tables (if not already created)
-- and then adds Sprint 3 tables for the AI question generation pipeline.

-- ══════════════════════════════════════════════════════════════
-- SPRINT 2: Exam Bank Enums (safe: use DO blocks to skip if exist)
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "ExamFileStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StagedQuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BloomTaxonomyLevel" AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateIndex for User (only if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_branchId_idx') THEN
    CREATE INDEX "User_branchId_idx" ON "User"("branchId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_oauthProvider_oauthProviderId_key') THEN
    CREATE UNIQUE INDEX "User_oauthProvider_oauthProviderId_key" ON "User"("oauthProvider","oauthProviderId");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'RefreshToken_userId_revokedAt_idx') THEN
    CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId","revokedAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'RefreshToken_expiresAt_idx') THEN
    CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
  END IF;
END $$;

-- Sprint 2: Branch table
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_name_key" ON "Branch"("name");

-- Add branchId to User if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='branchId') THEN
    ALTER TABLE "User" ADD COLUMN "branchId" TEXT;
    ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Sprint 2: Subject table
CREATE TABLE IF NOT EXISTS "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Subject_name_branchId_key') THEN
    CREATE UNIQUE INDEX "Subject_name_branchId_key" ON "Subject"("name","branchId");
  END IF;
END $$;
DO $$ BEGIN
  ALTER TABLE "Subject" ADD CONSTRAINT "Subject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sprint 2: ExamFile table
CREATE TABLE IF NOT EXISTS "ExamFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSize" INTEGER NOT NULL,
    "status" "ExamFileStatus" NOT NULL DEFAULT 'PENDING',
    "errorLog" TEXT,
    "branchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamFile_s3Key_key" ON "ExamFile"("s3Key");
CREATE INDEX IF NOT EXISTS "ExamFile_branchId_idx" ON "ExamFile"("branchId");
CREATE INDEX IF NOT EXISTS "ExamFile_subjectId_idx" ON "ExamFile"("subjectId");
CREATE INDEX IF NOT EXISTS "ExamFile_status_idx" ON "ExamFile"("status");
DO $$ BEGIN
  ALTER TABLE "ExamFile" ADD CONSTRAINT "ExamFile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ExamFile" ADD CONSTRAINT "ExamFile_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ExamFile" ADD CONSTRAINT "ExamFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sprint 2: StagedQuestion table
CREATE TABLE IF NOT EXISTS "StagedQuestion" (
    "id" TEXT NOT NULL,
    "examFileId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "status" "StagedQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StagedQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StagedQuestion_examFileId_idx" ON "StagedQuestion"("examFileId");
CREATE INDEX IF NOT EXISTS "StagedQuestion_status_idx" ON "StagedQuestion"("status");
DO $$ BEGIN
  ALTER TABLE "StagedQuestion" ADD CONSTRAINT "StagedQuestion_examFileId_fkey" FOREIGN KEY ("examFileId") REFERENCES "ExamFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sprint 2: ExamBankQuestion table (with pgvector-compatible float[] embedding)
CREATE TABLE IF NOT EXISTS "ExamBankQuestion" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "branchId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "difficulty" "DifficultyLevel" NOT NULL,
    "bloomTaxonomy" "BloomTaxonomyLevel" NOT NULL,
    "topicId" TEXT,
    "sourceFileId" TEXT,
    "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamBankQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_branchId_idx" ON "ExamBankQuestion"("branchId");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_subjectId_idx" ON "ExamBankQuestion"("subjectId");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_difficulty_idx" ON "ExamBankQuestion"("difficulty");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_bloomTaxonomy_idx" ON "ExamBankQuestion"("bloomTaxonomy");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_year_idx" ON "ExamBankQuestion"("year");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_deletedAt_idx" ON "ExamBankQuestion"("deletedAt");
CREATE INDEX IF NOT EXISTS "ExamBankQuestion_embeddingStatus_idx" ON "ExamBankQuestion"("embeddingStatus");
DO $$ BEGIN
  ALTER TABLE "ExamBankQuestion" ADD CONSTRAINT "ExamBankQuestion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ExamBankQuestion" ADD CONSTRAINT "ExamBankQuestion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════
-- SPRINT 3: AI Question Generation Enums & Tables
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "StyleSourceUploadStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GeneratedQuestionSourceType" AS ENUM ('BANK_RAG', 'UPLOAD_STYLE_MATCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- StyleSourceUpload table
CREATE TABLE IF NOT EXISTS "StyleSourceUpload" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "StyleSourceUploadStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorLog" TEXT,
    "styleMatrix" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StyleSourceUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StyleSourceUpload_s3Key_key" ON "StyleSourceUpload"("s3Key");
CREATE INDEX IF NOT EXISTS "StyleSourceUpload_studentId_idx" ON "StyleSourceUpload"("studentId");
CREATE INDEX IF NOT EXISTS "StyleSourceUpload_status_idx" ON "StyleSourceUpload"("status");
DO $$ BEGIN
  ALTER TABLE "StyleSourceUpload" ADD CONSTRAINT "StyleSourceUpload_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GeneratedQuestion table
CREATE TABLE IF NOT EXISTS "GeneratedQuestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "topicId" TEXT,
    "questionText" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "bloomTaxonomy" "BloomTaxonomyLevel",
    "difficulty" "DifficultyLevel",
    "sourceType" "GeneratedQuestionSourceType" NOT NULL DEFAULT 'BANK_RAG',
    "referenceMetadata" JSONB,
    "styleUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GeneratedQuestion_studentId_idx" ON "GeneratedQuestion"("studentId");
CREATE INDEX IF NOT EXISTS "GeneratedQuestion_subjectId_idx" ON "GeneratedQuestion"("subjectId");
CREATE INDEX IF NOT EXISTS "GeneratedQuestion_sourceType_idx" ON "GeneratedQuestion"("sourceType");
DO $$ BEGIN
  ALTER TABLE "GeneratedQuestion" ADD CONSTRAINT "GeneratedQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "GeneratedQuestion" ADD CONSTRAINT "GeneratedQuestion_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "GeneratedQuestion" ADD CONSTRAINT "GeneratedQuestion_styleUploadId_fkey" FOREIGN KEY ("styleUploadId") REFERENCES "StyleSourceUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
