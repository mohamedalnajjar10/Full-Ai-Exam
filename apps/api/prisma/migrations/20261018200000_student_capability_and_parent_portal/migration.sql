-- AlterEnum: Add PARENT to Role enum if not exists
DO $$
BEGIN
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARENT';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ParentLinkStatus') THEN
        CREATE TYPE "ParentLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssessmentAttemptStatus') THEN
        CREATE TYPE "AssessmentAttemptStatus" AS ENUM ('PENDING', 'COMPLETED');
    END IF;
END $$;

-- CreateTable Assessment
CREATE TABLE IF NOT EXISTS "Assessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "difficultyLevel" "DifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable AssessmentQuestion
CREATE TABLE IF NOT EXISTS "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "bloomTaxonomyLevel" "BloomTaxonomyLevel" NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable AssessmentAttempt
CREATE TABLE IF NOT EXISTS "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "status" "AssessmentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "aiFeedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable AssessmentAnswer
CREATE TABLE IF NOT EXISTS "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable ParentStudentLink
CREATE TABLE IF NOT EXISTS "ParentStudentLink" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "parentPhone" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "magicTokenHash" TEXT,
    "magicTokenExpiresAt" TIMESTAMP(3),
    "status" "ParentLinkStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable PushSubscription
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable StudentActivityEvent
CREATE TABLE IF NOT EXISTS "StudentActivityEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentActivityEvent_pkey" PRIMARY KEY ("id")
);

-- Deduplication: Remove any duplicate AssessmentAnswer rows before applying unique constraint
DELETE FROM "AssessmentAnswer" a
USING "AssessmentAnswer" b
WHERE a.id < b.id
  AND a."attemptId" = b."attemptId"
  AND a."questionId" = b."questionId";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_subjectId_idx" ON "Assessment"("subjectId");
CREATE INDEX IF NOT EXISTS "Assessment_createdAt_idx" ON "Assessment"("createdAt");

CREATE INDEX IF NOT EXISTS "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

CREATE INDEX IF NOT EXISTS "AssessmentAttempt_userId_idx" ON "AssessmentAttempt"("userId");
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");
CREATE INDEX IF NOT EXISTS "AssessmentAttempt_userId_status_idx" ON "AssessmentAttempt"("userId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_questionId_key" ON "AssessmentAnswer"("attemptId", "questionId");
CREATE INDEX IF NOT EXISTS "AssessmentAnswer_attemptId_idx" ON "AssessmentAnswer"("attemptId");
CREATE INDEX IF NOT EXISTS "AssessmentAnswer_questionId_idx" ON "AssessmentAnswer"("questionId");

CREATE UNIQUE INDEX IF NOT EXISTS "ParentStudentLink_studentId_parentId_key" ON "ParentStudentLink"("studentId", "parentId");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_studentId_idx" ON "ParentStudentLink"("studentId");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_parentId_idx" ON "ParentStudentLink"("parentId");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_parentPhone_idx" ON "ParentStudentLink"("parentPhone");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_magicTokenHash_idx" ON "ParentStudentLink"("magicTokenHash");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_status_idx" ON "ParentStudentLink"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

CREATE INDEX IF NOT EXISTS "StudentActivityEvent_studentId_idx" ON "StudentActivityEvent"("studentId");
CREATE INDEX IF NOT EXISTS "StudentActivityEvent_studentId_createdAt_idx" ON "StudentActivityEvent"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentActivityEvent_eventType_idx" ON "StudentActivityEvent"("eventType");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Assessment_subjectId_fkey') THEN
        ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentQuestion_assessmentId_fkey') THEN
        ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentAttempt_userId_fkey') THEN
        ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentAttempt_assessmentId_fkey') THEN
        ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentAnswer_attemptId_fkey') THEN
        ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentAnswer_questionId_fkey') THEN
        ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParentStudentLink_studentId_fkey') THEN
        ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ParentStudentLink_parentId_fkey') THEN
        ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
        ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentActivityEvent_studentId_fkey') THEN
        ALTER TABLE "StudentActivityEvent" ADD CONSTRAINT "StudentActivityEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
