# Kit Dependency Consumer

This example requires `dev.airi.example-activation` with the version range `^1.0.0`.

Use it with the `activation-planner-provider` example:

1. Open `/devtools/plugin-host` in Stage Tamagotchi.
2. Import the Provider folder next to this folder.
3. Import this folder.
4. Enable this Consumer, then load the enabled Extensions. The Consumer waits in `pending`. The inspector graph says that no provider of the Kit is installed.
5. Enable the Provider, then load the enabled Extensions again. The Consumer starts by itself.

The `kits.uses` entry is a required dependency of the session. The Host runs setup only when a provider of the Kit is available.
