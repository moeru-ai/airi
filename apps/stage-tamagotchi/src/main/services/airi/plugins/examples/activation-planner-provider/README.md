# Kit Provider Example

This example declares `dev.airi.example-activation` version `1.0.0` in its manifest.

Use it with the `activation-planner-consumer` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import this folder.
3. Import the Consumer folder next to this folder.
4. Enable the Consumer, and load the enabled Extensions. The Consumer waits in `pending`.
5. Enable this Provider, and load the enabled Extensions.

The Consumer setup runs after this Provider registers its Kit. When this Provider stops, a Consumer that already runs keeps its session.

The entrypoint registers the Provider during root setup. The example does not call its method handler.
