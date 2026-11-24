import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "aqs_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// Without "Remember me" the cookie ends with the browser, and the session
// itself ends after this long even if the browser stays open.
export const SHORT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

// Shown in lists: "Disabled", "Invited" (added, never signed in) or "Active".
export const userStatus = ({ active, lastLoginAt }) =>
  !active ? "DISABLED" : lastLoginAt ? "ACTIVE" : "INVITED";

export const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  active: user.active,
  status: userStatus(user),
  lastLoginAt: user.lastLoginAt ?? null,
  createdAt: user.createdAt,
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
  // Secure cookies in production, and whenever the browser came in over https
  // (e.g. through a tunnel; see "trust proxy" in app.js).
  const secureFor = (req) => secureCookies || Boolean(req.secure);

  async function create(req, res, userId, { remember = true } = {}) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (remember ? SESSION_TTL_MS : SHORT_SESSION_TTL_MS));

    // Expired sessions are cleaned up whenever someone signs in.
    await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.session.create({
      data: { tokenHash: hashToken(token), userId, expiresAt, remember },
    });
    // Signed in: any invitation link still out there stops working.
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
    });

    // A cookie without an expiry date is forgotten when the browser closes.
    res.cookie(SESSION_COOKIE, token, {
      ...cookieOptions(secureFor(req)),
      ...(remember ? { expires: expiresAt } : {}),
    });
    return token;
  }

  // The signed-in user for this request, or null. A disabled account's
  // sessions stop working straight away.
  async function findUser(req) {
    const token = readSessionToken(req);
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
    return { user: session.user, sessionId: session.id, remember: session.remember };
  }

  async function destroy(req, res) {
    const token = readSessionToken(req);
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions(secureFor(req)));
  }

  // Signs a user out everywhere, optionally keeping one session (the caller's).
  async function destroyAllFor(userId, { exceptSessionId } = {}) {
    await prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  return { create, findUser, destroy, destroyAllFor };
}
