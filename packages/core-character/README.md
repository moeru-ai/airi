# `@proj-airi/core-character`

This package owns the shared contracts for characters and avatar models. It
also provides character-runtime modules when those modules do not depend on a
specific Stage renderer.

## Use this package

Use this package for identities and contracts that all character surfaces
share. An avatar-model reference is one example. Each renderer package owns
the configuration for its model type.

## Do not use this package

Do not add Vue state, renderer instances, model files, or persistence adapters
to this package. These modules have separate lifecycle and ownership rules.
