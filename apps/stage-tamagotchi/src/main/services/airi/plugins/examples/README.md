# Extension Host Examples

Use these folders with the **Extension Host Inspector** at `/devtools/plugin-host`.

- `devtools-sample-plugin` verifies the basic Extension lifecycle and permissions.
- `activation-planner-provider` and `activation-planner-consumer` verify dependency planning.

Import both Activation Planner examples. Enable the Provider first. Then enable the Consumer. The Host loads the Provider before the Consumer and stops the Consumer before the Provider.

The Provider only declares a Kit in its manifest. It does not register a runtime Kit implementation. Runtime Kit registration is outside the Phase 2 boundary.
