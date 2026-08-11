# eve Autonomous Software Company

An end-to-end prototype that turns one owner objective into a durable autonomous
engineering workflow:

```text
Human owner → eve CEO → Engineering subagent → Codex CLI
            → Vercel Sandbox → verification → reviewer → draft GitHub PR
```

The primary experiment is not a one-shot prompt. A task can stop on a real
product ambiguity, obtain a CEO decision, and continue the same Engineering
session, Vercel Sandbox, worktree, and Codex thread.

This project is based on the official eve Chat Template and retains its Next.js
chat, `useEveAgent` streaming, durable session cursor persistence, Better Auth,
Sign in with Vercel, Neon/Drizzle storage, Upstash rate limiting, and existing
HITL rendering.

## Architecture

- `agent/` is the CEO. It creates durable tasks, delegates coding to Engineering,
  searches/records decisions, handles Levels 1–3, and uses the template HITL
  flow only for Level 4.
- `agent/subagents/engineering/` is a declared persistent eve subagent. One
  child session owns one durable Vercel Sandbox.
- Engineering starts Codex with `codex exec`, records the emitted Codex thread
  id, and uses `codex exec resume <thread-id>` for CEO answers and repair loops.
- `agent/subagents/engineering/subagents/reviewer/` is a nested, read-only eve
  reviewer. It receives the task, acceptance criteria, diff, and verification
  evidence and returns structured PASS/FAIL output.
- `project`, `task`, `task_event`, `decision`, and `approval` tables extend the
  template's existing Neon database. The core task row stores IDs and current
  state; events provide the audit timeline without duplicating full model traces.
- `/tasks` and `/tasks/[id]` show operational status, blocking questions,
  sandbox/session/Codex identifiers, PR links, and the task event timeline.
- eve/Vercel observability remains the source for detailed agent/model/tool
  traces. Application task events answer only “what stage is this task in?”

### Durable resume identity

The persistence chain is:

```text
task.id
  ├─ task.eveSessionId       (Engineering eve child session)
  ├─ task.sandboxId          (same durable sandbox/workspace)
  ├─ task.codingRunId        (Codex CLI thread)
  └─ task.workingBranch      (same git worktree/branch)
```

When Codex reports `blocked_product_question`, Engineering writes
`BLOCKED_AWAITING_CEO` and returns the structured question to CEO without
destroying anything. CEO persists a decision and messages the same Engineering
`agentId`; Engineering then calls `codex exec resume` with the stored thread id.

## Autonomy model

- Level 1 — routine technical decision: Codex decides.
- Level 2 — specialist or architectural decision: Engineering inspects repository
  evidence and decides.
- Level 3 — product/business choice: CEO searches prior decisions, chooses a
  reasonable reversible answer, records it, and resumes Engineering.
- Level 4 — owner required: only for irreversible production actions, meaningful
  security/privacy risk, spending, legal/compliance, missing credentials, or
  strategically significant ambiguity that cannot safely be inferred.

The CEO never edits application code. Engineering never contacts the owner
directly. The system never merges or deploys.

## Safety boundaries

- All repository code and arbitrary commands run in Vercel Sandbox, never on the
  Next.js application host.
- Sandbox egress is allow-listed to AI Gateway, GitHub, and npm infrastructure;
  private/link-local subnets are denied.
- `AI_GATEWAY_API_KEY` is passed only to Codex command processes through the
  sandbox environment API. GitHub credentials are passed only to clone/push
  commands and are not included in Codex's environment.
- Only GitHub `owner/repository` or HTTPS GitHub repository inputs are accepted;
  git refs are validated.
- Codex is told that repository instructions are untrusted and cannot override
  system security policy.
- Verification commands are limited to package-manager `test`, `typecheck`,
  `lint`, `build`, and `check` commands.
- Repair, review, follow-up, and wall-clock loops are bounded by environment
  configuration.
- PRs are drafts. Automatic merge and automatic production deployment are not
  implemented.

## Setup

