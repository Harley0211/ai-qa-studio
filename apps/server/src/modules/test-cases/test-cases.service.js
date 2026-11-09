import { notFound } from "../../lib/errors.js";

const testCaseSelect = {
  id: true,
  caseId: true,
  projectId: true,
  generationRunId: true,
  title: true,
  description: true,
  precondition: true,
  steps: true,
  data: true,
  expectedResult: true,
  runStatus: true,
  createdAt: true,
  updatedAt: true,
};

function normalizeSteps(steps) {
  if (Array.isArray(steps)) {
    return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  }

  return steps;
}

export function createTestCasesService(prisma) {
  async function assertProject(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) throw notFound("Project");
  }

  async function getTestCase(projectId, testCaseId) {
    await assertProject(projectId);

    const testCase = await prisma.testCase.findFirst({
      where: {
        id: testCaseId,
        projectId,
      },
    });

    if (!testCase) throw notFound("Test case");

    return testCase;
  }

  return {
    async list(projectId, filters = {}) {
      await assertProject(projectId);

      const where = {
        projectId,
        ...(filters.runStatus && {
          runStatus: filters.runStatus,
        }),
        ...(filters.q && {
          OR: [
            { caseId: { contains: filters.q } },
            { title: { contains: filters.q } },
          ],
        }),
      };

      const items = await prisma.testCase.findMany({
        where,
        orderBy: [{ caseId: "asc" }],
        select: testCaseSelect,
      });

      return { items, total: items.length };
    },

    async create(projectId, input) {
      await assertProject(projectId);

      return prisma.$transaction(async (tx) => {
        const project = await tx.project.update({
          where: { id: projectId },
          data: {
            nextTestCaseNumber: { increment: 1 },
          },
          select: {
            nextTestCaseNumber: true,
          },
        });

        const number = project.nextTestCaseNumber - 1;
        const caseId = `TC-${String(number).padStart(4, "0")}`;

        return tx.testCase.create({
          data: {
            projectId,
            caseId,
            title: input.title,
            description: input.description ?? null,
            precondition: input.precondition ?? null,
            steps: normalizeSteps(input.steps),
            data: input.data ?? null,
            expectedResult: input.expectedResult,
            runStatus: "Not Run",
          },
          select: testCaseSelect,
        });
      });
    },

    async get(projectId, testCaseId) {
      return getTestCase(projectId, testCaseId);
    },

    async update(projectId, testCaseId, input) {
      const existing = await getTestCase(projectId, testCaseId);

      const data = { ...input };

      if (Array.isArray(data.steps)) {
        data.steps = normalizeSteps(data.steps);
      }

      return prisma.testCase.update({
        where: { id: existing.id },
        data,
        select: testCaseSelect,
      });
    },

    async updateStatus(projectId, testCaseId, runStatus) {
      const existing = await getTestCase(projectId, testCaseId);

      return prisma.testCase.update({
        where: { id: existing.id },
        data: { runStatus },
        select: testCaseSelect,
      });
    },

    async remove(projectId, testCaseId) {
      const existing = await getTestCase(projectId, testCaseId);

      await prisma.testCase.delete({
        where: { id: existing.id },
      });
    },
  };
}
