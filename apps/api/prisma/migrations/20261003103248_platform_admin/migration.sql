-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "flagNote" TEXT,
ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "flaggedById" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "units" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyQuota" INTEGER,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "staffRoleId" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "dailyQuota" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_model_createdAt_idx" ON "AiUsageLog"("model", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_task_createdAt_idx" ON "AiUsageLog"("task", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_flaggedAt_idx" ON "ChatSession"("flaggedAt");

-- CreateIndex
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_staffRoleId_idx" ON "User"("staffRoleId");

-- CreateIndex
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- أدوار الفريق الافتراضية. المدير العام دور نظام بكل الصلاحيات (بالكود،
-- مش بالقائمة)؛ الباقي قابل للتعديل من صفحة «الأدوار والصلاحيات».
INSERT INTO "StaffRole" ("id", "name", "description", "permissions", "system", "dailyQuota", "updatedAt") VALUES
  ('super_admin', 'مدير عام', 'تحكم كامل بكل شيء، بما فيها الصلاحيات والنماذج.', ARRAY[]::TEXT[], true, NULL, CURRENT_TIMESTAMP),
  ('content_admin', 'مدير محتوى', 'يرفع الكتب والامتحانات ويدير بنك الأسئلة والمنهاج.',
    ARRAY['content.upload','content.review','bank.edit','bank.delete','academics.manage','ai.prompts','ai.retrieval','users.view','billing.view'], false, 200, CURRENT_TIMESTAMP),
  ('reviewer', 'مراجع أسئلة', 'يعتمد أو يرفض الأسئلة المستخرجة ويصحّح البنك.',
    ARRAY['content.review','bank.edit'], false, 200, CURRENT_TIMESTAMP),
  ('support', 'دعم فني', 'يرى المستخدمين والمحادثات ويدير الحسابات دون تعديل المحتوى.',
    ARRAY['users.view','users.manage','chats.view','audit.view'], false, 200, CURRENT_TIMESTAMP);

-- كل أدمن موجود كان عنده صلاحيات كاملة — منحافظ عليها
UPDATE "User" SET "staffRoleId" = 'super_admin' WHERE "role" = 'ADMIN';
