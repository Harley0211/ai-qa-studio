// The emails the app sends: a designed HTML version (tables and inline styles,
// so it looks right in Gmail and Outlook) and a plain-text version.
// Everything a person typed (names, project names) is escaped.

export const EMAIL_KINDS = [
  "INVITATION",
  "WELCOME",
  "PROJECTS_ADDED",
  "PROJECTS_REMOVED",
  "ACCOUNT_DISABLED",
  "ACCOUNT_ENABLED",
  "ACCOUNT_REMOVED",
];

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLORS = {
  page: "#eef1f8",
  card: "#ffffff",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  accent: "#4f46e5",
  accentSoft: "#eef2ff",
  success: "#15803d",
  successSoft: "#f0fdf4",
  danger: "#b91c1c",
  dangerSoft: "#fef2f2",
  amber: "#92400e",
  amberSoft: "#fffbeb",
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Email apps don't show images packed into the message, so the logo is loaded
// from the public GitHub repo (a fixed address, unlike the tunnel link).
// EMAIL_LOGO_URL overrides it, e.g. to test a logo on the staging branch.
const DEFAULT_LOGO_URL =
  "https://raw.githubusercontent.com/Harley0211/ai-qa-studio/main/apps/web/public/email-logo.png";
const logoUrl = () => process.env.EMAIL_LOGO_URL || DEFAULT_LOGO_URL;

const listNames = (names) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function button(label, href) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px">
      <tr><td style="border-radius:10px;background:${COLORS.accent}">
        <a href="${escapeHtml(href)}" target="_blank"
           style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">
          ${escapeHtml(label)}
        </a>
      </td></tr>
    </table>
    <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted}">
      Button not working? Copy this link into your browser:<br>
      <a href="${escapeHtml(href)}" style="color:${COLORS.accent};word-break:break-all">${escapeHtml(href)}</a>
    </p>`;
}

// Project names as small rounded labels, one per line on narrow screens.
function projectList(names, tone = "success") {
  const [ink, soft] = tone === "danger" ? [COLORS.danger, COLORS.dangerSoft] : [COLORS.success, COLORS.successSoft];
  const rows = names
    .map(
      (name) => `
      <tr><td style="padding:4px 0">
        <span style="display:inline-block;padding:8px 14px;border-radius:999px;background:${soft};color:${ink};font-family:${FONT};font-size:14px;font-weight:600">
          ${tone === "danger" ? "&#10005;" : "&#10003;"}&nbsp; ${escapeHtml(name)}
        </span>
      </td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 4px">${rows}</table>`;
}

function badge(label, tone) {
  const map = {
    accent: [COLORS.accent, COLORS.accentSoft],
    success: [COLORS.success, COLORS.successSoft],
    danger: [COLORS.danger, COLORS.dangerSoft],
    amber: [COLORS.amber, COLORS.amberSoft],
  };
  const [ink, soft] = map[tone];
  return `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${soft};color:${ink};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(label)}</span>`;
}

const paragraph = (html) =>
  `<p style="margin:14px 0 0;font-family:${FONT};font-size:15px;line-height:24px;color:${COLORS.body}">${html}</p>`;

// The frame every email shares: gradient header, white card, footer.
function layout({ preheader, badgeHtml, title, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page}">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLORS.page}">
  <tr><td align="center" style="padding:32px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
      <tr><td style="border-radius:16px 16px 0 0;background:#4f46e5;background-image:linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#db2777 100%);padding:26px 32px">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td style="width:40px;height:40px"><img src="${escapeHtml(logoUrl())}" width="40" height="40" alt="AI QA Studio" style="display:block;width:40px;height:40px;border:0;border-radius:10px"></td>
          <td style="padding-left:12px;font-family:${FONT};font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.01em">AI QA Studio</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${COLORS.card};padding:34px 32px 30px;border-radius:0 0 16px 16px;box-shadow:0 12px 32px -18px rgba(15,23,42,.35)">
        ${badgeHtml ?? ""}
        <h1 style="margin:${badgeHtml ? "16px" : "0"} 0 0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${COLORS.ink}">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:22px 32px 0;text-align:center;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted}">
        Sent by AI QA Studio, your team's QA workspace.<br>
        You get these emails because an account uses this address. Questions? Ask your AI QA Studio admin.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const textFooter = "\n\n--\nSent by AI QA Studio. Questions? Ask your AI QA Studio admin.";

