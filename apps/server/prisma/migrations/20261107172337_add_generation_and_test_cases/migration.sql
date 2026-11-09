-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "GenerationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "generationRunId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "precondition" TEXT,
    "steps" TEXT NOT NULL,
    "data" TEXT,
    "expectedResult" TEXT NOT NULL,
    "runStatus" TEXT NOT NULL DEFAULT 'Not Run',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GenerationRun_projectId_createdAt_idx" ON "GenerationRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationRun_status_idx" ON "GenerationRun"("status");

-- CreateIndex
CREATE INDEX "TestCase_projectId_createdAt_idx" ON "TestCase"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TestCase_generationRunId_idx" ON "TestCase"("generationRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_projectId_caseId_key" ON "TestCase"("projectId", "caseId");
