# Plugin scenarios

This folder runs five plugin scenarios through the real plugin host. Each plugin runs in a `worker_threads` Worker behind the eventa bridge.

Use it to watch how the injeca graph handles plugins: phases, statuses, decisions, and dependency changes. Do not use it as a template for an AIRI app host. The Kits here are stand-ins.

## Run

```sh
pnpm -F @proj-airi/plugin-sdk exec tsx examples/scenarios.ts all
pnpm -F @proj-airi/plugin-sdk exec tsx examples/scenarios.ts s2
```

Each line is one record:

| Prefix | Source |
| --- | --- |
| `▶` | A scenario step |
| `123ms [owner] key a → b` | injeca `observe()`: a phase change, a status change, or a hook decision |
| `?` | `graph().explain()` of a session or a key |
| `·` | A note of the scenario, for example a Kit call result |

The same scenarios are tests in `src/plugin-host/scenarios/`. They assert the results that the demo prints.

## Scenarios

| Scenario | What it shows |
| --- | --- |
| S1 | `s1-consumer` uses the built-in `airi.widget` and `airi.computer-use` Kits. Each call carries its caller identity. |
| S2 | `plugin-b` provides `airi.fs-store` and `airi.auto-memory`. `plugin-a` installs later and uses them. `plugin-b` does not rebuild. An atomic reload of `plugin-b` moves `plugin-a` in place. In the reverse order, `plugin-a` waits in `pending` and starts by itself. |
| S3 | `plugin-rebuild` calls `ctx.self.rebuild()` during and after setup. `plugin-discover` finds a Kit with `ctx.kits.use()`. `plugin-greedy` reaches the limit of 5 rebuilds. |
| S4 | `plugin-shell` upserts scripts with Kit lists that come at run time: replace, timeout, cancel, and a denied grant. |
| S5 | `airi.memory-backend` has a Host provider and the `bmb` provider. The order prefers `bmb`. When the worker of `bmb` exits, the selection falls back to the Host. The `context.inject` hook of `bmb` runs in the harness runner and goes away with `bmb`. |

## Files

- `scenarios.ts`: the demo entry.
- `scenarios/host.ts`: the scenario Host with the built-in Kit stand-ins, and the timeline printer.
- `scenarios/kits.ts`: the Kit contracts. A real provider publishes them in a package, for example `@plugin-b/kits`.
- `scenarios/plugins/*.ts`: the fixture plugins. They import only plugin-sdk.
- `scenarios/run.ts`: the scenario steps. The demo and the tests share them.
