# Extension Host Examples

Use these folders with the **Extension Host Inspector** at `/devtools/plugin-host`.

- `devtools-sample-plugin` verifies the basic Extension lifecycle and permissions.
- `activation-planner-provider` and `activation-planner-consumer` verify that a Consumer waits for its required Kit.
- `hosted-kit-provider` verifies Extension-hosted Kit registration and withdrawal.

Import both examples. Enable and load the Consumer first. Its session stays `pending`, and the Inspector shows the Kit that it waits for. Then enable and load the Provider. The Consumer setup runs after the Provider registers its Kit.

The Provider registers its declared Kit during setup. The Provider becomes ready only after this registration.

Import `hosted-kit-provider` to verify Phase 3 registration without a Consumer dependency.
