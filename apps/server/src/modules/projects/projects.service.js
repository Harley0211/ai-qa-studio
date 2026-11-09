
import { isPrismaCode, notFound } from '../../lib/errors.js';
import { removeProjectStorage } from '../evidence/evidence.storage.js';

const detailInclude = {
  urls: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  _count: { select: { urls: true } },
};

const withUrlCount = ({ _count, ...project }) => ({
  ...project,
  urlCount: _count.urls,
});

export function createProjectsService(prisma, storageRoot) {
  return {
    async list({ q } = {}) {
      const rows = await prisma.project.findMany({
        where: q ? { name: { contains: q } } : undefined,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { urls: true } } },
      });

      const items = rows.map(withUrlCount);
      return { items, total: items.length };
    },

    async get(id) {
      const row = await prisma.project.findUnique({
        where: { id },
        include: detailInclude,
      });

      if (!row) throw notFound('Project');
      return withUrlCount(row);
    },

    async create({ name, description, url }) {
      const row = await prisma.project.create({
        data: {
          name,
          description: description ?? null,
          ...(url ? { urls: { create: { url } } } : {}),
        },
        include: detailInclude,
      });

      return withUrlCount(row);
    },

    async update(id, data) {
      try {
        const row = await prisma.project.update({
          where: { id },
          data,
          include: detailInclude,
        });

        return withUrlCount(row);
      } catch (err) {
        if (isPrismaCode(err, 'P2025')) throw notFound('Project');
        throw err;
      }
    },

    async remove(id) {
      try {
        await prisma.project.delete({ where: { id } });
      } catch (err) {
        if (isPrismaCode(err, 'P2025')) throw notFound('Project');
        throw err;
      }

      // Prisma cascades database records; this removes physical evidence files.
      await removeProjectStorage(storageRoot, id);
    },
  };
}
