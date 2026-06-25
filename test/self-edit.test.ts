import { describe, expect, test } from 'bun:test';

// Drives the self-edit MCP server over stdio and asserts its safety boundary
// without ever deploying (deploy:false). The tool must refuse to touch paths
// outside this repo and refuse files that do not exist.

const server = new URL('../scripts/self-edit-mcp.ts', import.meta.url).pathname;

async function call(args: Record<string, unknown>): Promise<string> {
  const proc = Bun.spawn(['bun', 'run', server], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const lines = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'self_edit', arguments: { deploy: false, ...args } },
    }),
  ].join('\n') + '\n';
  proc.stdin.write(lines);
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const result = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((m) => m.id === 2);
  return JSON.stringify(result?.result ?? result);
}

describe('self_edit boundary', () => {
  test('refuses paths outside the repo', async () => {
    const r = await call({ path: '../../../etc/hosts', find: 'x', replace: 'y' });
    expect(r).toContain('Refusing to edit outside the repo');
  });

  test('refuses files that do not exist', async () => {
    const r = await call({ path: 'does-not-exist.ts', find: 'x', replace: 'y' });
    expect(r).toContain('No such file');
  });

  test('refuses find text that is not unique', async () => {
    // package.json has many quotes; a non-unique find must be rejected.
    const r = await call({ path: 'package.json', find: '"', replace: 'X' });
    expect(r).toContain('not unique');
  });
});
