import { copyFile, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Where saved bug report and HAR folders live: apps/server/storage/.
// (Screenshots for projects keep their own folder, storage/evidence/.)
export const DEFAULT_FILES_ROOT = fileURLToPath(new URL("../../storage/", import.meta.url));

// Files on this server's disk, addressed by a key relative to the root
// ("bug-reports/<id>/attachments/a.png"). Everything that reads or writes
// saved files goes through here, so another backend (a cloud drive) could
// replace it without touching the rest.
export function createFileStore(root = DEFAULT_FILES_ROOT) {
  const base = path.resolve(root);

  function resolve(key) {
    const target = path.resolve(base, key);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error("Storage key escapes the storage root");
    }
    return target;
  }

  async function ensureDir(key) {
    await mkdir(path.dirname(resolve(key)), { recursive: true });
  }

  return {
    root: base,
    resolve,

    async save(key, buffer) {
      await ensureDir(key);
      await writeFile(resolve(key), buffer, { flag: "wx" });
    },

    // Moves an uploaded temp file into place (copies across drives).
    async moveIn(key, tempPath) {
      await ensureDir(key);
      try {
        await rename(tempPath, resolve(key));
      } catch (error) {
        if (error.code !== "EXDEV") throw error;
        await copyFile(tempPath, resolve(key));
        await unlink(tempPath).catch(() => {});
      }
    },

    // Deletes a whole folder ("bug-reports/<id>") and everything in it.
    async removeFolder(prefix) {
      const target = resolve(prefix);
      if (target === base) throw new Error("Refusing to delete the storage root");
      await rm(target, { recursive: true, force: true });
    },
  };
}

// A file name that is safe on disk and in a ZIP: no folders, no odd characters.
export function safeFileName(name, fallback = "file") {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return cleaned || fallback;
}
