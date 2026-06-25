// Shared self-edit core, used by both the local stdio server and the
// catalog-exposed HTTP MCP server. Confined to this repo: paths that escape
// the repo root are refused.

import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const selfEditTool = {
  name: 'self_edit',
  description:
    'Edit a file in the executor-cloudflare repo (find/replace) and optionally redeploy your deployment. Confined to this repo. Destructive: changes the running system.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the repo root.' },
      find: { type: 'string', description: 'Exact text to replace (must be unique).' },
      replace: { type: 'string', description: 'Replacement text.' },
      deploy: { type: 'boolean', description: 'Redeploy after editing. Default true.' },
    },
    required: ['path', 'find', 'replace'],
  },
  annotations: {
    title: 'Edit and redeploy Executor',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

export function safePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(repoRoot, p);
  const rel = relative(repoRoot, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Refusing to edit outside the repo: ${p}`);
  }
  if (!existsSync(abs)) throw new Error(`No such file: ${p}`);
  return abs;
}

export async function selfEdit(args: any): Promise<string> {
  const abs = safePath(String(args.path));
  const find = String(args.find);
  const replace = String(args.replace);
  const doDeploy = args.deploy !== false;

  const before = await readFile(abs, 'utf8');
  const count = before.split(find).length - 1;
  if (count === 0) throw new Error(`find text not present in ${args.path}`);
  if (count > 1) throw new Error(`find text is not unique in ${args.path} (${count} matches)`);
  await writeFile(abs, before.replace(find, replace));

  if (!doDeploy) return `Edited ${args.path}. Not redeployed (deploy=false).`;

  // Re-run bootstrap so a changed Executor revision is actually checked out and
  // built before deploy. Without this, editing the pinned revision would only
  // redeploy the already-built vendor/ (stale). This is what makes remote
  // version updates real.
  const out = await $`bun run bootstrap && bunx alchemy deploy --yes`
    .cwd(repoRoot)
    .text()
    .catch((e) => String(e));
  const tail = out.trim().split('\n').slice(-8).join('\n');
  return `Edited ${args.path}, rebuilt the pinned Executor, and redeployed.\n\n${tail}`;
}
