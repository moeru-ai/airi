# @proj-airi/extension-protocol

Identity and permission types for AIRI Extensions.

## What it does

- Defines the identity types of an Extension session and of its modules.
- Defines the permission model: areas, specs, declarations, grants, and errors.
- Defines `Localizable`, the text type that permission reasons and labels use.

The package has types only. It has no runtime code.

## How to use

```ts
import type {
  ExtensionIdentity,
  ModulePermissionDeclaration,
} from '@proj-airi/extension-protocol'
```

## When to use

- You write an Extension host or an SDK, and you need the identity or permission types.
- You need these types without the AIRI channel server events.

## When not to use

- You need the AIRI channel server events or their payloads. Use `@proj-airi/plugin-protocol`. It also re-exports these types.
- You need the Extension author API or the host API. Use `@proj-airi/plugin-sdk`.

## License

[MIT](../../LICENSE)
