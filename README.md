# Executor on Cloudflare

A private agent gateway on **your own** Cloudflare account that can rewrite and
redeploy itself — with an approval gate as the seatbelt.

It deploys [Executor](https://github.com/RhysSullivan/executor) (an open-source
integration layer for AI agents) in one command, private behind Cloudflare
Access, using [Alchemy](https://github.com/alchemy-run/alchemy-effect) for the
resource graph. Then it gives an agent a tool — through the public endpoint —
that edits this repo and redeploys, and makes every such call **stop for your
yes**.

- **One command** deploys everything, private by default.
- **Headless** — a service token lets agents/CLIs reach `/mcp`, no browser.
- **Self-modifying, gated** — `self_edit` changes the running system but pauses
  for approval on every call.

## Self-hosting on Cloudflare, made smooth

The path from "clone the repo" to "running privately on my account" usually has
rough edges: Access wiring around the MCP endpoint, the right Cloudflare moves
to deploy at all, and forks drifting out of date. This repo targets all three:

- **Deploy without the Cloudflare-isms.** One command stands up the whole graph
  — Worker, D1, R2, Durable Object, secret, hostname, Access app *and* policy —
  in code. No deploy → copy the Access audience by hand → deploy again.
- **Auth that fits usage.** Browsers sign in through Access; agents/CLIs hit the
  same private `/mcp` with an Access **service token** — no bolted-on login.
- **Stay current.** Executor's version is pinned; updating is bump-revision →
  redeploy, with D1, R2, Durable Object, secret, hostname, and Access preserved.

Useful patterns here are meant to be lifted upstream.

## The autonomy ladder

This gateway can change itself; you choose how much of the loop to close, by
*adding control* rather than removing capability:

1. **Invoked** — you call `self_edit`, you read the result.
2. **Gated** — an agent proposes it through the public endpoint; pauses for your
   approval. **This repo ships rungs 1–2.**
3. **Verified** — a proof step runs after each change, so it can't redeploy a lie.
4. **Looped** — runs on a schedule, healing and extending itself.

The gate and repo confinement are the seatbelt. Detail: [`docs/self-edit.md`](docs/self-edit.md).

## What it creates

All in **your** account; nothing hosted elsewhere.

| Resource | Purpose |
|---|---|
| Worker + web assets | console, API, `/mcp` endpoint |
| D1 | application data |
| R2 | specs and plugin blobs |
| Durable Object | MCP sessions |
| Encryption secret | at-rest key (generated; Worker secret) |
| Custom hostname | stable origin you own |
| Access app + email policy | browser sign-in |
| Access service token + policy | headless agents/CLIs |

`workers.dev` and preview URLs are off.

## Architecture

Two planes, kept apart — see [`docs/architecture.md`](docs/architecture.md):

```text
agents ──▶ <your-host>/mcp ──▶ catalog tools   (sandboxed; cannot deploy)
                                 self_edit       (gated; rewrites + redeploys)
operator ▶ self-edit (local) ▶ edit repo + redeploy
```

Catalog tools run sandboxed and only call what they're connected to. `self_edit`
is the deliberate exception: a destructive hint makes Executor halt for approval
before it runs.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Cloudflare account with Workers, D1, R2, Durable Objects, and Zero Trust
- A hostname in a zone on that account (e.g. `executor.example.com`)
- A Zero Trust team domain (e.g. `your-team.cloudflareaccess.com`)

## Setup (~5 min)

```sh
git clone https://github.com/acoyfellow/executor-cloudflare
cd executor-cloudflare
bun install
cp .env.example .env   # set hostname, allowed email, team domain
bunx alchemy login
bun run deploy
```

`deploy` checks out the pinned Executor commit under `vendor/`, builds it, and
applies the stack:

```text
Done: 8 succeeded
{ url: "https://executor.example.com", mcpUrl: ".../mcp", ... }
```

Re-running is a no-op for data resources (only the Worker updates).

## Verify

```sh
bun run verify
```

```text
Anonymous request blocked by Cloudflare Access (302).
```

Then open the URL, sign in with the allowed email, and use the console.

## Connect an agent

Agents reach `/mcp` with the Access **service token** the stack created — no
browser. See [`docs/connect-clients.md`](docs/connect-clients.md). Quick check:

```sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun run scripts/verify-mcp.ts
# -> Headless MCP initialize succeeded (200). No browser involved.
```

## The self-edit demo

The point of the repo. Full walkthrough: [`docs/self-edit.md`](docs/self-edit.md).

- **Local (rung 1):** point a stdio MCP client at `bun run scripts/self-edit-mcp.ts`.
- **Catalog (rung 2):** run `scripts/self-edit-http.ts` behind an authenticated
  tunnel, register it with `executor.mcp.addServer`, and an agent on your
  endpoint can call `self_edit` — every call pauses (`Execution paused: Edit and
  redeploy Executor`). Approve, and the live gateway rewrites itself.

Repo-confined (escaping paths refused — tested) and bearer-guarded. Removing the
gate before adding rung 3's verification is a loaded gun.

## Update

```sh
EXECUTOR_REVISION=<full-commit-sha> bun run deploy
```

Replaces the Worker and assets; leaves D1, R2, Durable Object, secret, hostname,
and Access in place.

## Teardown

```sh
bun run destroy   # can delete D1/R2 data — don't run it on data you need
```

## Development

```sh
bun run check   # tests + typecheck, no Cloudflare credentials needed
```

`vendor/`, `.env`, `.env.mcp`, and Alchemy state are git-ignored.

## Security

- Private behind Cloudflare Access; an unguessable URL is never relied on for privacy.
- Sandboxed catalog tools can't deploy or edit the repo.
- `self_edit` is repo-confined, bearer-guarded, and approval-gated.
- Secrets live as Worker secrets, in Alchemy state, or in Executor's server-side
  store — never committed. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a product — use a non-production account until you've reviewed it.
- Treat `destroy` as destructive; D1/R2/Access retention isn't fully characterized.
- Pins one Executor revision and one Alchemy version.
- Ships rungs 1–2; add rung 3 (verification) before rung 4 (unattended loop).

## Layout

```text
alchemy.run.ts         resource graph (Worker, D1, R2, DO, secret, Access)
src/config.ts          validated .env inputs
scripts/bootstrap.ts   pin + build vendored Executor
scripts/verify*.ts     anonymous-access + headless-MCP checks
scripts/mcp-bridge.ts  stdio → HTTP bridge for local MCP clients
scripts/self-edit-*    repo-confined self-edit (core, local stdio, catalog HTTP)
docs/ · test/          architecture/self-edit/connect · config + boundary tests
```

## License

MIT
