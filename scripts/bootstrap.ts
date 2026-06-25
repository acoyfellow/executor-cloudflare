import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const repository = 'https://github.com/RhysSullivan/executor.git';
const revision = process.env.EXECUTOR_REVISION || '24bccd671205d7acbe78e46c507973b5d15a7808';
const destination = 'vendor/executor';

await mkdir('vendor', { recursive: true });

if (!existsSync(`${destination}/.git`)) {
  await $`git clone --filter=blob:none --no-checkout ${repository} ${destination}`;
}

await $`git -C ${destination} fetch --depth=1 origin ${revision}`;
await $`git -C ${destination} checkout --detach FETCH_HEAD`;

const actual = (await $`git -C ${destination} rev-parse HEAD`.text()).trim();
if (actual !== revision) {
  throw new Error(`Expected Executor ${revision}, checked out ${actual}`);
}

// Pin the vendored checkout to the public npm registry, in case the host has a
// user-level @cloudflare registry override that would otherwise leak into the
// install.
await writeFile(`${destination}/.npmrc`, '@cloudflare:registry=https://registry.npmjs.org/\n');

await $`bun install --cwd ${destination} --frozen-lockfile`;
await $`bun run --cwd ${destination}/apps/host-cloudflare build`;

console.log(`Prepared Executor ${actual}`);
