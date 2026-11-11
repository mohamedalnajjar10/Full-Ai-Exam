-- CreateEnum
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('BOOK', 'EXAM');

-- CreateEnum
CREATE TYPE "IngestionStage" AS ENUM ('UPLOADED', 'EXTRACTING', 'CHUNKING', 'CHUNKED', 'EMBEDDING', 'INDEXED', 'FAILED');

-- AlterTable
ALTER TABLE "ExamBankQuestion" ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StagedQuestion" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "suggestedBloom" "BloomTaxonomyLevel",
ADD COLUMN     "suggestedDifficulty" "DifficultyLevel",
ADD COLUMN     "suggestedUnit" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "kind" "KnowledgeSourceKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "subjectId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "examFileId" TEXT,
    "bookPart" TEXT,
    "bookEdition" INTEGER,
    "options" JSONB NOT NULL,
    "stage" "IngestionStage" NOT NULL DEFAULT 'UPLOADED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "failedStage" "IngestionStage",
    "error" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',
    "stageTimings" JSONB NOT NULL DEFAULT '{}',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "pageStart" INTEGER NOT NULL,
    "pageEnd" INTEGER NOT NULL,
    "section" TEXT,
    "unit" TEXT,
    "text" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_s3Key_key" ON "KnowledgeDocument"("s3Key");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_examFileId_key" ON "KnowledgeDocument"("examFileId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_kind_createdAt_idx" ON "KnowledgeDocument"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_subjectId_idx" ON "KnowledgeDocument"("subjectId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_stage_idx" ON "KnowledgeDocument"("stage");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_subjectId_embeddingStatus_idx" ON "KnowledgeChunk"("subjectId", "embeddingStatus");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_subjectId_unit_idx" ON "KnowledgeChunk"("subjectId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeChunk_documentId_ordinal_key" ON "KnowledgeChunk"("documentId", "ordinal");

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_examFileId_fkey" FOREIGN KEY ("examFileId") REFERENCES "ExamFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- استخدام أسئلة البنك بالتوليد: من referenceMetadata.bankQuestionIds للأسئلة المولّدة سابقاً
UPDATE "ExamBankQuestion" q
SET "usageCount" = u.n
FROM (
  SELECT ref.id, COUNT(*)::int AS n
  FROM "GeneratedQuestion" g,
       LATERAL jsonb_array_elements_text(COALESCE(g."referenceMetadata"->'bankQuestionIds', '[]'::jsonb)) AS ref(id)
  GROUP BY ref.id
) u
WHERE q.id = u.id;

-- البحث النصي بالاسترجاع الهجين (إعداد simple — ما في قاموس عربي بـ Postgres)
CREATE INDEX "KnowledgeChunk_text_fts_idx" ON "KnowledgeChunk"
  USING GIN (to_tsvector('simple', coalesce("section", '') || ' ' || "text"));
