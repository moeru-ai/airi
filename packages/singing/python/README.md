# airi-singing-worker

Python model runtime for the AIRI singing voice conversion pipeline.

## Setup

```bash
uv sync
# or
pip install -e .
```

## Usage

```bash
airi-singing --help
```

This worker is invoked by the TypeScript orchestrator in `@proj-airi/singing`
via subprocess calls. It is not intended to be used standalone in production.
