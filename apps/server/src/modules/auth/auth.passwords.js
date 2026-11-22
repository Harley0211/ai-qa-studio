import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// scrypt parameters (N, r, p) are stored with each hash so they can be raised
// later without breaking existing passwords.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

// Format: scrypt$N$r$p$<salt hex>$<hash hex>
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("hex"), hash.toString("hex")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === "string" ? stored.split("$") : [];
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;

  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return timingSafeEqual(actual, expected);
}

// Used when the email is unknown, so a failed sign-in takes about as long
// whether or not the account exists.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword("not-a-real-password");
  await verifyPassword(password, dummyHash);
  return false;
}
