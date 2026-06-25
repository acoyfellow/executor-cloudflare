// Minimal stdio -> HTTP MCP bridge for an Access-gated Executor.
//
// MCP stdio transport is newline-delimited JSON. This reads each JSON-RPC
// message from stdin, forwards it to the Executor /mcp endpoint with the
// Cloudflare Access service-token headers, and writes the response back to
// stdout. Lets any stdio MCP client (e.g. Pi) talk to the remote, private
// Executor with no browser.
//
// Env:
//   EXECUTOR_MCP_URL          default https://executor.example.com/mcp
//   CF_ACCESS_CLIENT_ID       required
//   CF_ACCESS_CLIENT_SECRET   required

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Fall back to the gitignored .env.mcp next to the repo so the secret never
// has to live in a client's MCP config.
const envFile = fileURLToPath(new URL('../.env.mcp', import.meta.url));
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const url = (process.env.EXECUTOR_MCP_URL || 'https://executor.example.com/mcp').trim();
const id = process.env.CF_ACCESS_CLIENT_ID?.trim();
const secret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();

if (!id || !secret) {
  process.stderr.write('mcp-bridge: set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET\n');
  process.exit(1);
}

const headers = {
  'CF-Access-Client-Id': id,
  'CF-Access-Client-Secret': secret,
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

let sessionId: string | undefined;

async function forward(message: string): Promise<void> {
  let parsed: any;
  try {
    parsed = JSON.parse(message);
  } catch {
    return;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
    body: message,
  });

  const sid = response.headers.get('mcp-session-id');
  if (sid) sessionId = sid;

  // Notifications (no id) get 202 and no body.
  if (parsed.id === undefined) return;

  const contentType = response.headers.get('content-type') || '';
  let payload: string;
  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const dataLine = text
      .split('\n')
      .find((line) => line.startsWith('data:'));
    payload = dataLine ? dataLine.slice(5).trim() : '';
  } else {
    payload = (await response.text()).trim();
  }
  if (payload) process.stdout.write(payload + '\n');
}

let buffer = '';
// Strict FIFO: each message fully completes before the next is sent, so the
// MCP session handshake (initialize -> initialized -> ...) stays ordered.
let chain: Promise<void> = Promise.resolve();

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index: number;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) chain = chain.then(() => forward(line)).catch(() => {});
  }
});

process.stdin.on('end', async () => {
  await chain;
  process.exit(0);
});
