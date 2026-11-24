// Writes the n8n "Send email" workflow (live and staging copies). The app
// writes each email; this workflow only delivers it through Gmail (SMTP), so
// the Gmail app password stays in n8n.
// Usage (from the project folder): node n8n/make-email-workflow.mjs
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function workflow({ name, path: webhookPath, webhookId }) {
  return {
    name,
    nodes: [
      {
        id: "8f0c1a52-1d7e-4f55-9d1b-2b8a6c1e0a01",
        name: "Webhook",
        webhookId,
        type: "n8n-nodes-base.webhook",
        typeVersion: 2.1,
        position: [0, 0],
        parameters: {
          httpMethod: "POST",
          path: webhookPath,
          authentication: "headerAuth",
          responseMode: "responseNode",
          options: {},
        },
        // Same Header Auth credential as the generation workflow
        // (X-AQS-Request-Secret = N8N_REQUEST_SECRET).
        credentials: { httpHeaderAuth: { id: "PPTA7Tlvv48ZL9Pd", name: "Header Auth account" } },
      },
      {
        id: "8f0c1a52-1d7e-4f55-9d1b-2b8a6c1e0a02",
        name: "Send Email",
        type: "n8n-nodes-base.emailSend",
        typeVersion: 2.1,
        position: [260, 0],
        // Choose the "Gmail SMTP" credential on this node after importing.
        onError: "continueErrorOutput",
        parameters: {
          fromEmail: "={{ $json.body.from }}",
          toEmail: "={{ $json.body.to }}",
          subject: "={{ $json.body.subject }}",
          emailFormat: "both",
          text: "={{ $json.body.text }}",
          html: "={{ $json.body.html }}",
          options: { appendAttribution: false },
        },
      },
      {
        id: "8f0c1a52-1d7e-4f55-9d1b-2b8a6c1e0a03",
        name: "Sent",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.1,
        position: [540, -100],
        parameters: {
          respondWith: "json",
          responseBody: "={{ JSON.stringify({ ok: true, messageId: $json.messageId ?? null }) }}",
          options: { responseCode: 200 },
        },
      },
      {
        id: "8f0c1a52-1d7e-4f55-9d1b-2b8a6c1e0a04",
        name: "Not sent",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.1,
        position: [540, 100],
        parameters: {
          respondWith: "json",
          responseBody:
            "={{ JSON.stringify({ ok: false, error: ($json.error && ($json.error.message || $json.error.description || String($json.error))) || 'Sending failed' }) }}",
          options: { responseCode: 502 },
        },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: "Send Email", type: "main", index: 0 }]] },
      "Send Email": {
        main: [
          [{ node: "Sent", type: "main", index: 0 }],
          [{ node: "Not sent", type: "main", index: 0 }],
        ],
      },
    },
    settings: { executionOrder: "v1" },
  };
}

const outputs = [
  ["ai-qa-studio-email.workflow.json", { name: "AI QA Studio - Send email", path: "ai-qa-studio/email", webhookId: "3c4f2e1a-7b0d-4c3e-9a51-6f2d8e0b1a11" }],
  [
    path.join("staging", "ai-qa-studio-email.STAGING.workflow.json"),
    { name: "AI QA Studio - Send email (STAGING)", path: "ai-qa-studio-staging/email", webhookId: randomUUID() },
  ],
];

for (const [file, options] of outputs) {
  const target = path.join(here, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(workflow(options), null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), target)}`);
}
