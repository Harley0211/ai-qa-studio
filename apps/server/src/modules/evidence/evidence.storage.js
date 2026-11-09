
import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_STORAGE_ROOT = fileURLToPath(
  new URL('../../../storage/evidence/', import.meta.url),
);

const IMAGE_TYPES = {
  png: {
    mimeType: 'image/png',
    extension: '.png',
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  jpeg: {
    mimeType: 'image/jpeg',
    extension: '.jpg',
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  webp: {
    mimeType: 'image/webp',
    extension: '.webp',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  return Object.values(IMAGE_TYPES).find((type) => type.matches(buffer)) ?? null;
}

export function createStorageFilename(imageType) {
  return `${randomUUID()}${imageType.extension}`;
}

export function resolveStoragePath(storageRoot = DEFAULT_STORAGE_ROOT, storageKey) {
  const root = path.resolve(storageRoot);
  const target = path.resolve(root, storageKey);

  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid evidence storage key');
  }

  return target;
}

export async function ensureStorageDirectory(storageRoot, projectId) {
  const directory = resolveStoragePath(storageRoot, projectId);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function removeStorageFile(storageRoot, storageKey) {
  const filePath = resolveStoragePath(storageRoot, storageKey);
  await rm(filePath, { force: true });
}

export async function removeProjectStorage(storageRoot, projectId) {
  const directory = resolveStoragePath(storageRoot, projectId);
  await rm(directory, { recursive: true, force: true });
}

export { DEFAULT_STORAGE_ROOT };
