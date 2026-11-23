
import { writeFile } from 'node:fs/promises';
import { ApiError, notFound } from '../../lib/errors.js';
import {
  createStorageFilename,
  detectImageType,
  ensureStorageDirectory,
  removeStorageFile,
  resolveStoragePath,
} from './evidence.storage.js';

const ordered = [{ createdAt: 'desc' }, { id: 'asc' }];

function parseIds(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createEvidenceService(prisma, storageRoot) {
  async function assertProject(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) throw notFound('Project');
  }

  return {
    async list(projectId) {
      await assertProject(projectId);

      const items = await prisma.evidence.findMany({
        where: { projectId },
        orderBy: ordered,
        select: {
          id: true,
          projectId: true,
          filename: true,
          mimeType: true,
          fileSize: true,
          createdAt: true,
          lastUsedAt: true,
        },
      });

      return { items, total: items.length };
    },

    // Deletes every image already used by a finished generation, except ones a
    // running generation still needs to download.
    async removeUsed(projectId) {
      await assertProject(projectId);

      const running = await prisma.generationRun.findMany({
        where: { projectId, status: 'PENDING', evidenceIds: { not: null } },
        select: { evidenceIds: true },
      });
      const inUse = new Set(running.flatMap(({ evidenceIds }) => parseIds(evidenceIds)));

      const used = (
        await prisma.evidence.findMany({
          where: { projectId, lastUsedAt: { not: null } },
          select: { id: true, storageKey: true },
        })
      ).filter((item) => !inUse.has(item.id));

      if (used.length === 0) return { deletedCount: 0 };

      await prisma.evidence.deleteMany({
        where: { projectId, id: { in: used.map((item) => item.id) } },
      });

      await Promise.all(
        used.map((item) => removeStorageFile(storageRoot, item.storageKey).catch(() => {})),
      );

      return { deletedCount: used.length };
    },

    async create(projectId, file) {
      await assertProject(projectId);

      if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
        throw new ApiError(400, 'FILE_REQUIRED', 'Please select an image to upload');
      }

      const imageType = detectImageType(file.buffer);

      if (!imageType) {
        throw new ApiError(
          400,
          'INVALID_FILE_TYPE',
          'Only valid PNG, JPG, JPEG, and WEBP images are supported',
        );
      }

      const storedFilename = createStorageFilename(imageType);
      const storageKey = `${projectId}/${storedFilename}`;
      const directory = await ensureStorageDirectory(storageRoot, projectId);
      const filePath = resolveStoragePath(storageRoot, storageKey);

      // Save the file before creating its database record.
      await writeFile(filePath, file.buffer, { flag: 'wx' });

      try {
        return await prisma.evidence.create({
          data: {
            projectId,
            filename: file.originalname || 'unnamed-image',
            storedFilename,
            mimeType: imageType.mimeType,
            fileSize: file.size,
            storageKey,
          },
          select: {
            id: true,
            projectId: true,
            filename: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
        });
      } catch (error) {
        // Avoid leaving an orphaned file if the database operation fails.
        await removeStorageFile(storageRoot, storageKey).catch(() => {});
        throw error;
      }
    },

    async get(projectId, evidenceId) {
      await assertProject(projectId);

      const evidence = await prisma.evidence.findFirst({
        where: { id: evidenceId, projectId },
      });

      if (!evidence) throw notFound('Evidence');

      return evidence;
    },

    async getFilePath(projectId, evidenceId) {
      const evidence = await this.get(projectId, evidenceId);

      return {
        evidence,
        filePath: resolveStoragePath(storageRoot, evidence.storageKey),
      };
    },

    async remove(projectId, evidenceId) {
      const evidence = await this.get(projectId, evidenceId);

      await prisma.evidence.delete({
        where: { id: evidence.id },
      });

      await removeStorageFile(storageRoot, evidence.storageKey);
    },
  };
}
