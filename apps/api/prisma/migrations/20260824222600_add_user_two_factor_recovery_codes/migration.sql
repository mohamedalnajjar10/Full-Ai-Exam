-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Drop legacy googleId column and index if they exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='googleId') THEN
    DROP INDEX IF EXISTS "User_googleId_key";
    ALTER TABLE "User" DROP COLUMN "googleId";
  END IF;
END $$;
