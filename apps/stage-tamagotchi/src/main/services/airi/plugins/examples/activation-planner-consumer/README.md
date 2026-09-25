# Activation Planner Consumer

This example requires `dev.airi.example-activation` with the version range `^1.0.0`.

Use it with the `activation-planner-provider` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import the Provider folder next to this folder.
3. Import this folder.
4. Enable the Provider.
5. Enable this Consumer.
6. Load the enabled Extensions.

The Host loads the Provider before this Consumer. When the system stops, the Host stops this Consumer before the Provider.

This example does not call a runtime Kit. Its `kits.uses` entry only creates a static Phase 2 dependency. Runtime Kit lookup belongs to Phase 3.
