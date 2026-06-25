# Contributing

Keep this example focused on one outcome: deploy Executor privately to a customer-owned Cloudflare account without manual Access setup.

Before opening a change:

```sh
bun install
bun run check
bun run bootstrap
```

Do not add a generic application framework, hosted control plane, or unrelated Cloudflare abstraction. Live deployment claims require a dated result from an isolated account.
