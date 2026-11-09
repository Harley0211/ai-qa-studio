import { createHmac, timingSafeEqual } from "node:crypto";

export function createEvidenceSignature({
  secret,
  projectId,
  evidenceId,
  expires,
}) {
  return createHmac("sha256", secret)
    .update(`${projectId}:${evidenceId}:${expires}`)
    .digest("hex");
}

export function verifyEvidenceSignature({
  secret,
  projectId,
  evidenceId,
  expires,
  signature,
  now = Date.now(),
}) {
  if (
    typeof expires !== "string" ||
    !/^\d+$/.test(expires) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) * 1000 <= now ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = createEvidenceSignature({
    secret,
    projectId,
    evidenceId,
    expires,
  });

  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}
