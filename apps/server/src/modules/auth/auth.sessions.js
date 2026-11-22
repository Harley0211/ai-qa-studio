import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "aqs_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export const publicUser = ({ id, email, name, role, createdAt }) => ({
  id,
  email,
  name,
  role,
  createdAt,
});

// Reads one cookie from the Cookie header (no cookie-parser dependency).
export function readSessionToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SESSION_COOKIE) {
      const value = part.slice(index + 1).trim();
      return /^[a-f0-9]{64}$/.test(value) ? value : null;
    }
  }

  return null;
}

function cookieOptions(secure) {
  return {
    httpOnly: true, // not readable from page scripts
    sameSite: "strict", // never sent with requests started by other sites
    secure,
    path: "/",
  };
}

export function createSessionStore({ prisma, secureCookies = false }) {
  async function create(res, userId) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    // Expired sessions are cleaned up whenever someone signs in.
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.session.create({
      data: { tokenHash: hashToken(token), userId, expiresAt },
    });

    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(secureCookies), expires: expiresAt });
    return token;
  }

  // The signed-in user for this request, or null.
  async function findUser(req) {
    const token = readSessionToken(req);
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date()) return null;
    return { user: session.user, sessionId: session.id };
  }

  async function destroy(req, res) {
    const token = readSessionToken(req);
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions(secureCookies));
  }

  // Signs a user out everywhere, optionally keeping one session (the caller's).
  async function destroyAllFor(userId, { exceptSessionId } = {}) {
    await prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  return { create, findUser, destroy, destroyAllFor };
}
