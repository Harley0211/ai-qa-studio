-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "filename" TEXT,
    "content" TEXT NOT NULL,
    "sections" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "callbackTokenHash" TEXT,
    "callbackTokenExpiresAt" DATETIME,
    "callbackTokenUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "draftTestCases" TEXT,
    "reviewedAt" DATETIME,
    "documentId" TEXT,
    "sectionTitle" TEXT,
    CONSTRAINT "GenerationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GenerationRun" ("callbackTokenExpiresAt", "callbackTokenHash", "callbackTokenUsedAt", "completedAt", "createdAt", "draftTestCases", "error", "id", "projectId", "reviewedAt", "status") SELECT "callbackTokenExpiresAt", "callbackTokenHash", "callbackTokenUsedAt", "completedAt", "createdAt", "draftTestCases", "error", "id", "projectId", "reviewedAt", "status" FROM "GenerationRun";
DROP TABLE "GenerationRun";
ALTER TABLE "new_GenerationRun" RENAME TO "GenerationRun";
CREATE INDEX "GenerationRun_projectId_createdAt_idx" ON "GenerationRun"("projectId", "createdAt");
CREATE INDEX "GenerationRun_status_idx" ON "GenerationRun"("status");
CREATE TABLE "new_TestCase" (
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
    "stepExpectedResults" TEXT,
    "runStatus" TEXT NOT NULL DEFAULT 'Not Run',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceSection" TEXT,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("caseId", "createdAt", "data", "description", "expectedResult", "generationRunId", "id", "precondition", "projectId", "runStatus", "stepExpectedResults", "steps", "title", "updatedAt") SELECT "caseId", "createdAt", "data", "description", "expectedResult", "generationRunId", "id", "precondition", "projectId", "runStatus", "stepExpectedResults", "steps", "title", "updatedAt" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE INDEX "TestCase_projectId_createdAt_idx" ON "TestCase"("projectId", "createdAt");
CREATE INDEX "TestCase_generationRunId_idx" ON "TestCase"("generationRunId");
CREATE INDEX "TestCase_sourceDocumentId_idx" ON "TestCase"("sourceDocumentId");
CREATE UNIQUE INDEX "TestCase_projectId_caseId_key" ON "TestCase"("projectId", "caseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Document_projectId_createdAt_idx" ON "Document"("projectId", "createdAt");

