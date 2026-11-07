# Kit Dependency Provider

This example declares `dev.airi.example-activation` version `1.0.0` in its manifest.

Use it with the `activation-planner-consumer` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import this folder.
3. Import the Consumer folder next to this folder.
4. Enable this Provider and the Consumer, in any order.
5. Load the enabled Extensions.

The Consumer runs setup only when this Provider has committed its Kit. When you unload this Provider, the Consumer goes back to `pending` and waits for it.

The entrypoint registers the Provider during root setup. The Host publishes it after setup succeeds.
