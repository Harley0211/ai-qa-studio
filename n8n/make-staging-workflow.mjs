// Writes a staging copy of the n8n workflow with its own name, webhook address
// and webhook id, so importing it never replaces or clashes with the live one.
// Usage (from the project folder): node n8n/make-staging-workflow.mjs
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(here, "ai-qa-studio-generation.workflow.json");
const output = path.join(here, "staging", "ai-qa-studio-generation.STAGING.workflow.json");

const workflow = JSON.parse(readFileSync(input, "utf8"));

workflow.name = `${workflow.name} (STAGING)`;
delete workflow.id;
delete workflow.versionId;

for (const node of workflow.nodes) {
  if (node.type === "n8n-nodes-base.webhook") {
    node.parameters.path = "ai-qa-studio-staging/generate";
    node.webhookId = randomUUID();
  }
}

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), output)}`);
console.log("Import it in n8n, set the Header Auth credential, then activate it.");
