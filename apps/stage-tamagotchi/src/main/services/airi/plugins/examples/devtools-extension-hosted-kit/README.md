# Extension-hosted Kit Example

This example contains two independent Extensions:

- `provider` owns the `dev.airi.agent-activity` Kit implementation.
- `consumer` declares the Kit dependency and sends one task reminder.

The Kit uses the `local-only` exposure policy. The Host allows one active Provider for this Kit id.

The `.mjs` files represent bundled Extension output. They have no workspace package imports, so the imported copies remain self-contained.

## Run the example

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import the `provider` folder.
3. Import the `consumer` folder.
4. Enable and load `devtools-agent-activity-provider`.
5. Enable and load `devtools-agent-activity-consumer`.
6. Read the main-process console.

The Provider logs the reminder. The Consumer logs the returned receipt.

Disable and unload the Provider after both Extensions are ready. The Consumer then logs that the Kit is unavailable.

## Contracts under test

- The Provider must declare the Kit in `kits.provides`.
- The Consumer must declare the Kit in `kits.uses`.
- The Consumer must have `apis.invoke` permission for the Kit id.
- A second active Provider for the same Kit id fails during setup.
- Provider unload revokes issued client objects and changes Kit availability.