// Returns { subject, html, text } for one email.
export function renderEmail(kind, data) {
  const name = data.name || "there";
  const hi = `Hi ${escapeHtml(name)},`;

  switch (kind) {
    case "INVITATION": {
      const projects = data.projects ?? [];
      const subject = `${data.inviterName || "Your admin"} invited you to AI QA Studio`;
      const projectsHtml = projects.length
        ? paragraph("You'll be able to open these projects:") + projectList(projects)
        : paragraph("An admin will assign the projects you work on; they'll appear after you sign in.");
      return {
        subject,
        html: layout({
          preheader: `Accept your invitation and choose a password. The link works for ${data.expiresDays} days.`,
          badgeHtml: badge("Invitation", "accent"),
          title: "You're invited to AI QA Studio",
          bodyHtml:
            paragraph(hi) +
            paragraph(
              `<strong>${escapeHtml(data.inviterName || "Your admin")}</strong> added you as a <strong>${escapeHtml(
                data.roleLabel,
              )}</strong>. AI QA Studio turns screenshots and PRDs into test cases and helps you write bug reports and read HAR files.`,
            ) +
            projectsHtml +
            paragraph("Accept the invitation to choose your password and sign in:") +
            button("Accept invitation", data.link) +
            paragraph(
              `<span style="font-size:13px;color:${COLORS.muted}">This link works once and expires in ${escapeHtml(
                data.expiresDays,
              )} days. Didn't expect this? You can ignore this email.</span>`,
            ),
        }),
        text:
          `Hi ${name},\n\n${data.inviterName || "Your admin"} added you to AI QA Studio as a ${data.roleLabel}.\n` +
          (projects.length ? `\nYou'll be able to open: ${projects.join(", ")}\n` : "\nAn admin will assign your projects.\n") +
          `\nAccept the invitation and choose your password:\n${data.link}\n\nThe link works once and expires in ${data.expiresDays} days.` +
          textFooter,
      };
    }

    case "WELCOME":
      return {
        subject: "Welcome to AI QA Studio",
        html: layout({
          preheader: "Your account is ready. An admin will assign your projects.",
          badgeHtml: badge("Account created", "success"),
          title: "Welcome to AI QA Studio",
          bodyHtml:
            paragraph(hi) +
            paragraph("Your account is ready. You signed up as a <strong>Tester</strong>.") +
            paragraph(
              "Projects stay locked until an admin assigns them to you. You'll get an email as soon as you have access to one.",
            ) +
            button("Open AI QA Studio", data.link),
        }),
        text:
          `Hi ${name},\n\nYour AI QA Studio account is ready (Tester). Projects stay locked until an admin assigns them; you'll get an email when that happens.\n\nOpen AI QA Studio: ${data.link}` +
          textFooter,
      };

    case "PROJECTS_ADDED": {
      const projects = data.projects;
      const one = projects.length === 1;
      return {
        subject: one ? `You now have access to ${projects[0]}` : `You now have access to ${projects.length} projects`,
        html: layout({
          preheader: `${data.byName || "An admin"} gave you access to ${listNames(projects)}.`,
          badgeHtml: badge("Access granted", "success"),
          title: one ? `You've been added to ${projects[0]}` : "You've been added to new projects",
          bodyHtml:
            paragraph(hi) +
            paragraph(
              `<strong>${escapeHtml(data.byName || "An admin")}</strong> gave you access to ${one ? "this project" : "these projects"}:`,
            ) +
            projectList(projects) +
            paragraph("Open it from your project list. Its test cases, bug reports and HAR files are now available to you.") +
            button(one ? `Open ${projects[0]}` : "Open your projects", data.link),
        }),
        text:
          `Hi ${name},\n\n${data.byName || "An admin"} gave you access to: ${projects.join(", ")}.\n\nOpen AI QA Studio: ${data.link}` +
          textFooter,
      };
    }

    case "PROJECTS_REMOVED": {
      const projects = data.projects;
      const one = projects.length === 1;
      return {
        subject: one ? `Your access to ${projects[0]} was removed` : `Your access to ${projects.length} projects was removed`,
        html: layout({
          preheader: `You no longer have access to ${listNames(projects)}.`,
          badgeHtml: badge("Access removed", "danger"),
          title: one ? `You were removed from ${projects[0]}` : "You were removed from some projects",
          bodyHtml:
            paragraph(hi) +
            paragraph(
              `<strong>${escapeHtml(data.byName || "An admin")}</strong> removed your access to ${one ? "this project" : "these projects"}:`,
            ) +
            projectList(projects, "danger") +
            paragraph("Your other projects are not affected. If you still need access, ask an admin.") +
            button("Open your projects", data.link),
        }),
        text:
          `Hi ${name},\n\n${data.byName || "An admin"} removed your access to: ${projects.join(", ")}.\nYour other projects are not affected. If you still need access, ask an admin.\n\n${data.link}` +
          textFooter,
      };
    }

    case "ACCOUNT_DISABLED":
      return {
        subject: "Your AI QA Studio account was disabled",
        html: layout({
          preheader: "You can't sign in until an admin enables your account again.",
          badgeHtml: badge("Account disabled", "amber"),
          title: "Your account was disabled",
          bodyHtml:
            paragraph(hi) +
            paragraph(
              `<strong>${escapeHtml(data.byName || "An admin")}</strong> disabled your AI QA Studio account. You were signed out and can't sign in until an admin enables it again.`,
            ) +
            paragraph("Your work (test cases, bug reports, HAR files) stays saved. If you think this is a mistake, contact your admin."),
        }),
        text:
          `Hi ${name},\n\n${data.byName || "An admin"} disabled your AI QA Studio account. You can't sign in until an admin enables it again. Your work stays saved.` +
          textFooter,
      };

    case "ACCOUNT_ENABLED":
      return {
        subject: "Your AI QA Studio account is active again",
        html: layout({
          preheader: "You can sign in again.",
          badgeHtml: badge("Account active", "success"),
          title: "Welcome back",
          bodyHtml:
            paragraph(hi) +
            paragraph(`<strong>${escapeHtml(data.byName || "An admin")}</strong> enabled your account again. You can sign in with your usual password.`) +
            button("Sign in", data.link),
        }),
        text: `Hi ${name},\n\nYour AI QA Studio account is active again. Sign in: ${data.link}` + textFooter,
      };

    case "ACCOUNT_REMOVED":
      return {
        subject: "Your AI QA Studio account was removed",
        html: layout({
          preheader: "You no longer have an AI QA Studio account.",
          badgeHtml: badge("Account removed", "danger"),
          title: "Your account was removed",
          bodyHtml:
            paragraph(hi) +
            paragraph(
              `<strong>${escapeHtml(data.byName || "An admin")}</strong> removed your AI QA Studio account. You can no longer sign in.`,
            ) +
            paragraph("The projects and test cases you worked on stay with your team. If you think this is a mistake, contact your admin."),
        }),
        text:
          `Hi ${name},\n\n${data.byName || "An admin"} removed your AI QA Studio account. You can no longer sign in.` + textFooter,
      };

    default:
      throw new Error(`Unknown email kind: ${kind}`);
  }
}
