import { createEvidenceSignature } from "../src/modules/evidence/evidence.signing.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { resolveStoragePath } from "../src/modules/evidence/evidence.storage.js";
import {
  api as projectApi,
  createProject,
  prisma,
  resetDb,
} from "./helpers.js";
import { removeProjectStorage } from "../src/modules/evidence/evidence.storage.js";

const storageRoot = mkdtempSync(path.join(os.tmpdir(), "aqs-evidence-tests-"));

const app = createApp({ prisma, env, storageRoot });
const api = () => request(app);

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff]);

const webpBuffer = Buffer.from("RIFF1234WEBP");

async function upload(projectId, buffer, filename, contentType) {
  return api()
    .post(`/api/projects/${projectId}/evidence`)
    .attach("file", buffer, { filename, contentType });
}

beforeAll(() => {
  if (!env.MAX_UPLOAD_MB) {
    throw new Error("MAX_UPLOAD_MB is missing from the test environment");
  }
});

beforeEach(resetDb);

afterAll(async () => {
  rmSync(storageRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("POST /api/projects/:projectId/evidence", () => {
  it("uploads a valid PNG image", async () => {
    const project = await createProject();

    const res = await upload(
      project.id,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId: project.id,
      filename: "screenshot.png",
      mimeType: "image/png",
      fileSize: pngBuffer.length,
    });
    expect(res.body.id).toBeTruthy();
  });

  it.each([
    ["JPEG", jpegBuffer, "screenshot.jpg", "image/jpeg"],
    ["WEBP", webpBuffer, "screenshot.webp", "image/webp"],
  ])("uploads a valid %s image", async (_type, buffer, filename, mimeType) => {
    const project = await createProject();

    const res = await upload(project.id, buffer, filename, mimeType);

    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe(mimeType);
  });

  it("rejects invalid image contents even when the MIME type says PNG", async () => {
    const project = await createProject();

    const res = await upload(
      project.id,
      Buffer.from("this is not an image"),
      "fake.png",
      "image/png",
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("rejects uploads without a file", async () => {
    const project = await createProject();

    const res = await api()
      .post(`/api/projects/${project.id}/evidence`)
      .field("description", "No image attached");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILE_REQUIRED");
  });

  it("rejects files exceeding the upload size limit", async () => {
    const project = await createProject();
    const oversizedBuffer = Buffer.alloc(env.MAX_UPLOAD_MB * 1024 * 1024 + 1);

    const res = await upload(
      project.id,
      oversizedBuffer,
      "large.png",
      "image/png",
    );

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns 404 when uploading to a nonexistent project", async () => {
    const res = await upload(
      "nonexistent-project",
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/projects/:projectId/evidence", () => {
  it("lists evidence belonging to a project", async () => {
    const project = await createProject();

    await upload(project.id, pngBuffer, "screenshot.png", "image/png");

    const res = await api().get(`/api/projects/${project.id}/evidence`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      projectId: project.id,
      filename: "screenshot.png",
      mimeType: "image/png",
    });

    expect(res.body.items[0].storageKey).toBeUndefined();
  });

  it("returns 404 for a nonexistent project", async () => {
    const res = await api().get("/api/projects/nonexistent-project/evidence");

    expect(res.status).toBe(404);
  });
});

describe("GET /api/projects/:projectId/evidence/:evidenceId/file", () => {
  it("returns the uploaded image", async () => {
    const project = await createProject();

    const uploadRes = await upload(
      project.id,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    const res = await api().get(
      `/api/projects/${project.id}/evidence/${uploadRes.body.id}/file`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(res.body)).toEqual(pngBuffer);
  });

  it("prevents access through another project", async () => {
    const projectA = await createProject({ name: "Project A" });
    const projectB = await createProject({ name: "Project B" });

    const uploadRes = await upload(
      projectA.id,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    const res = await api().get(
      `/api/projects/${projectB.id}/evidence/${uploadRes.body.id}/file`,
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/projects/:projectId/evidence/:evidenceId/signed-file", () => {
  async function createSignedUrl(projectId, evidenceId, expires) {
    const signature = createEvidenceSignature({
      secret: env.EVIDENCE_SIGNING_SECRET,
      projectId,
      evidenceId,
      expires: String(expires),
    });

    return `/api/projects/${projectId}/evidence/${evidenceId}/signed-file?expires=${expires}&signature=${signature}`;
  }

  async function uploadEvidence(projectId) {
    const uploadRes = await upload(
      projectId,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    return uploadRes.body.id;
  }

  it("downloads an image using a valid signed URL", async () => {
    const project = await createProject();
    const evidenceId = await uploadEvidence(project.id);
    const expires = Math.floor(Date.now() / 1000) + 60;

    const url = await createSignedUrl(project.id, evidenceId, expires);
    const res = await api().get(url);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(res.body)).toEqual(pngBuffer);
  });

  it("rejects an invalid signature", async () => {
    const project = await createProject();
    const evidenceId = await uploadEvidence(project.id);
    const expires = Math.floor(Date.now() / 1000) + 60;

    const res = await api().get(
      `/api/projects/${project.id}/evidence/${evidenceId}/signed-file?expires=${expires}&signature=${"0".repeat(64)}`,
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_EVIDENCE_SIGNATURE");
  });

  it("rejects an expired signed URL", async () => {
    const project = await createProject();
    const evidenceId = await uploadEvidence(project.id);
    const expires = Math.floor(Date.now() / 1000) - 60;

    const url = await createSignedUrl(project.id, evidenceId, expires);
    const res = await api().get(url);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_EVIDENCE_SIGNATURE");
  });

  it("rejects a signed URL used with another project ID", async () => {
    const projectA = await createProject({ name: "Project A" });
    const projectB = await createProject({ name: "Project B" });
    const evidenceId = await uploadEvidence(projectA.id);
    const expires = Math.floor(Date.now() / 1000) + 60;

    const signature = createEvidenceSignature({
      secret: env.EVIDENCE_SIGNING_SECRET,
      projectId: projectA.id,
      evidenceId,
      expires: String(expires),
    });

    const res = await api().get(
      `/api/projects/${projectB.id}/evidence/${evidenceId}/signed-file?expires=${expires}&signature=${signature}`,
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_EVIDENCE_SIGNATURE");
  });

  it("rejects a signed URL used with another evidence ID", async () => {
    const project = await createProject();
    const evidenceId = await uploadEvidence(project.id);
    const expires = Math.floor(Date.now() / 1000) + 60;

    const signature = createEvidenceSignature({
      secret: env.EVIDENCE_SIGNING_SECRET,
      projectId: project.id,
      evidenceId,
      expires: String(expires),
    });

    const res = await api().get(
      `/api/projects/${project.id}/evidence/another-evidence-id/signed-file?expires=${expires}&signature=${signature}`,
    );

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_EVIDENCE_SIGNATURE");
  });
});

describe("DELETE /api/projects/:projectId/evidence/:evidenceId", () => {
  it("deletes the evidence record and physical file", async () => {
    const project = await createProject();

    const uploadRes = await upload(
      project.id,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    const evidence = await prisma.evidence.findUnique({
      where: { id: uploadRes.body.id },
    });

    const filePath = resolveStoragePath(storageRoot, evidence.storageKey);

    expect(existsSync(filePath)).toBe(true);

    const res = await api().delete(
      `/api/projects/${project.id}/evidence/${uploadRes.body.id}`,
    );

    expect(res.status).toBe(204);
    expect(
      await prisma.evidence.findUnique({
        where: { id: uploadRes.body.id },
      }),
    ).toBeNull();

    expect(existsSync(filePath)).toBe(false);
  });

  it("returns 404 for nonexistent evidence", async () => {
    const project = await createProject();

    const res = await api().delete(
      `/api/projects/${project.id}/evidence/nonexistent-evidence`,
    );

    expect(res.status).toBe(404);
  });

  it("removes physical evidence files when the project is deleted", async () => {
    const project = await createProject();

    const uploadRes = await upload(
      project.id,
      pngBuffer,
      "screenshot.png",
      "image/png",
    );

    const evidence = await prisma.evidence.findUnique({
      where: { id: uploadRes.body.id },
    });

    const filePath = resolveStoragePath(storageRoot, evidence.storageKey);
    const projectDirectory = path.dirname(filePath);

    expect(existsSync(filePath)).toBe(true);

    const res = await api().delete(`/api/projects/${project.id}`);

    expect(res.status).toBe(204);
    expect(existsSync(projectDirectory)).toBe(false);
    expect(
      await prisma.evidence.count({
        where: { projectId: project.id },
      }),
    ).toBe(0);
  });
});
