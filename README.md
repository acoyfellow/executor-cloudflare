# Executor on Cloudflare

Deploy [Executor](https://github.com/RhysSullivan/executor) — an open-source
integration layer for AI agents — to your own Cloudflare account in one command,
private behind Cloudflare Access.

It is a small, honest **example**: it vendors Executor's existing Cloudflare host
and uses [Alchemy](https://github.com/alchemy-run/alchemy-effect) to declare the
whole resource graph — including the Access application and policy — so you get a
working, private installation without copying audience IDs between a shell, a
README, and the dashboard.

- **One command** provisions and deploys everything.
- **Private by default** — Access in front, `workers.dev` and previews off.
- **Headless-ready** — a service token lets agents/CLIs reach `/mcp` with no browser.
- **Optional self-edit demo** — an operator-gated, repo-confined tool that edits
  this repo and redeploys (see [the demo](#optional-self-edit-demo)).

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
operator ▶ self-edit (local) ▶ edit repo + redeploy   (changes the system)
```

Catalog tools run in Executor's sandbox and can only call what they are
connected to. Changing the system itself requires the local operator plane.

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

`deploy` checks out the pinned Executor commit under `vendor/`, installs and
builds its Cloudflare app, then applies the Alchemy stack. First run prints the
created resources and your URLs:

```text
Done: 8 succeeded
{
  url: "https://executor.example.com",
  mcpUrl: "https://executor.example.com/mcp",
  ...
}
```

Re-running `deploy` is a no-op for the data resources (only the Worker updates).

## Verify

```sh
bun run verify
```

Expected — an anonymous request is turned away by Access, not served:

```text
Anonymous request blocked by Cloudflare Access (302).
Open https://executor.example.com in a browser to verify the signed-in experience.
MCP endpoint: https://executor.example.com/mcp
```

Then open the URL, sign in with the allowed email, and use the console.

## Connect an agent

Agents reach the private `/mcp` endpoint with the Access **service token** the
stack created — no browser. Full details in
[`docs/connect-clients.md`](docs/connect-clients.md). Quick headless check:

```sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun run scripts/verify-mcp.ts
```

```text
Headless MCP initialize succeeded (200). No browser involved.
```

Read the token from Alchemy state:

```sh
bunx alchemy state get --stack ExecutorCloudflare --stage <stage> --fqn ExecutorAgent
```

## Add a tool (read-only Cloudflare example)

`integrations/cloudflare-readonly.openapi.json` is a curated, **GET-only** slice
of the Cloudflare API: account, zones, Workers, D1, R2. It is read-only by
construction — no write operations exist in the spec — so an agent cannot mutate
your account through it. Add it from the Executor console (Add Source → paste
the spec) or via the catalog tools, then enter a **read-only** Cloudflare API
token in the UI. The token is stored server-side and never passes through an
agent or this repo.

## Optional: self-edit demo

`scripts/self-edit-mcp.ts` is a local stdio MCP server exposing one tool,
`self_edit`, that edits a file in **this repo** and redeploys. It demonstrates a
system that can change itself — safely:

- **Repo-confined**: paths that escape the repo root are refused (tested).
- **Operator-gated**: it runs only on your machine, invoked by a local MCP
  client you control. It is never in the Executor catalog or reachable from the
  public endpoint.
- **Destructive**: it really redeploys. Review every call.

Point a local stdio MCP client at `bun run scripts/self-edit-mcp.ts`. Exposing
self-edit *through* Executor's catalog is possible but intentionally not shipped
here; see the note in [`docs/architecture.md`](docs/architecture.md).

## Update Executor

The Executor revision is pinned in `scripts/bootstrap.ts`. Try another revision:

```sh
EXECUTOR_REVISION=<full-commit-sha> bun run deploy
```

Updates replace the Worker and assets and leave D1, R2, the Durable Object,
secret, hostname, and Access configuration in place.

## Teardown

```sh
bun run destroy
```

This removes the stack's resources. **It can delete D1 and R2 data** — do not
run it against an installation whose data you need. Export anything you want to
keep first.

## Development

Offline checks need no Cloudflare credentials:

```sh
bun run check   # tests + typecheck
```

`vendor/` (the Executor checkout), `.env`, `.env.mcp`, and Alchemy state are
generated/local and git-ignored.

## Security model

- The hostname is private behind Cloudflare Access; an unguessable URL is not
  relied on for privacy.
- Catalog tools run sandboxed and cannot deploy or edit the repo.
- Self-edit lives only on the operator's machine and is repo-confined.
- Secrets (encryption key, service token, integration tokens) are stored as
  Worker secrets, in Alchemy state, or in Executor's server-side store — never
  committed. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a packaged product. Use a non-production Cloudflare account
  until you have reviewed it.
- `destroy` retention behavior across D1/R2/Access has not been exhaustively
  characterized; treat teardown as destructive.
- Pins one Executor revision and one Alchemy version; newer versions may differ.

## Repository layout

```text
alchemy.run.ts        the full resource graph (Worker, D1, R2, DO, secret, Access)
src/config.ts         validated .env inputs
scripts/bootstrap.ts  pin + build the vendored Executor
scripts/verify.ts     anonymous-access check
scripts/verify-mcp.ts headless MCP check (service token)
scripts/mcp-bridge.ts stdio → HTTP bridge for local MCP clients
scripts/self-edit-*   repo-confined self-edit (core + local stdio server)
integrations/         curated read-only Cloudflare OpenAPI spec
docs/                 architecture + client connection guide
test/                 config + self-edit boundary tests
```

## License

MIT
