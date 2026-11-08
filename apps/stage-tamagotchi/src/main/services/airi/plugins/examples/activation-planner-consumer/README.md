# Kit Consumer Example

This example requires `dev.airi.example-activation` with the version range `^1.0.0`.

Use it with the `activation-planner-provider` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import the Provider folder next to this folder.
3. Import this folder.
4. Enable this Consumer, and load the enabled Extensions.
5. Make sure that the session of this Consumer is `pending` and waits for `dev.airi.example-activation`.
6. Enable the Provider, and load the enabled Extensions.

The setup of this Consumer runs after the Provider registers its Kit.

This example does not call a runtime Kit. Its `kits.uses` entry only makes its session wait for the Provider. Consumer Client lookup belongs to Phase 4.
