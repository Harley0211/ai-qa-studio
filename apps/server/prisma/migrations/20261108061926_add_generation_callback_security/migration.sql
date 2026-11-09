-- AlterTable
ALTER TABLE "GenerationRun" ADD COLUMN "callbackTokenExpiresAt" DATETIME;
ALTER TABLE "GenerationRun" ADD COLUMN "callbackTokenHash" TEXT;
ALTER TABLE "GenerationRun" ADD COLUMN "callbackTokenUsedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "nextTestCaseNumber" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Project" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_updatedAt_idx" ON "Project"("updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
