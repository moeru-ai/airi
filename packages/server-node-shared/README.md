# `@proj-airi/server-node-shared`

Small Node.js infrastructure policies shared by independent AIRI backend
applications.

## Use it for

- PostgreSQL pool construction.
- External dependency boot retries.
- Environment schema primitives shared by multiple Node services.

```typescript
import { createDatabasePool, initializeExternalDependency } from '@proj-airi/server-node-shared'
```

## Do not use it for

- Auth or product domain contracts.
- HTTP routes or service composition roots.
- Browser, Electron renderer, or protocol code.

Applications retain ownership of their environment schemas, database
projections, process lifecycle, and business dependencies.
