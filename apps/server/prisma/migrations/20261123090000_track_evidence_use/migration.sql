-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN "lastUsedAt" DATETIME;
ALTER TABLE "GenerationRun" ADD COLUMN "evidenceIds" TEXT;

-- Backfill: until now every image run sent all of the project's images, so an
-- image counts as used if an image run (not a document section, not an AI chat
-- change) succeeded after it was uploaded.
UPDATE "Evidence"
SET "lastUsedAt" = (
  SELECT MAX(g."completedAt")
  FROM "GenerationRun" g
  WHERE g."projectId" = "Evidence"."projectId"
    AND g."status" = 'SUCCEEDED'
    AND g."documentId" IS NULL
    AND g."sectionTitle" IS NULL
    AND g."refinesRunId" IS NULL
    AND g."completedAt" >= "Evidence"."createdAt"
);
