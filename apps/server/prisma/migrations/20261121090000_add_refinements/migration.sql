-- AlterTable
ALTER TABLE "GenerationRun" ADD COLUMN "refinesRunId" TEXT;
ALTER TABLE "GenerationRun" ADD COLUMN "instruction" TEXT;
ALTER TABLE "GenerationRun" ADD COLUMN "replySummary" TEXT;

-- CreateIndex
CREATE INDEX "GenerationRun_refinesRunId_idx" ON "GenerationRun"("refinesRunId");
