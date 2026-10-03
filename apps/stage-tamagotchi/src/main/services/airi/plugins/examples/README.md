# Extension Host Examples

Use these folders with the **Extension Host Inspector** at `/devtools/plugin-host`.

- `devtools-sample-plugin` verifies the basic Extension lifecycle and permissions.
- `activation-planner-provider` and `activation-planner-consumer` verify dependency planning.
- `hosted-kit-provider` verifies Extension-hosted Kit registration and withdrawal.

Import both Activation Planner examples. Enable the Provider first. Then enable the Consumer. The Host loads the Provider before the Consumer and stops the Consumer before the Provider.

The Activation Planner Provider now registers its declared Kit during setup. Phase 2 used only the static declaration. Phase 3 requires the runtime registration before the Provider can become ready.

Import `hosted-kit-provider` to verify Phase 3 registration without a Consumer dependency.
