# self_edit

`self_edit` edits a file in **this repo** and redeploys. It is confined to the
repo (paths that escape are refused — see `test/self-edit.test.ts`) and it
redeploys, so it is marked **destructive**. Two ways to run it.

## Local

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

## Through the catalog

An agent calls `self_edit` through your public `/mcp` endpoint, and Executor
pauses for approval before it runs.

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

   You approve; the local server edits the repo and redeploys, and the live
   system reflects the change.

## Controls

- **Repo-confined.** It can only touch files under this repo. Tested.
- **Bearer-guarded.** The HTTP server serves no request without the token.
- **Authenticated transport.** Keep the tunnel behind auth; the bearer is a
  second lock.
- **Approval-gated.** The destructive hint makes Executor stop for a human on
  every call.

There is no auto-approve mode. Running it unattended would first need a
verification step that fails the deploy when the change didn't actually take.
