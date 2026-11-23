# AI QA Studio

AI QA Studio is a QA tool for a small team. It turns screenshots and
requirements documents (PRDs) into test cases with a local AI model, lets you
review and refine them before they are saved, and then manage, run and export
them per project. Team members sign in; everyone works on all projects.

**Status (23 Nov 2026):** 411 automated tests pass (234 server, 177 web) and the
production build succeeds.

---

## 1. Features

### Projects
- Each project keeps its own application URLs, evidence images, documents and
  test cases.
- The **Projects** page shows totals (projects, test cases, URLs) and, per
  project, its URL, test case and image counts plus an **Image â†’ test cases**
  shortcut.
- A project's **Overview** has three *Start generating* cards (from images, from
  a PRD, or write manually) and an execution summary.

### Generate test cases from screenshots
**Tools â†’ From image evidence** (or *Open tool* on the Overview):

1. Upload PNG, JPG or WEBP screenshots (up to 5 MB each).
2. Tick the images to generate from (up to 20). Each image is marked **New** or
   **Used Â· date**. New images are selected for you and used ones are not, so
   in a project that already has evidence and test cases you just upload the
   new screens and generate: nothing has to be cleared first. *Select new
   only*, *Select all* and *Clear selection* change the selection quickly.
3. Choose the result format: **Overall expected result** (one per test case) or
   **Expected result per step**.
4. Optionally choose a focus: Functional, Negative, Boundary, Validation,
   UI / layout.
5. Generate. The local model takes a few minutes; the results then wait for
   review.

An image counts as used once a generation that included it has finished
successfully (a failed run leaves it new). **Clear used images** deletes every
used image in one step, after confirming; new images and all test cases are
kept, and images a running generation still needs are skipped.

**No repeats of the library:** the titles of the project's existing test cases
are sent with every generation. The model is told not to list them again, and
the workflow drops any scenario that still matches one. If everything in the
selected images is already covered, the run fails with a message saying so.

### Generate test cases from a PRD or document
**Tools â†’ From PRD / document**, or the project's **Documents** tab:

1. Add a document: paste text, or upload a **.txt, .md or .pdf** file (up to
   10 MB; PDFs need selectable text).
2. The document is split into sections at its headings: Markdown headings
   (`## 3.2 Purchase flow`) or numbered headings (`3.2 Purchase flow`).
   Numbered steps such as `1. Click Login` stay inside their section.
3. Select up to 10 sections, a focus and a result format, then generate.
4. Each section is generated separately, so every test case is linked to the
   section it came from (shown as *From Add-ons PRD â€º 3.2 Purchase flow*).

### Review before saving
Generated test cases are **drafts**. Nothing reaches the library until it is
reviewed:

- The tool pages list every batch waiting for review. All cases start selected;
  untick the ones you don't want and click **Add N to library**, or **Discard
  all**.
- A draft whose title matches a test case already in the library is labelled
  **Possible duplicate of TC-0012** and starts unselected. Tick it to keep it
  anyway.
- Test case IDs (`TC-0001`, â€¦) are assigned only when cases are accepted, so
  discarded drafts leave no gaps.
- The Evidence and Test cases tabs show a banner while batches are waiting.

