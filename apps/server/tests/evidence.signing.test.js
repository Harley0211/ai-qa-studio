import { describe, expect, it } from "vitest";
import {
  createEvidenceSignature,
  verifyEvidenceSignature,
} from "../src/modules/evidence/evidence.signing.js";

describe("evidence signing", () => {
  const secret = "test-evidence-signing-secret-at-least-32-chars";
  const projectId = "project-123";
  const evidenceId = "evidence-456";
  const expires = "1790000000";

  const signature = createEvidenceSignature({
    secret,
    projectId,
    evidenceId,
    expires,
  });

  it("creates a 64-character hexadecimal signature", () => {
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a valid signature before expiration", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId,
        evidenceId,
        expires,
        signature,
        now: 1789999999000,
      }),
    ).toBe(true);
  });

  it("rejects a signature for a different project", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId: "another-project",
        evidenceId,
        expires,
        signature,
        now: 1789999999000,
      }),
    ).toBe(false);
  });

  it("rejects a signature for different evidence", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId,
        evidenceId: "another-evidence",
        expires,
        signature,
        now: 1789999999000,
      }),
    ).toBe(false);
  });

  it("rejects an expired signature", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId,
        evidenceId,
        expires,
        signature,
        now: 1790000000000,
      }),
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId,
        evidenceId,
        expires,
        signature: "invalid",
        now: 1789999999000,
      }),
    ).toBe(false);
  });

  it("rejects a malformed expiration timestamp", () => {
    expect(
      verifyEvidenceSignature({
        secret,
        projectId,
        evidenceId,
        expires: "not-a-timestamp",
        signature,
        now: 1789999999000,
      }),
    ).toBe(false);
  });
});
