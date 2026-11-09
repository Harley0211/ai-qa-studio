import { ApiError, isPrismaCode, notFound } from '../../lib/errors.js';

const duplicate = () =>
  new ApiError(409, 'DUPLICATE_URL', 'This URL is already registered for the project', {
    fields: { url: 'This URL is already registered for the project' },
  });

const ordered = [{ createdAt: 'asc' }, { id: 'asc' }];

export function createUrlsService(prisma) {
  async function assertProject(projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw notFound('Project');
  }

  return {
    async list(projectId) {
      await assertProject(projectId);
      const items = await prisma.projectURL.findMany({ where: { projectId }, orderBy: ordered });
      return { items, total: items.length };
    },

    async create(projectId, { url, label }) {
      await assertProject(projectId);
      try {
        return await prisma.projectURL.create({ data: { projectId, url, label: label ?? null } });
      } catch (err) {
        if (isPrismaCode(err, 'P2002')) throw duplicate();
        throw err;
      }
    },

    async update(projectId, urlId, data) {
      await assertProject(projectId);
      const existing = await prisma.projectURL.findFirst({ where: { id: urlId, projectId } });
      if (!existing) throw notFound('URL');
      try {
        return await prisma.projectURL.update({ where: { id: urlId }, data });
      } catch (err) {
        if (isPrismaCode(err, 'P2002')) throw duplicate();
        throw err;
      }
    },

    async remove(projectId, urlId) {
      await assertProject(projectId);
      const { count } = await prisma.projectURL.deleteMany({ where: { id: urlId, projectId } });
      if (count === 0) throw notFound('URL');
    },
  };
}