### Refine with AI (chat)
Each batch waiting for review has a **Refine with AI** box. Describe a change in
plain words ("add 2 negative test cases for the phone number field", "remove
the country dropdown cases", "make the steps of test case 1 more detailed") and
the batch's drafts are updated in place:

- The model first works out *what* to change (add, rewrite or remove) and
  *which* cases; removals are applied by code, and the model only writes the
  rewritten or new cases. Cases the request doesn't mention stay exactly as
  they were.
- Each reply says what changed ("Added 2 test cases", "Removed #7") plus the
  model's own short summary. Earlier requests are sent along as context.
- One change at a time per batch; adding to the library is paused while a
  change runs. Typical changes take 5â€“40 seconds on the local model.
- Refining uses the cases' text only, not the original screenshots.

### Test case library
The project's **Test cases** tab:

- Each case shows its status, a **Per step / Overall** format chip and, for
  generated cases, the document section it came from.
- *View test details* shows the precondition and either the overall steps and
  expected result, or a **Step / Action / Expected result** table for per-step
  cases. Steps without an expected result are flagged.
- Create, edit and delete cases; set the execution status (Not Run, Passed,
  Failed, Blocked) one by one or in bulk; search and filter by status.
- **Export Excel** exports all or the selected cases.
- A project-wide summary and progress bar ignore the current search and filter
  (see [Execution progress](#6-execution-progress)).

### Bug report generator
**QA tools → Bug report** writes a ready-to-paste bug ticket with the local AI.

1. Describe what happened. Steps, what you expected and the environment
   (page URL, browser, device, build) are optional; the browser and OS are
   filled in for you.
2. Attach evidence (optional): **screenshots** (PNG, JPG, WEBP up to 5 MB),
   **screen recordings** (MP4, WebM… up to 95 MB) and **HAR files** (up to
   200 MB). A HAR's failed requests show right away.
3. **Generate bug report.** It runs **in the background**: the form clears for
   the next report, and you can go to any other page. A small activity card
   (bottom left) shows the progress on every page and says when the report is
   ready. The AI writes a title (`[Area] What goes wrong`), summary, steps to
   reproduce, expected and actual result, **root cause analysis** and severity
   (with the matching Jira priority). Typically under a minute.
4. Open the report from **Saved bug reports** (or the activity card). Copy the
   **Jira** description (Jira Cloud Markdown, or wiki markup for Jira
   Server / Data Center) and the **Slack** message, which starts with
   "Hi team,". Change the title or severity, or edit the texts, and **Save
   changes**.
5. **Download ZIP**: Jira texts (Markdown and wiki), the Slack message, the
   title, `report.json` and every file in the report's folder.

**Saved bug reports (folders).** Every report is saved on the server from the
moment it starts, in its own folder: screenshots, the frames taken from each
video, the videos, and for every HAR a **redacted copy** plus a readable
summary. The list shows each folder's status, severity, file count, size, date
and who made it; everyone in the team can open them. Only the person who made
a report (or an admin) can edit or **delete** it, and deleting it removes its
folder from storage too.

The AI runs on the server, so a report keeps generating even if the browser
is closed (preparing video frames and uploading happen in the browser first,
and keep going while you move around the app). If the server restarts while a
report is generating, it is marked *interrupted*: click **Retry**, which uses
the same saved images. One report generates at a time per person.

How the evidence is used:
- **HAR files are read in the browser**; only a redacted copy is saved. Their
  exact status codes and error messages go to the AI as text, so the root
  cause is based on the real failed requests, and the network error table in
  the Jira and Slack texts comes straight from the file (not from the AI).
- **Videos**: a few frames spread through the recording are sent to the AI as
  images (the model reads images, not video); the video itself is saved in
  the folder.
- The AI sees at most 12 images: up to 8 screenshots when there are videos,
  and up to 4 frames per video.
- The redacted HAR has cookies, `Authorization`/token headers, and
  password-, token- and card-like fields blanked out.

### HAR reader
**QA tools → HAR reader** opens a `.har` file (DevTools → Network → *Save all
as HAR*) in the browser:

- Totals (requests, failed, duration, data transferred) and the status code
  mix (2xx, 3xx, 4xx, 5xx, no response).
- **What happened**: a plain-language explanation for testers new to network
  logs, whether or not anything failed:
  - a verdict ("3 requests failed. The main problem: POST /api/orders → 500
    Internal Server Error." or "All 132 requests succeeded…");
  - each problem (repeats grouped, most important first): what happened, what
    the status code means, the likely cause, **who should look** (backend,
    frontend, sign-in/permissions, network, or a third party) and what to
    check next. Ad-blocked, cancelled and third-party requests are marked
    *probably not a bug*;
  - what else the file shows (redirects, slow calls, large downloads) and next
    steps (with no failures: check the browser console, the recording covers
    the moment of the bug);
  - **How to explain this to your lead**: a ready paragraph with a Copy
    button.
  It is rule-based (no AI), so it is instant and only states what is in the
  file. It is also added to the downloaded summary and to the HAR summary in
  bug report folders.
- **Failed requests**, most serious first (5xx, then no response, then 4xx),
  with the error message the server sent back.
- Every request in a table: filter by status or type, search the URL, with a
  time bar. Click one for its headers, payload, response body and timings;
  secrets are hidden unless you untick **Hide secrets**.
- Download a **summary** (.md) or a **redacted HAR**, or **Create bug report**
  to open the bug report tool with the file attached.
- **HAR library:** every HAR opened here is saved (as a redacted copy, up to
  95 MB) in its own folder and listed with its request and failure counts and
  first error. Open one to read it again; the person who saved it (or an
  admin) can delete it, which removes its folder from storage.

### Where saved files are kept
Bug report and HAR folders are stored on the server's disk, in
`apps/server/storage/bug-reports/<id>/` and `apps/server/storage/har-files/<id>/`
(ignored by git). Back up that folder together with the database. Files are
kept on this computer rather than in a cloud drive because HARs and
recordings can hold session data, and it needs no extra accounts or keys; all
file access goes through `src/lib/fileStore.js`, so a cloud backend (for
example Google Drive) can be added there later. A single saved file is
limited to 95 MB (`MAX_SAVED_FILE_MB`) because the public Cloudflare link
refuses uploads over 100 MB.

### Sign-in and users
- **First run:** the first person to open the app creates the **admin**
  account. After that, sign-up is closed.
- **Users page (admins):** add people (name, email, starting password, role),
  rename them, change their role, reset a password (signs them out
  everywhere) or remove them. The app always keeps at least one admin, and you
  can't remove yourself.
- **Everyone:** can open and work in any project (one project at a time),
  change their own password (signs out their other browsers) and sign out
  from the sidebar.
- **Admins** also create, rename and delete projects.
- Forgotten password: an admin resets it on the Users page.

### Other
- **Dark mode:** toggle in the sidebar (or the top bar on small screens). The
  choice is remembered; until then the app follows the operating system.
- **Seasonal live look:** the page background slowly moves (drifting color
  glows plus petals in spring, glowing motes in summer, falling leaves in
  autumn, snow in winter) and the sidebar has a glowing, animated look. The
  season follows the date (Mar–May spring, Jun–Aug summer, Sep–Nov autumn,
  Dec–Feb winter); the **Season theme** picker at the bottom of the sidebar
  can choose another one. The ✨ button turns animations off; they start off
  for people whose system asks for reduced motion, and pause while the tab is
  hidden.
- **Clock:** a small live clock (time, seconds, date) at the top of the
  sidebar, and a compact one in the top bar on small screens.
- **Failed runs never hang:** if n8n fails it reports the error and the run is
  marked failed within seconds. If n8n never answers, the run is marked failed
  after 30 minutes.

## 2. Architecture

| Part | Technology | Location |
|---|---|---|
| Web app | React 18, Vite, Tailwind CSS 4, TanStack Query | `apps/web` (port 5173) |
| API server | Express, Prisma (SQLite), zod, multer, unpdf | `apps/server` (port 4000) |
| Generation workflow | n8n | `n8n/ai-qa-studio-generation.workflow.json` (port 5678) |
| AI model | Ollama, `qwen3-vl:2b-instruct` | port 11434 |

How a generation run works:

```text
Web app â”€â”€POST /generationsâ”€â”€â–¶ Server â”€â”€webhookâ”€â”€â–¶ n8n â”€â”€â–¶ Ollama
                                  â–²                  â”‚
                                  â”‚  POST /callback (test cases)  â”€â”
                                  â””â”€â”€POST /failure  (error)    â—€â”€â”€â”˜
```

- The server creates a run (`PENDING`) with a one-time callback token and calls
  the n8n webhook. Evidence images are passed as short-lived signed URLs.
- n8n asks Ollama for test cases, cleans up the answer (see
  [n8n/README.md](n8n/README.md)) and posts the cases back. The run becomes
  `SUCCEEDED` and its cases are stored as drafts for review.
- If a step fails, n8n posts to `/failure` and the run becomes `FAILED` with the
  reason. Runs whose token expires (30 minutes) are closed as failed by the
  server.

## 3. Setup

### Prerequisites
- Node.js 20.12 or later
- [n8n](https://n8n.io) running locally
- [Ollama](https://ollama.com) with the model: `ollama pull qwen3-vl:2b-instruct`

### Steps

1. **Install dependencies**

   ```cmd
   npm install
   ```

2. **Configure the server.** Copy `apps/server/.env.example` to
   `apps/server/.env` and fill in the two secrets. Generate each one with:

   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Create the database** (SQLite file `apps/server/prisma/dev.db`):

   ```cmd
   npm run db:migrate
   ```

4. **Set up n8n:** import the workflow, create its Header Auth credential with
   the same value as `N8N_REQUEST_SECRET`, and activate it. Step by step:
   [n8n/README.md](n8n/README.md).

5. **Start the app** (server and web together):

   ```cmd
   npm run dev
   ```

   Open http://127.0.0.1:5173. The first time, create the admin account.

**Windows note:** stop the dev server before `npm install` or
`npm run db:generate`. The running server locks Prisma's engine file, and
regeneration fails with `EPERM` otherwise.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API server and the web app |
| `npm test` | Runs the server tests, then the web tests |
| `npm run test -w @aqs/server` / `-w @aqs/web` | Runs one workspace's tests |
| `npm run build` | Production build of the web app |
| `npm run db:migrate` | Applies database migrations (development) |
| `npm run db:generate` | Regenerates the Prisma client |
| `npm run db:studio` | Opens Prisma Studio to browse the database |

### Going live (public link from this computer)

The app can be shared at a public https address while it runs on this
computer, using a free Cloudflare quick tunnel. The AI (Ollama) and n8n stay
local; only the app's port is shared.

1. **Create the admin account first** (open the app locally once). The first
   person to open a fresh install becomes admin.
2. In `apps/server/.env`:
   ```ini
   WEB_DIST_DIR=../web/dist
   PUBLIC_HOSTS=.trycloudflare.com
   ```
   then restart the server. It now also serves the built web app at
   http://127.0.0.1:4000.
3. Build the web app and start the tunnel (or run the VS Code task
   **Public link (tunnel)**, which does both):
   ```cmd
   npm run build
   "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:4000
   ```
   It prints the public link, `https://<random-words>.trycloudflare.com`.

   If cloudflared is installed elsewhere (see *No administrator rights?*
   below), use that path instead. The VS Code task finds it by itself.
4. Add your team on the **Users** page and send them the link.

Notes:
- The link only works while this computer, the server, n8n and Ollama are
  running, and it **changes every time the tunnel restarts**. A fixed address
  needs your own domain on a free Cloudflare account (named tunnel).
- Over the tunnel the session cookie is `Secure`, HSTS is on, and the page's
  Content Security Policy forbids inline scripts.
- Failed sign-ins are limited per visitor and email, so someone guessing from
  elsewhere can't lock you out.
- Quick tunnels are meant for testing and small use; Cloudflare gives no uptime
  guarantee for them.

### Staging (try changes without touching the live app)

Staging is a second copy of the code (a git worktree on the `staging` branch)
with its own database, screenshots, port and n8n webhook. It shares Ollama and
the n8n program with live.

| | Live | Staging |
|---|---|---|
| Folder / branch | `ai-qa-studio` / `main` | `ai-qa-studio-staging` / `staging` |
| Address | http://127.0.0.1:4000 (+ tunnel) | http://127.0.0.1:4100 (local only) |
| Database | `prisma/dev.db` | `prisma/staging.db` |
| n8n webhook | `ai-qa-studio/generate` | `ai-qa-studio-staging/generate` |

**Set up** (once, from the live folder):

```powershell
git worktree add ..\ai-qa-studio-staging -b staging
copy apps\server\prisma\dev.db ..\ai-qa-studio-staging\apps\server\prisma\staging.db
cd ..\ai-qa-studio-staging
npm install
```

Create `apps\server\.env` there from live's, changing `PORT=4100`,
`DATABASE_URL="file:./staging.db"`, `PUBLIC_BACKEND_URL=http://127.0.0.1:4100`,
`CORS_ORIGIN` (add `http://127.0.0.1:4100`), `PUBLIC_HOSTS=` (empty: no
tunnel) and `N8N_WEBHOOK_URL=http://localhost:5678/webhook/ai-qa-studio-staging/generate`.

**n8n:** import a copy of the workflow with its own name, webhook address and
webhook id, so it never replaces the live one. Create it with
`node n8n/make-staging-workflow.mjs` (writes
`n8n/staging/ai-qa-studio-generation.STAGING.workflow.json`), then import that
file in n8n, choose the same Header Auth credential and activate it.

**Run:** `npm run db:migrate`, `npm run build`, `npm run dev:server`, then open
http://127.0.0.1:4100.

**Release to live** after testing on staging:

1. Merge: in the live folder, `git merge staging`, then `git push`.
2. Stop the live server, then `npm install`, `npm run db:generate`,
   `npm run db:migrate`, `npm run build`, and start it again. The tunnel can
   keep running.
3. If `n8n/ai-qa-studio-generation.workflow.json` changed, import it in n8n
   over the live workflow (or delete the old one first), set its credential
   and activate it.

### Run it live on another computer (step by step, e.g. the office PC)

Everything below is typed in **PowerShell** on the other computer unless it
says otherwise. Steps marked *(first time only)* can be skipped on a computer
that already ran the app before.

> **Company computer?** Check with IT before step 9. Some company networks or
> security tools block tunnels like Cloudflare's, and sharing a company machine
> on the internet may need approval. Only real test data should go into a
> publicly reachable app.

**1. Install the tools** *(first time only)*

- **Node.js 20.12 or newer** (LTS): `winget install OpenJS.NodeJS.LTS`, then
  close and reopen PowerShell. Check with `node -v`.
- **Git**: `winget install Git.Git`.
- **Ollama** (the AI): `winget install Ollama.Ollama`.
- **n8n**: `npm install -g n8n`.
- **cloudflared** (the tunnel): `winget install Cloudflare.cloudflared`.
  Windows asks for administrator permission; click **Yes**.

  **No administrator rights?** Use the portable cloudflared instead: download
  `cloudflared-windows-amd64.exe` from
  https://github.com/cloudflare/cloudflared/releases/latest, rename it to
  `cloudflared.exe` and put it in
  `%USERPROFILE%\Documents\QA-Portable\tools\cloudflared\`. It needs no
  install. The VS Code task **Public link (tunnel)** looks for cloudflared in
  `C:\Program Files (x86)\cloudflared`, `C:\Program Files\cloudflared`, that
  portable folder and then the PATH, in that order.

**2. Get the code**

- First time:
  ```powershell
  cd $HOME\Documents
  git clone https://github.com/Harley0211/ai-qa-studio.git
  cd ai-qa-studio
  ```
- Already have it: open the folder, then
  ```powershell
  git switch main
  git pull
  ```

**3. Install packages and update the database**

Stop the app first if it is running (the server locks Prisma's files).

```powershell
npm install
npm run db:generate
npm run db:migrate
```

`db:migrate` adds anything new to the database (for example the users and AI
chat tables) and keeps your existing projects and test cases.

**4. Server settings** (`apps\server\.env`)

- First time: `copy apps\server\.env.example apps\server\.env`
- Make two random secrets (run the command twice, one per secret):
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Open `apps\server\.env` and make sure these are set (keep any lines that are
  already there):
  ```ini
  N8N_WEBHOOK_URL=http://localhost:5678/webhook/ai-qa-studio/generate
  N8N_REQUEST_SECRET=<first secret>
  EVIDENCE_SIGNING_SECRET=<second secret>
  PUBLIC_BACKEND_URL=http://127.0.0.1:4000
  WEB_DIST_DIR=../web/dist
  PUBLIC_HOSTS=.trycloudflare.com
  ```
  Never commit this file; it is ignored by git on purpose.

**5. The AI model** *(first time only)*

```powershell
ollama pull qwen3-vl:2b-instruct
```

About 2 GB. Ollama then runs in the background (tray icon) and answers on
`http://127.0.0.1:11434`.

**6. n8n workflow** (first time, and again whenever `n8n/ai-qa-studio-generation.workflow.json` changes)

1. Start n8n: `n8n start`, then open http://localhost:5678 (create the n8n
   owner account the first time).
2. **Workflows â†’ Import from File** â†’ choose
   `n8n\ai-qa-studio-generation.workflow.json`. If an older "AI QA Studio"
   workflow exists, delete or deactivate it first, because both use the same
   webhook address.
3. Open the **Webhook** node â†’ *Credential* â†’ create **Header Auth**:
   - Name: `X-AQS-Request-Secret`
   - Value: the same value as `N8N_REQUEST_SECRET` in step 4
4. Save, then **Activate/Publish** the workflow (toggle in the top bar).

More detail: [n8n/README.md](n8n/README.md).

**7. Build the web app and start the server**

Keep n8n running (step 6). In a new PowerShell window, in the project folder:

```powershell
npm run build
npm run dev:server
```

Open **http://127.0.0.1:4000**. It should show the AI QA Studio page.
(Alternatively open the folder in VS Code and run the tasks **n8n** and
**Server** from *Terminal â†’ Run Task*.)

**8. Create the admin account BEFORE going public**

On a computer that has never been used with sign-in, the page asks you to
**Create the admin account**. Do it now, locally. The first person to open a
fresh install becomes admin, so this must not be left for a stranger.
Then use **Users** (sidebar â†’ Admin) to add your teammates.

**9. Start the public link**

In another PowerShell window (or VS Code task **Public link (tunnel)**):

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:4000
```

With the portable cloudflared (step 1), run this instead:

```powershell
& "$HOME\Documents\QA-Portable\tools\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:4000
```

After a few seconds it prints a box with an address like
`https://some-random-words.trycloudflare.com`. That is the live link: open it,
sign in, and send it to your team.

**10. Check it works**

- The live link shows the sign-in page, and your account can sign in.
- In a project, generate test cases from a screenshot or document: the run
  should finish and show cases to review (needs Ollama and n8n running).

**Every day after that**

1. Start Ollama (usually already running), then `n8n start`.
2. `npm run dev:server` (after `git pull`, run steps 3 and 7 again first).
3. Start the tunnel (step 9) and share the **new** link (it changes each time).

To stop being public, close the tunnel window (Ctrl+C). The app keeps working
locally.

**If something goes wrong**

| Problem | Fix |
|---|---|
| `EPERM` during `npm install` / `db:generate` | Stop the server first, then retry. |
| Live link says "Requests must use a localhost address" | `PUBLIC_HOSTS=.trycloudflare.com` is missing in `.env`, or the server wasn't restarted. |
| Live link shows "Cannot GET /" | `WEB_DIST_DIR=../web/dist` missing, or `npm run build` not run. |
| Generation fails with "n8n integration is not configured" | `N8N_WEBHOOK_URL` / `N8N_REQUEST_SECRET` missing in `.env`. |
| Generation fails with 401 / 403 from n8n | The Header Auth value in n8n differs from `N8N_REQUEST_SECRET`. |
| Generation fails mentioning Ollama | Ollama not running, or the model not pulled (step 5). |
| "Too many failed sign-in attempts" | Wait 15 minutes, or ask an admin to reset your password. |
| Forgot the only admin password | Locally run `npx prisma studio` in `apps\server`, delete the `User` rows, and create the admin again (step 8). |

## 4. Limits

| What | Limit |
|---|---|
| Screenshot upload | 5 MB per image (`MAX_UPLOAD_MB`); up to 20 selected images per run |
| Library titles sent to n8n | Newest 300 (the model sees the newest 60; the workflow checks all 300) |
| Document upload | 10 MB; up to 200,000 characters of text |
| Pasted document | 60,000 characters |
| Sections per generation | 10 (each section is its own run) |
| Section text sent to the model | First 12,000 characters (longer sections are flagged) |
| Test cases per run | 100 |
| Waiting for n8n | 30 minutes, then the run is marked failed |

## 5. API overview

Sign-in (`/api/auth`) and users (`/api/users`, admins only):

| Method and path | Purpose |
|---|---|
| `GET /api/auth/status` | `{ setupRequired, user }` (no sign-in needed) |
| `POST /api/auth/setup` | First run only: create the first admin and sign in |
| `POST /api/auth/login`, `POST /api/auth/logout` | Sign in / out (session cookie) |
| `POST /api/auth/password` | Change your own password |
| `GET`/`POST /api/users`, `PATCH`/`DELETE /api/users/:id` | Manage users (admin) |

Everything below needs a signed-in user, except n8n's callbacks and signed
screenshot downloads, which use their own one-time tokens. All routes are under
`/api/projects/:projectId`.

| Method and path | Purpose |
|---|---|
| `GET /test-cases`, `POST /test-cases`, `PATCH`/`DELETE /test-cases/:id` | Test case library |
| `PATCH /test-cases/:id/status`, `PATCH /test-cases/bulk/status`, `DELETE /test-cases/bulk` | Execution status and bulk actions |
| `GET`/`POST /evidence`, `DELETE /evidence/:id` | Screenshots (each with `lastUsedAt`, null while new) |
| `POST /evidence/clear-used` | Delete every used screenshot (`{ deletedCount }`) |
| `GET`/`POST /documents`, `POST /documents/upload`, `GET`/`DELETE /documents/:id` | Documents (paste or upload) |
| `POST /documents/:id/generations` | Generate from selected sections |
| `POST /generations` | Generate from screenshots |
| `GET /generations?review=pending` | Batches waiting for review |
| `GET /generations/:runId` | Run status, drafts (each with `duplicateOf`) and source |
| `POST /generations/:runId/accept`, `POST /generations/:runId/discard` | Review a batch |
| `POST /generations/:runId/refine` | AI chat: ask for a change to a batch (`{ instruction }`) |
| `GET /generations/:runId/refinements` | AI chat history of a batch, with each reply |
| `POST /generations/:runId/callback`, `POST /generations/:runId/failure` | Used by n8n (one-time Bearer token) |

Bug reports and the HAR library belong to a project and live under
`/api/projects/:projectId` (the paths below are relative to it; a report or
HAR from another project answers 404). Changing or deleting needs the creator
or an admin. `POST`/`PATCH`/`DELETE /api/projects[/:id]` are admin-only.

| Method and path | Purpose |
|---|---|
| `POST /bug-reports` | Start one. Multipart: `details` (JSON: description, steps, expected, environment, `harFacts`, `imageNotes`, `imageKinds`, `attachments`, `harErrors`) and up to 12 `images` for the AI. Returns `202 { id }` |
| `GET /bug-reports`, `GET /bug-reports/:id` | List (newest first), one report with its `report`, `texts` and `files` |
| `POST /bug-reports/:id/files` | Add a file to its folder (`kind`: image, video, har, har-summary; `file`) |
| `GET /bug-reports/:id/files/:fileId` | Download a file (`?download=1` as an attachment) |
| `PATCH /bug-reports/:id` | Save `title`, `severity`, edited `texts` |
| `POST /bug-reports/:id/retry` | Run the AI again after a failure |
| `DELETE /bug-reports/:id` | Delete the report and its folder |
| `GET`/`POST /har-files`, `GET`/`DELETE /har-files/:id`, `GET /har-files/:id/file` | HAR library: list, save (`file` + `summary`), read, delete with its folder, download |

The server calls Ollama directly for bug reports (`OLLAMA_URL`, default
`http://127.0.0.1:11434`; `OLLAMA_MODEL`, default `qwen3-vl:2b-instruct`).

## 6. Execution progress

A test case counts as executed when its status is Passed, Failed or Blocked.

```text
Completed    = Passed + Failed + Blocked
Progress (%) = round(Completed / Total * 100)      (0% when there are no cases)
```

Example: 10 cases with 4 Passed, 1 Failed, 1 Blocked and 4 Not Run gives
6 completed and 60% progress. The summary always uses the whole project, not
the filtered list.

## 7. Changelog

### UI/UX plan, Nov 2026
- **Per-step expected results:** format chip on every test case; per-step cases
  show a Step / Action / Expected result table and flag missing results;
  per-step cases can be edited without an overall expected result.
- **Dark mode** toggle.
- **Phase 1 (navigation and tools):** sidebar *Tools* section; Image â†’ Test cases
  page with format cards and focus options; Projects page counts and shortcuts;
  Overview *Start generating* cards and execution summary.
- **Phase 2 (review before saving):** generated cases are drafts until accepted.
- **Phase 3 (documents and PRDs):** Documents tab, PRD â†’ Test cases tool, section
  splitting, PDF upload, links from test cases back to their section.
- **Reliability:** n8n reports failures to the app; expired runs are closed; the
  n8n parser skips malformed cases, drops repeated titles and recovers results
  from cut-off answers.
- **Fixes:** status updates now return per-step results as a list; a corrupted
  row no longer breaks the test case list; duplicated bulk-status route and
  service code removed; broken dash character in the delete dialog; neutral
  "file too large" message.
- **Database migrations:** `add_generation_drafts`, `add_documents`.
- **Phase 4 (AI chat):** *Refine with AI* on every review batch; n8n REFINE
  branch (plan â†’ targeted rewrite â†’ apply); migration `add_refinements`.
- **Evidence-sized generation:** the number of generated cases follows the
  evidence (scenario list first, then exactly that many cases) instead of a
  fixed ~11.
- **Phase 5 (sign-in and users):** first-run admin setup, sign-in/out,
  admin Users page, change password; every API route needs a sign-in;
  migration `add_users`.
- **Generating again in a busy project** (no more clearing evidence and test
  cases first): pick which images to use, with new ones pre-selected and used
  ones marked; existing library titles are sent to n8n and repeats are
  dropped; drafts that match a library case are flagged and start
  unselected; *Clear used images* in one step. Migration
  `track_evidence_use` (marks images used by earlier successful image runs);
  n8n workflow updated (import it again).

### Earlier
- Test case management: library, details, create/edit, execution status,
  search and filter, project-wide execution summary.
- Projects, application URLs, evidence upload, n8n generation, Excel export.

## 8. Tests

| Suite | Files | Tests |
|---|---:|---:|
| Server (`apps/server/tests`) | 16 | 234 |
| Web (`apps/web/src/**/*.test.*`) | 18 | 177 |

Server tests run against a separate SQLite database (`test.db`) that is rebuilt
on every run; n8n is mocked. Web tests mock the API with `mockApi` from
`apps/web/src/test/utils.jsx`.

## 9. Known limitations and next steps

- **Documents:** scanned PDFs (no selectable text) and Word files are not
  supported. PDFs whose headings are only bold text, without numbers, become a
  single section.
- **Model quality:** the small local model sometimes writes weak or
  contradictory cases (for example a "phone number is required" case for an
  optional field). Exact repeats are removed; review every batch before adding
  it, and use *Refine with AI* to fix it.
- **Per-step results** can't be edited in the test case form yet.
- **Sign-in:** no "forgot password" email (an admin resets it) and no
  per-project permissions (everyone signed in sees every project).
- **Not built yet:** recent activity on
  the Overview.
- **Low-memory machines:** with Ollama loaded, the web test suite can run out of
  memory on 8 GB; run it with `npx vitest run --maxWorkers=2` in `apps/web`.
- **n8n** shows runs whose failure was reported to the app as successful
  executions in its own list; the app shows the real outcome.
- **Dependencies:** `npm audit` reports issues in existing packages (vitest,
  xlsx, prisma, zod, react-router); several fixes are breaking upgrades.

## 10. Security

- The server only listens on `127.0.0.1` and refuses to start otherwise.
- **Sign-in:** passwords are hashed with scrypt (Node's built-in crypto). A
  session is a random token in an `HttpOnly`, `SameSite=Strict` cookie
  (`Secure` when `NODE_ENV=production`); only its SHA-256 hash is stored.
  Sessions last 14 days. After 10 failed sign-ins for an email, sign-in for it
  is refused for 15 minutes.
- Requests that change data and carry an `Origin` header must come from an
  origin in `CORS_ORIGIN`, so other websites can't act with your session.
- n8n listens on all network interfaces by default. To keep it local, set
  `N8N_LISTEN_ADDRESS=127.0.0.1` in n8n's environment.
- Secrets live only in `apps/server/.env` (git-ignored) and in the n8n
  credential. If a secret is ever exposed, generate a new one and update both.
