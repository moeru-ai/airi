Fix two build-breaking issues in core-terminal package:

1. **Add NormalizedToolError type** to `packages/core-terminal/src/bridge.ts` - the type is exported but never defined
2. **Fix corrupted Zod schema handler** in `packages/core-terminal/src/handler.ts` - line with `shape[key] = **********()` needs to be `shape[key] = z2.unknown()` to handle invalid/missing properties

These are straightforward typo/missing definition fixes that will unblock the dev:tamagotchi command.