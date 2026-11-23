-- Bug reports and HAR files now belong to a project and are only shown there.
-- Existing ones are given to the oldest project (they were shared before).

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BugReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "title" TEXT,
    "severity" TEXT,
    "affectedArea" TEXT,
    "input" TEXT NOT NULL,
    "report" TEXT,
    "texts" TEXT,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "BugReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BugReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BugReport" ("affectedArea", "completedAt", "createdAt", "createdById", "error", "id", "input", "report", "severity", "status", "texts", "title", "updatedAt", "projectId")
SELECT "affectedArea", "completedAt", "createdAt", "createdById", "error", "id", "input", "report", "severity", "status", "texts", "title", "updatedAt",
       (SELECT "id" FROM "Project" ORDER BY "createdAt" ASC LIMIT 1)
FROM "BugReport"
WHERE EXISTS (SELECT 1 FROM "Project");
DROP TABLE "BugReport";
ALTER TABLE "new_BugReport" RENAME TO "BugReport";
CREATE INDEX "BugReport_projectId_createdAt_idx" ON "BugReport"("projectId", "createdAt");
CREATE INDEX "BugReport_status_idx" ON "BugReport"("status");
CREATE TABLE "new_HarFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HarFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HarFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HarFile" ("createdAt", "createdById", "id", "name", "size", "storageKey", "summary", "projectId")
SELECT "createdAt", "createdById", "id", "name", "size", "storageKey", "summary",
       (SELECT "id" FROM "Project" ORDER BY "createdAt" ASC LIMIT 1)
FROM "HarFile"
WHERE EXISTS (SELECT 1 FROM "Project");
DROP TABLE "HarFile";
ALTER TABLE "new_HarFile" RENAME TO "HarFile";
CREATE INDEX "HarFile_projectId_createdAt_idx" ON "HarFile"("projectId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
