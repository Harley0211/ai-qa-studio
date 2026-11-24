import { createHash, randomBytes } from "node:crypto";
import { appUrlFor } from "./email.routes.js";

export const INVITE_DAYS = 7;
const ROLE_LABELS = { ADMIN: "Admin", MEMBER: "Tester" };

export const hashInviteToken = (token) => createHash("sha256").update(token).digest("hex");

// A new one-time invitation link token. Only its hash is stored.
export function newInvitation() {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    inviteTokenHash: hashInviteToken(token),
    inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  };
}

async function projectNames(prisma, ids) {
  if (!ids.length) return [];
  const rows = await prisma.project.findMany({ where: { id: { in: ids } }, select: { name: true }, orderBy: { name: "asc" } });
  return rows.map((row) => row.name);
}

// Who should get project emails: testers who already use the app. Someone
// still invited sees their projects in the invitation instead, and a
// disabled account can't open anything anyway.
const getsProjectEmails = (user) => user.role === "MEMBER" && user.active && Boolean(user.lastLoginAt);

export function createNotifier({ prisma, mail }) {
  const send = (...args) => mail.emails.send(...args);

  return {
    async invitation(req, user, token, inviter) {
      const projects = await projectNames(prisma, (user.projects ?? []).map((p) => p.projectId));
      return send("INVITATION", user.email, {
        name: user.name,
        inviterName: inviter?.name,
        roleLabel: ROLE_LABELS[user.role] ?? user.role,
        projects: user.role === "ADMIN" ? [] : projects,
        link: `${appUrlFor(req, mail.publicAppUrl)}/invite/${token}`,
        expiresDays: INVITE_DAYS,
      });
    },

    welcome(req, user) {
      return send("WELCOME", user.email, { name: user.name, link: appUrlFor(req, mail.publicAppUrl) });
    },

    // One email for the projects added and one for those removed.
    async projectChanges(req, user, beforeIds, afterIds, byName) {
      if (!getsProjectEmails(user)) return [];
      const before = new Set(beforeIds);
      const after = new Set(afterIds);
      const added = await projectNames(prisma, [...after].filter((id) => !before.has(id)));
      const removed = await projectNames(prisma, [...before].filter((id) => !after.has(id)));
      const link = `${appUrlFor(req, mail.publicAppUrl)}/projects`;
      const sent = [];
      if (added.length) sent.push(await send("PROJECTS_ADDED", user.email, { name: user.name, projects: added, byName, link }));
      if (removed.length) {
        sent.push(await send("PROJECTS_REMOVED", user.email, { name: user.name, projects: removed, byName, link }));
      }
      return sent;
    },

    accountState(req, user, active, byName) {
      return send(active ? "ACCOUNT_ENABLED" : "ACCOUNT_DISABLED", user.email, {
        name: user.name,
        byName,
        link: appUrlFor(req, mail.publicAppUrl),
      });
    },

    accountRemoved(user, byName) {
      return send("ACCOUNT_REMOVED", user.email, { name: user.name, byName });
    },
  };
}