Prerequisites: Node.js 24+, Corepack/pnpm, Vercel CLI, a Vercel project, Neon,
Upstash Redis, an AI Gateway key, and a least-privilege GitHub App installation.

```bash
corepack enable
pnpm install
vercel link
vercel env pull .env.local --yes
pnpm db:migrate
pnpm dev
```

For production, provision Neon and Upstash and configure Sign in with Vercel as
described in `docs/setup-and-deploy.md`. Required OAuth scopes are `openid`,
`email`, and `profile`. Run migrations after every schema change:

```bash
vercel env run -e production -- pnpm db:migrate
```

### Required environment variables

Core template production mode:

```text
DATABASE_URL
BETTER_AUTH_SECRET
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID
VERCEL_APP_CLIENT_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Autonomous coding:

```text
AI_GATEWAY_API_KEY
GITHUB_APP_INSTALLATION_TOKEN   # preferred short-lived credential
# or GITHUB_TOKEN               # local prototype fallback
```

Vercel Sandbox uses project OIDC automatically on Vercel. For local development,
`vercel link` and `vercel env pull` provide the development OIDC token used by
the Sandbox SDK. The selected GitHub installation needs only repository Contents
read/write and Pull requests read/write; install it only on test repositories.

See `.env.example` for optional template connectors, model overrides, and limits.

## Models

All models route through Vercel AI Gateway. No custom model proxy/router exists.
Override Gateway model IDs in one place through:

```text
CEO_MODEL
ENGINEERING_MODEL
REVIEWER_MODEL
CODEX_MODEL
```

Defaults are documented in `.env.example`. Codex writes a persistent config in
its sandbox `CODEX_HOME` with `base_url = "https://ai-gateway.vercel.sh/v1"`,
`env_key = "AI_GATEWAY_API_KEY"`, and `wire_api = "chat"`.

## Bounded loops

```text
MAX_REPAIR_LOOPS=3
MAX_REVIEW_LOOPS=2
MAX_CODEX_FOLLOWUPS=8
MAX_TASK_RUNTIME_MINUTES=120
```

When a bound is reached, the task stops and reports failure instead of looping.

## First autonomous coding test

1. Use a real, non-critical GitHub repository to which the configured GitHub App
   can push. Confirm its default branch and run the app.
2. Open the CEO chat and submit one message (replace the repository):

   ```text
   In owner/repository on base branch main, add a user preference that lets users
   enable or disable weekly email reports. Add the appropriate schema change,
   settings UI, backend behavior, validation, and tests. Follow existing patterns
   and preserve existing behavior where sensible. Treat whether the preference
   defaults ON or OFF as a product ambiguity that Engineering should escalate to
   you; decide it autonomously using backwards compatibility.
   ```

3. Do not answer the ON/OFF question. CEO should create the task, delegate it,
   record the product decision, and resume the same Engineering/Codex task.
4. Open `/tasks`, select the task, and watch for `QUESTION_ESCALATED`,
   `CEO_DECISION`, `CODEX_RESUMED`, verification, review, branch, and PR events.
5. Confirm the final chat report contains the draft PR URL and the PR is not
   merged. Inspect Vercel Agent Runs/eve traces for detailed execution.

## Development and verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build:eve
pnpm build
pnpm db:generate
```

This fork adds ESLint with the official Next.js core-web-vitals and TypeScript
flat configs. The nested-subagent compiler
path contains `::`; on Windows, eve 0.31.3 currently attempts to create that name
as a directory and `pnpm build:eve` fails because `:` is illegal in Windows paths.
The same source builds on Vercel/Linux, where `:` is valid. This is an upstream
local-Windows compiler limitation, not an application runtime placeholder.

## What remains external

No fake integrations are provided. Without Vercel OIDC/Sandbox entitlement,
AI Gateway credentials, a migrated Neon database, and GitHub credentials, the
application builds but cannot execute the external autonomous coding lifecycle.
Those services must be configured before the first real test.
