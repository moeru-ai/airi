# Activation Planner Provider

This example declares `dev.airi.example-activation` version `1.0.0` in its manifest.

Use it with the `activation-planner-consumer` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import this folder.
3. Import the Consumer folder next to this folder.
4. Enable this Provider.
5. Enable the Consumer.
6. Load the enabled Extensions.

The Host loads this Provider before the Consumer. It also rejects disabling or unloading this Provider while the Consumer still requires it.

The Manifest declaration supplies the Phase 2 dependency graph. The entrypoint also registers a Provider during root setup, as Phase 3 requires. The example does not call its method handler.
