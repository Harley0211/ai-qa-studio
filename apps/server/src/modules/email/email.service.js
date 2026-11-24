import { notFound } from "../../lib/errors.js";
import { renderEmail } from "./email.templates.js";

const SEND_TIMEOUT_MS = 20_000;
export const NOT_SET_UP = "Email sending is not set up (N8N_EMAIL_WEBHOOK_URL and EMAIL_FROM in apps/server/.env)";

// Sends one email through the n8n "Send email" workflow, which holds the
// Gmail login. Returns null when sending isn't configured.
export function createN8nEmailSender({ webhookUrl, requestSecret, from, fetchImpl = fetch }) {
  if (!webhookUrl || !requestSecret || !from) return null;
  return {
    async send({ to, subject, html, text }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      try {
        const res = await fetchImpl(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-AQS-Request-Secret": requestSecret },
          body: JSON.stringify({ from, to, subject, html, text }),
          signal: controller.signal,
        });
        let body = null;
        try {
          body = await res.json();
        } catch {
          /* not JSON */
        }
        if (!res.ok || body?.ok === false) {
          const reason = body?.error || body?.message || `n8n answered ${res.status}`;
          throw new Error(res.status === 404 ? "The n8n email workflow is not active (webhook not found)" : reason);
        }
      } catch (error) {
        if (error.name === "AbortError") throw new Error("n8n did not answer within 20 seconds");
        if (error.cause?.code === "ECONNREFUSED") throw new Error("n8n is not running");
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const summary = ({ id, to, kind, subject, status, error, attempts, createdAt, sentAt }) => ({
  id,
  to,
  kind,
  subject,
  status,
  error,
  attempts,
  createdAt,
  sentAt,
});

// Writes, stores and sends the app's emails. Sending never breaks the action
// that caused it: a failure is recorded and can be retried from Admin → Emails.
export function createEmailService({ prisma, sender, log = () => {} }) {
  async function deliver(message) {
    if (!sender) {
      return prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: "SKIPPED", error: NOT_SET_UP },
      });
    }
    try {
      await sender.send(message);
      return prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: "SENT", error: null, attempts: { increment: 1 }, sentAt: new Date() },
      });
    } catch (error) {
      log(`[email] sending "${message.subject}" failed: ${error.message}`);
      return prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", error: String(error.message).slice(0, 500), attempts: { increment: 1 } },
      });
    }
  }

  return {
    // Returns { id, to, kind, status, error } for the response.
    async send(kind, to, data) {
      const { subject, html, text } = renderEmail(kind, data);
      const message = await prisma.emailMessage.create({ data: { to, kind, subject, html, text } });
      const done = await deliver(message);
      return { id: done.id, to: done.to, kind: done.kind, status: done.status, error: done.error };
    },

    async list({ limit = 100 } = {}) {
      const rows = await prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
      return { items: rows.map(summary), configured: Boolean(sender) };
    },

    async retry(id) {
      const message = await prisma.emailMessage.findUnique({ where: { id } });
      if (!message) throw notFound("Email");
      return summary(await deliver(message));
    },
  };
}
