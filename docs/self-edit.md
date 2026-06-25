# Self-edit: the gateway that can rewrite itself

`self_edit` is one tool that edits a file in **this repo** and redeploys. It is
how the gateway changes itself. It is confined to the repo (paths that escape
are refused — see `test/self-edit.test.ts`) and it really redeploys, so it is
marked **destructive**.

There are two ways to run it, matching the first two rungs of the autonomy
ladder in [`architecture.md`](architecture.md).

## Rung 1 — local (operator plane)

`scripts/self-edit-mcp.ts` is a stdio MCP server. Point any local stdio MCP
client at it:

```jsonc
{
  "mcpServers": {
    "self-edit": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/executor-cloudflare/scripts/self-edit-mcp.ts"],
      "lifecycle": "lazy"
    }
  }
}
```

It runs only on your machine. You invoke it; you read the result. Nothing about
it touches the public endpoint.

## Rung 2 — through the catalog (gated)

This is the interesting one: an agent calls `self_edit` **through your public
`/mcp` endpoint**, and Executor pauses for your approval before it runs.

1. Run the HTTP server with a secret:

   ```sh
   SELF_EDIT_TOKEN=$(openssl rand -hex 24) bun run scripts/self-edit-http.ts
   ```

2. Expose it on an authenticated URL. Any authenticated tunnel works; the
   quickest for a demo:

   ```sh
   cloudflared tunnel --url http://localhost:8791
   ```

   Note the `https://…trycloudflare.com` URL. (For anything lasting, use a named
   tunnel behind Cloudflare Access instead of a quick tunnel.)

3. Register it in the catalog (run inside an Executor `execute` call, or from a
   connected agent):

   ```ts
   await tools['executor.mcp.addServer']({
     transport: 'remote',
     name: 'Self Edit',
     slug: 'selfedit',
     endpoint: 'https://<your-tunnel>.trycloudflare.com/mcp',
     remoteTransport: 'streamable-http',
     headers: { authorization: 'Bearer <SELF_EDIT_TOKEN>' },
   });
   await tools['executor.coreTools.connections.create']({
     owner: 'org', name: 'main', integration: 'selfedit', template: 'none',
   });
   ```

4. Now any agent on your private endpoint can call
   `selfedit.org.main.self_edit`. Because the tool is destructive, **every call
   pauses**:

   ```text
   Execution paused: Edit and redeploy Executor
   ```

   You approve, the local server edits the repo and redeploys, and the live
   system reflects the change. The approval pause is the seatbelt.

## Why this is safe enough to be fun

- **Repo-confined.** It can only touch files under this repo. Tested.
- **Bearer-guarded.** The HTTP server serves no one without the token.
- **Authenticated transport.** The tunnel should sit behind auth; the bearer is
  a second lock.
- **Approval-gated.** The destructive hint makes Executor stop for a human on
  every call.

Remove the seatbelt (auto-approve, no proof) and you are at rung 4 with a loaded
gun. Don't, until you've added rung 3 (a verification step that fails the deploy
if the change didn't actually work).
