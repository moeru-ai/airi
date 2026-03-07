# ADR 0000: Technology Stack Selection

## Status
Accepted

## Context
The project aims to build a "soul container" for AI virtual characters (like Neuro-sama) that runs on various platforms (Desktop, Web, Mobile) with high performance and low latency. The system requires real-time interaction, 3D/2D rendering, and integration with local/remote LLMs.

## Decision

We have decided to use the following technology stack:

### Monorepo & Build System
- **PNPM**: For efficient, disk-space-saving package management and workspace support.
- **Turbo**: For high-performance build orchestration and caching.
- **Nix**: For reproducible development environments.

### Frontend (Apps & UI)
- **Vue 3**: chosen for its reactivity system, performance, and ease of use, especially with `script setup`.
- **Vite**: For lightning-fast development server and optimized builds.
- **UnoCSS**: For atomic, on-demand CSS generation (performance and flexibility).
- **TypeScript**: For type safety across the entire codebase.

### Backend & Services
- **Hono**: A small, fast, and ultrafast web framework for the Edges.
- **Drizzle ORM**: A lightweight, type-safe ORM for SQL databases.
- **Node.js / Bun**: Runtime environment (depending on specific service needs).

### Core & Native (Desktop/Plugins)
- **Rust**: For high-performance core logic, system integrations, and AI inference (via `candle` etc.).
- **Tauri**: For building the desktop application with a small footprint and high security.

### AI & Machine Learning
- **Python**: For training, data processing, and some agent logic where Python ecosystem is dominant.
- **ONNX / Candle**: For running models efficiently on consumer hardware.

## Consequences

### Positive
- **Performance**: Rust and Vite ensure high performance for both the application and the development workflow.
- **Type Safety**: TypeScript and Rust provide strong type guarantees, reducing runtime errors.
- **Cross-Platform**: Web technologies + Tauri allow targeting Web, Windows, macOS, and Linux (and potentially Mobile via Capacitor/Tauri Mobile) from a single codebase.

### Negative
- **Learning Curve**: Requires knowledge of both TypeScript/Vue and Rust.
- **Complexity**: Monorepo management can be complex initially.

## Compliance
- This stack aligns with the project's goal of being a high-performance, open-source AI character platform.
