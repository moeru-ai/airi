# @proj-airi/memory-pgvector

Memory service for Project AIRI.

This package runs as a websocket module on top of `@proj-airi/server-runtime` and provides:

- durable memory storage backed by a local JSON file
- heuristic memory extraction from chat turns
- hybrid recall with lexical + vector scoring
- memory write, search, delete, stats, and consolidation events
- automatic working-memory and reflection summaries during consolidation
- episodic memory trimming so recall stays focused over time
- optional `context:update` emission so recalled memories can be injected into prompts

## Usage

```shell
pnpm -F @proj-airi/memory-pgvector dev
```

By default, the module stores memory data at `./data/memory-pgvector.json`.

To run a local smoke check for extraction and consolidation:

```shell
pnpm -F @proj-airi/memory-pgvector smoke
```

## Events

- `memory:upsert`
- `memory:search:request`
- `memory:delete`
- `memory:ingest:chat-turn`
- `memory:stats:request`
- `memory:consolidate:request`
