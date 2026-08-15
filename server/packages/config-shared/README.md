# `@proj-airi/config-shared`

This package owns the shared ConfigKV database, cache, and invalidation contracts.

## Use it for

- The `config_kv` PostgreSQL schema.
- Cache-aside reads through `cache:config:<key>`.
- The `configkv:invalidate` message contract.
- Shared cache key helpers and the default cache TTL.

## Do not use it for

- Config value schemas or application defaults.
- Config mutations from the AIRI API or Auth services.
- Admin disclosure, redaction, or authorization policy.

The Go admin backend is the only runtime writer. AIRI services use this package as a read-only persistence boundary.
