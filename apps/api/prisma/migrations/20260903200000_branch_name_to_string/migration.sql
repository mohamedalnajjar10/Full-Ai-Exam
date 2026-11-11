-- Convert Branch.name from PostgreSQL enum "BranchName" to plain TEXT
-- so branch names can be stored directly in Arabic (e.g. علمي, أدبي, صناعي, شرعي).
ALTER TABLE "Branch" ALTER COLUMN "name" TYPE TEXT;

-- Drop the now-obsolete enum type
DROP TYPE IF EXISTS "BranchName";
