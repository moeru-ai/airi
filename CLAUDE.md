# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Project AIRI is an AI-powered virtual character platform that creates "cyber living beings" similar to Neuro-sama. It combines LLMs, speech synthesis, computer vision, and game integration to enable interactive virtual characters capable of playing games, chatting, and streaming.

The project is built with Web technologies (WebGPU, WebAudio, WebAssembly) and supports both browser and desktop deployment through Tauri.

## Common Development Commands

### Build Commands
- `pnpm build` - Build all packages and apps
- `pnpm build:packages` - Build packages only (runs automatically on postinstall)
- `pnpm build:apps` - Build all apps
- `pnpm build:web` - Build Stage Web (browser version)
- `pnpm build:tamagotchi` - Build Stage Tamagotchi (desktop version)
- `pnpm build:crates` - Build Rust workspace with cargo

### Development Commands
- `pnpm dev` - Start Stage Web development server (main web interface)
- `pnpm dev:tamagotchi` - Start Stage Tamagotchi desktop app development
- `pnpm dev:docs` - Start documentation site development
- `pnpm dev:ui` - Start UI component storybook
- `pnpm dev:packages` - Watch and rebuild packages in parallel
- `pnpm dev:apps` - Run all apps in development mode

### Testing & Quality Commands
- `pnpm test` - Run tests with coverage
- `pnpm test:run` - Run tests once (no watch mode)
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Auto-fix ESLint issues
- `pnpm lint:rust` - Check Rust code formatting and run clippy
- `pnpm typecheck` - Type-check TypeScript in all packages/apps/docs

### Service-Specific Commands
For Telegram bot:
- `pnpm -F @proj-airi/telegram-bot db:generate` - Generate database migrations
- `pnpm -F @proj-airi/telegram-bot db:push` - Apply database changes
- `pnpm -F @proj-airi/telegram-bot start` - Start the bot

For Discord/Minecraft bots:
- `pnpm -F @proj-airi/discord-bot start`
- `pnpm -F @proj-airi/minecraft-bot start`

## Architecture

### Workspace Structure
This is a monorepo using pnpm workspaces with Turbo for build orchestration:

- **`/apps`** - Main applications
  - `stage-web` - Browser-based UI at airi.moeru.ai
  - `stage-tamagotchi` - Desktop app using Tauri
  - `stage-tamagotchi-electron` - Alternative Electron-based desktop app
  - `realtime-audio` - Real-time audio processing app
  - `playground-prompt-engineering` - Prompt development playground

- **`/packages`** - Shared libraries
  - `stage-ui` - Main UI components and stage interface
  - `ui` - Base UI component library
  - `server-runtime` - Server runtime for integrations
  - `server-sdk` - SDK for server interactions
  - `audio` - Audio processing utilities
  - `ccc` - Character control components
  - `i18n` - Internationalization
  - `memory-pgvector` - Vector database memory implementation
  - `duckdb-wasm` - DuckDB WASM wrapper for browser database
  - `drizzle-duckdb-wasm` - Drizzle ORM driver for DuckDB

- **`/services`** - Integration services
  - `telegram-bot` - Telegram bot integration
  - `discord-bot` - Discord bot integration
  - `minecraft` - Minecraft game integration
  - `twitter-services` - Twitter integration

- **`/crates`** - Rust packages for Tauri plugins
  - `tauri-plugin-mcp` - Model Context Protocol plugin
  - `tauri-plugin-ipc-audio-*` - Audio processing plugins
  - `tauri-plugin-window-*` - Window management plugins

### Core Dependencies

The project uses modern web stack:
- **Vue 3** with Composition API for UI
- **TypeScript** for type safety
- **Vite** for bundling
- **UnoCSS** for styling
- **Tauri** for desktop apps (Rust + WebView)
- **ONNX Runtime** for browser-based ML inference
- **Three.js** for 3D graphics
- **Drizzle ORM** with DuckDB for browser database
- **xsAI** as LLM abstraction layer supporting multiple providers

### LLM Integration

The project supports extensive LLM providers through the xsAI library:
- OpenAI, Anthropic Claude, Google Gemini
- Open source: Ollama, vLLM, SGLang
- Cloud providers: OpenRouter, Together.ai, Groq, DeepSeek
- Regional providers: Zhipu, Baichuan, Moonshot AI (China)

### Key Technical Features

1. **Browser-First Architecture**: Core functionality runs in browser using WebGPU, WebAudio, WebAssembly
2. **Native Performance**: Desktop version uses NVIDIA CUDA and Apple Metal through Tauri
3. **Real-time Processing**: Voice activity detection, speech recognition, and synthesis
4. **3D Avatar Support**: VRM and Live2D model rendering with animations
5. **Game Integration**: Can play Minecraft and Factorio autonomously
6. **Memory System**: Vector database for context and memory management

## Development Guidelines

- Always run `pnpm lint && pnpm typecheck` before committing
- Use AVIF format for images (`pnpm to-avif <path>`)
- Follow existing code patterns - check neighboring files for conventions
- Never assume library availability - verify in package.json first
- The project uses `@antfu/eslint-config` with custom import sorting
- Git hooks run lint-staged on pre-commit
- When updating version, run `npx bumpp --no-commit --no-tag` then update Cargo.toml

## Important Notes

- Default `pnpm dev` starts the web version, not desktop
- Desktop development requires additional dependencies (see CONTRIBUTING.md)
- The project uses pnpm workspace catalogs for shared dependency versions
- Rust code is in `/crates` and `/apps/stage-tamagotchi/src-tauri`
- Services require environment configuration via `.env.local` files

## GitHub Workflow & CI/CD

### Fork Information
- Main repository: `moeru-ai/airi`
- My fork: `xuweizhengo/airi`
- When working on PRs, changes should be pushed to my fork first

### Monitoring GitHub Actions Builds
Use GitHub CLI to monitor and fix build failures:

```bash
# List recent workflow runs
gh run list --limit 5

# View failed logs for a specific run
gh run view <RUN_ID> --log-failed

# Check PR status
gh pr view <PR_NUMBER>

# Watch a running workflow
gh run watch <RUN_ID>
```

### Common Build Issues
1. **ESLint errors**: Check for formatting issues, especially after if statements requiring newlines
2. **TypeScript errors**: Verify type imports and enum usage
3. **Test failures**: Run `pnpm test:run` locally before pushing

### Working with PRs
```bash
# Checkout a PR for fixing
gh pr checkout <PR_NUMBER>

# After fixes, commit with --no-verify if lint-staged is not available
git commit -m "fix: description" --no-verify

# Push to fork
git push origin <branch-name>
```