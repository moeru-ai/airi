# Extension Host Examples

Use these folders with the **Extension Host Inspector** at `/devtools/plugin-host`.

- `devtools-sample-plugin` verifies the basic Extension lifecycle and permissions.
- `activation-planner-provider` and `activation-planner-consumer` verify Kit dependencies between two Extensions.
- `hosted-kit-provider` verifies Extension-hosted Kit registration and withdrawal.

Import both dependency examples. Enable them in any order. A Consumer that starts before its Provider waits in `pending`, and the inspector shows the reason. It starts when the Provider commits its Kit. When the Provider stops, the Consumer goes back to `pending`.

The Provider registers its declared Kit during setup. The Host publishes the Kit after setup succeeds.

Import `hosted-kit-provider` to verify the registration without a Consumer dependency.
