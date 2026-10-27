# Extension-hosted Kit Provider Example

Import this folder in the Extension Host Inspector. Enable the Extension. Then load the Extension.

The Manifest declares `dev.airi.example-hosted`. The entrypoint registers its Contract and method handler during root setup. The Host publishes the Provider only after setup succeeds. The Host withdraws the Provider when you unload the Extension.

Phase 3 stores the handler. It does not invoke the handler or create a Consumer Client. Method routing is a Phase 4 task.
