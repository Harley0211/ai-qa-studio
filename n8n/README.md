# n8n workflow: AI QA Studio - Test Case Generation

`ai-qa-studio-generation.workflow.json` is the generation workflow the server calls.
It contains no secrets: credentials are referenced by name only.

## Set up on a new machine

1. **Ollama:** install it and pull the model the workflow uses:
   `ollama pull qwen3-vl:2b-instruct` (it must answer on `http://127.0.0.1:11434`).
2. **Import:** in n8n, *Workflows → Import from File* and choose the JSON file.
3. **Webhook credential:** open the **Webhook** node and create a *Header Auth*
   credential (here it was called "Header Auth account"):
   - Name (the header name): `X-AQS-Request-Secret`
   - Value: the same value as `N8N_REQUEST_SECRET` in `apps/server/.env`
4. **Activate** the workflow (toggle in the top bar). The production URL is then
   `http://localhost:5678/webhook/ai-qa-studio/generate`.
5. **Server `.env`** (`apps/server/.env`, not committed) needs at least:
   - `N8N_WEBHOOK_URL=http://localhost:5678/webhook/ai-qa-studio/generate`
   - `N8N_REQUEST_SECRET=` (32+ characters, same as step 3)
   - `EVIDENCE_SIGNING_SECRET=` (32+ characters)
   - `PUBLIC_BACKEND_URL=http://127.0.0.1:4000` (n8n uses it to download evidence
     and send results back)

## What the workflow does

Webhook → validate → download evidence (if any) → **List Scenarios** (Ollama) →
**Plan Scenarios** → Ollama (Overall or Per step prompt) → **Parse Generated
Test Cases** → POST results to the app's callback.

The number of test cases is not fixed; it follows the evidence:

- **List Scenarios** asks the model for a short list of the distinct scenarios
  the screenshots and request support (at most 40). A repeat penalty makes the
  small model stop once everything shown is covered instead of padding the list.
- **Plan Scenarios** drops reworded duplicates. If the request names a number
  ("5 test cases", "exactly 3 tests") that number is used instead. It then
  builds a JSON schema that requires exactly that many test cases and sizes the
  model's output budget (`num_predict`, `num_ctx`) to match, so the model can't
  loop or get cut off.
- The generation prompt writes one test case per planned scenario, in order.

The parser skips malformed cases, drops repeated titles, recovers the finished
cases when the model's answer is cut off, and enforces the app's length limits.
If a step fails, **Report Failure** tells the app (`/failure`) so the run is
marked failed instead of waiting.

## Updating this file

After changing the workflow in n8n, export it again (*⋯ → Download*) and
replace the JSON here, or ask for it to be re-exported through the n8n API.
