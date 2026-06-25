# Executor on Cloudflare

A private agent gateway on **your own** Cloudflare account — that can rewrite and
redeploy itself, with an approval gate as the seatbelt.

It deploys [Executor](https://github.com/RhysSullivan/executor) (an open-source
integration layer for AI agents) in one command, private behind Cloudflare
Access, using [Alchemy](https://github.com/alchemy-run/alchemy-effect) to declare
the whole resource graph. Then it does the thing most "deploy this" examples
won't: it gives an agent a tool — through the public endpoint — that edits this
repo and redeploys the gateway, and makes every such call **stop for your yes**.

- **One command** provisions and deploys everything, private by default.
- **Headless-ready** — a service token lets agents/CLIs reach `/mcp`, no browser.
- **Self-modifying, gated** — `self_edit` changes the running system and pauses
  for approval on every call. The seatbelt is the feature.

## The autonomy ladder

This gateway can change itself. You decide how much of the loop to close — and
you climb by *adding control*, not removing capability:

1. **Invoked** — you call `self_edit`, you read the result.
2. **Gated** — an agent proposes the change through the public endpoint; it
   pauses for your approval. **This repo ships rungs 1–2.**
3. **Verified** — a proof step runs after each change, so it can't redeploy a lie.
4. **Looped** — it runs on a schedule, healing and extending itself.

The approval gate and repo confinement are the seatbelt that lets you take your
hands off the wheel one finger at a time. Full detail: [`docs/self-edit.md`](docs/self-edit.md).

## What it creates

All resources live in **your** account; nothing is hosted by anyone else.

| Resource | Purpose |
|---|---|
| Worker + web assets | Executor console, API, and `/mcp` endpoint |
| D1 database | application data |
| R2 bucket | specs and plugin blobs |
| Durable Object | MCP sessions |
| Encryption secret | at-rest key (generated, stored as a Worker secret) |
| Custom hostname | stable origin you own |
| Access application + email policy | browser sign-in |
| Access service token + policy | headless agents/CLIs |

`workers.dev` and preview URLs are disabled.

## Architecture

Two planes, kept apart on purpose — see [`docs/architecture.md`](docs/architecture.md):

```text
agents ──▶ <your-host>/mcp ──▶ catalog tools   (sandboxed; cannot deploy)
                                 self_edit       (gated; rewrites + redeploys)
operator ▶ self-edit (local) ▶ edit repo + redeploy
```

Most catalog tools run sandboxed and can only call what they're connected to.
`self_edit` is the deliberate exception: exposed with a destructive hint so
Executor halts for your approval before it ever runs.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Cloudflare account with Workers, D1, R2, Durable Objects, and Zero Trust (Access)
- A hostname in a zone on that account (e.g. `executor.example.com`)
- An existing Zero Trust team domain (e.g. `your-team.cloudflareaccess.com`)

## Setup (about 5 minutes)

```sh
git clone https://github.com/acoyfellow/executor-cloudflare
cd executor-cloudflare
bun install
cp .env.example .env
```

Edit `.env`:

```dotenv
EXECUTOR_HOSTNAME=executor.example.com
EXECUTOR_ALLOWED_EMAIL=you@example.com
ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
```

Authenticate Alchemy with Cloudflare (browser OAuth), then deploy:

```sh
bunx alchemy login
bun run deploy
```

`deploy` checks out the pinned Executor commit under `vendor/`, builds it, and
applies the Alchemy stack. First run prints your URLs:

```text
Done: 8 succeeded
{ url: "https://executor.example.com", mcpUrl: "https://executor.example.com/mcp", ... }
```

Re-running `deploy` is a no-op for data resources (only the Worker updates).

## Verify

```sh
bun run verify
```

```text
Anonymous request blocked by Cloudflare Access (302).
Open https://executor.example.com in a browser to verify the signed-in experience.
MCP endpoint: https://executor.example.com/mcp
```

Sign in with the allowed email and use the console.

## Connect an agent

Agents reach the private `/mcp` with the Access **service token** the stack
created — no browser. See [`docs/connect-clients.md`](docs/connect-clients.md).
Quick headless check:

```sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun run scripts/verify-mcp.ts
```

```text
Headless MCP initialize succeeded (200). No browser involved.
```

## The self-edit demo

The point of the repo. Two ways to run it, matching the ladder — full walkthrough
in [`docs/self-edit.md`](docs/self-edit.md):

- **Local (rung 1):** point a stdio MCP client at `bun run scripts/self-edit-mcp.ts`.
  You invoke it; it edits the repo and redeploys.
- **Through the catalog (rung 2):** run `scripts/self-edit-http.ts` behind an
  authenticated tunnel, register it with `executor.mcp.addServer`, and an agent
  on your endpoint can call `self_edit` — every call **pauses for your approval**:

  ```text
  Execution paused: Edit and redeploy Executor
  ```

  Approve, and the live gateway rewrites itself.

It is repo-confined (paths escaping the repo are refused — tested) and bearer-
guarded. Removing the gate without adding rung 3's verification is a loaded gun;
don't.

## Update Executor

The Executor revision is pinned in `scripts/bootstrap.ts`:

```sh
EXECUTOR_REVISION=<full-commit-sha> bun run deploy
```

Updates replace the Worker and assets and leave D1, R2, the Durable Object,
secret, hostname, and Access configuration in place.

## Teardown

```sh
bun run destroy
```

This removes the stack's resources. **It can delete D1 and R2 data** — don't run
it against an installation whose data you need.

## Development

```sh
bun run check   # tests + typecheck, no Cloudflare credentials needed
```

`vendor/`, `.env`, `.env.mcp`, and Alchemy state are generated/local and git-ignored.

## Security model

- The hostname is private behind Cloudflare Access; an unguessable URL is never
  relied on for privacy.
- Sandboxed catalog tools cannot deploy or edit the repo.
- `self_edit` is repo-confined, bearer-guarded, and approval-gated on every call.
- Secrets (encryption key, service token, integration tokens) live as Worker
  secrets, in Alchemy state, or in Executor's server-side store — never
  committed. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a packaged product. Use a non-production Cloudflare account
  until you've reviewed it.
- `destroy` retention across D1/R2/Access isn't exhaustively characterized;
  treat teardown as destructive.
- Pins one Executor revision and one Alchemy version.
- Ships rungs 1–2 of the ladder. Rung 3 (verification) and rung 4 (unattended
  loop) are yours to add — and you should add rung 3 before rung 4.

## Repository layout

```text
alchemy.run.ts         the full resource graph (Worker, D1, R2, DO, secret, Access)
src/config.ts          validated .env inputs
scripts/bootstrap.ts   pin + build the vendored Executor
scripts/verify.ts      anonymous-access check
scripts/verify-mcp.ts  headless MCP check (service token)
scripts/mcp-bridge.ts  stdio → HTTP bridge for local MCP clients
scripts/self-edit-*    repo-confined self-edit: core, local stdio, catalog HTTP
docs/                  architecture, self-edit, client connection
test/                  config + self-edit boundary tests
```

## License

MIT
