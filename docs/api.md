# API Documentation

This document outlines the API endpoints and usage for the AIRI project.

## Overview

The API is built using [Hono](https://hono.dev/) and provides endpoints for:
- Chat interactions
- Memory retrieval/storage
- Configuration management
- Plugin system

## Endpoints

*(This section is automatically generated or will be updated as the API evolves)*

### Chat

- `POST /api/chat`: Send a message to the character.
- `GET /api/history`: Retrieve chat history.

### Memory

- `POST /api/memory/add`: Add a new memory.
- `GET /api/memory/search`: Search memories by semantic similarity.

## Authentication

Authentication is handled via Bearer tokens. Please refer to the [Auth Guide](./auth.md) (TBD).

## Interactive Documentation

If running the development server, you can access the Swagger UI at:
`http://localhost:3000/docs` (Example URL, please check local config)
