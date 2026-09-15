# Extension-hosted Kit Example

This example contains two independent Extensions:

- `provider` owns the `dev.airi.agent-activity` Kit implementation.
- `consumer` reads the current activity and reacts to later activity events.

The Kit uses the `local-only` exposure policy. The Host allows one active Provider for this Kit id.

The `.mjs` files represent bundled Extension output. They have no workspace package imports, so the imported copies remain self-contained.

## Run the example

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import the `provider` folder.
3. Import the `consumer` folder.
4. Enable and load `devtools-agent-activity-provider`.
5. Enable and load `devtools-agent-activity-consumer`.
6. Read the main-process console.

The Provider logs the current activity. The Consumer logs one AIRI reaction for the current activity and one reaction for the completion event.

Disable and unload the Provider after both Extensions are ready. The Consumer then logs that the Kit is unavailable.

## Contracts under test

- The Provider must declare the Kit in `kits.provides`.
- The Consumer must declare the Kit in `kits.uses`.
- The Consumer must have `apis.invoke` permission for the Kit id.
- A second active Provider for the same Kit id fails during setup.
- The Host creates the Consumer client from the shared method and event contract.
- Method outputs and event payloads contain only structured Kit data.
- Provider unload closes subscriptions and changes Kit availability.
