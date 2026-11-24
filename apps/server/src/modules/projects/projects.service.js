
import { isPrismaCode, notFound } from '../../lib/errors.js';
import { removeProjectStorage } from '../evidence/evidence.storage.js';

const countSelect = {
  select: { urls: true, testCases: true, evidence: true, documents: true, members: true },
};

const detailInclude = {
  urls: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  _count: countSelect,
};

const withUrlCount = ({ _count, ...project }) => ({
  ...project,
  urlCount: _count.urls,
  testCaseCount: _count.testCases,
  evidenceCount: _count.evidence,
  documentCount: _count.documents,
  // Testers assigned to the project (admins open every project anyway).
  memberCount: _count.members,
});

// What a tester sees of a project they are not assigned to: only its name.
const lockedProject = ({ id, name }) => ({ id, name, access: 'NONE' });

export const isAdmin = (user) => user?.role === 'ADMIN';

export function createProjectsService(prisma, storageRoot) {
  return {
    // Admins get every project. Testers get their assigned projects in full
    // and the others locked (name only), so they know whom to ask.
    async list(user, { q } = {}) {
      const rows = await prisma.project.findMany({
        where: q ? { name: { contains: q } } : undefined,
        orderBy: { updatedAt: 'desc' },
        include: { _count: countSelect },
      });

      if (isAdmin(user)) {
        const items = rows.map((row) => ({ ...withUrlCount(row), access: 'ADMIN' }));
        return { items, total: items.length };
      }

      const assigned = new Set(
        (await prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } })).map(
          (m) => m.projectId,
        ),
      );
      const items = rows
        .map((row) => {
          if (!assigned.has(row.id)) return lockedProject(row);
          const { memberCount: _hidden, ...project } = withUrlCount(row);
          return { ...project, access: 'ASSIGNED' };
        })
        // Assigned projects first.
        .sort((a, b) => Number(b.access === 'ASSIGNED') - Number(a.access === 'ASSIGNED'));
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

    async canOpen(user, projectId) {
      if (isAdmin(user)) return true;
      const member = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: user.id, projectId } },
        select: { projectId: true },
      });
      return Boolean(member);
    },

    async exists(projectId) {
      return Boolean(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
    },

    // The testers assigned to a project.
    async memberIds(projectId) {
      const rows = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
      return rows.map((row) => row.userId);
    },

    // Replaces the testers assigned to a project. Admins are skipped: they
    // open every project anyway.
    async setMembers(projectId, userIds) {
      if (!(await this.exists(projectId))) throw notFound('Project');
      const testers = await prisma.user.findMany({
        where: { id: { in: [...new Set(userIds)] }, role: 'MEMBER' },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.projectMember.deleteMany({ where: { projectId } }),
        prisma.projectMember.createMany({ data: testers.map(({ id }) => ({ userId: id, projectId })) }),
      ]);
      return this.memberIds(projectId);
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
