# Extension-hosted Kit Provider Example

Import this folder in the Extension Host Inspector. Enable the Extension. Then load the Extension.

The Manifest declares `dev.airi.example-hosted`. The entrypoint registers its Contract and method handler during root setup. The Host publishes the Provider only after setup succeeds. The Host withdraws the Provider when you unload the Extension.

A Consumer that declares the Kit in `kits.uses` gets a client with `ctx.kits.get(...)`. Each call reaches the handler with the caller identity of the Consumer.
