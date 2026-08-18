---
name: unocss
description: UnoCSS instant atomic CSS engine, superset of Tailwind CSS. Use when configuring UnoCSS, writing utility rules, shortcuts, or working with presets like Wind, Icons, Attributify.
metadata:
  author: Anthony Fu
  version: "2026.1.28"
  source: Generated from https://github.com/unocss/unocss, scripts located at https://github.com/antfu/skills
---

UnoCSS is an instant atomic CSS engine designed to be flexible and extensible. The core is un-opinionated - all CSS utilities are provided via presets. It's a superset of Tailwind CSS, so you can reuse your Tailwind knowledge for basic syntax usage.

**Important:** Before writing UnoCSS code, agents should check for `uno.config.*` or `unocss.config.*` files in the project root to understand what presets, rules, and shortcuts are available. If the project setup is unclear, avoid using attributify mode and other advanced features - stick to basic `class` usage.

> The skill is based on UnoCSS 66.x, generated at 2026-01-28.

## Core

| Topic | Description | Reference |
|-------|-------------|-----------|
| Configuration | Config file setup and all configuration options | [core-config](references/core-config.md) |
| Rules | Static and dynamic rules for generating CSS utilities | [core-rules](references/core-rules.md) |
| Shortcuts | Combine multiple rules into single shorthands | [core-shortcuts](references/core-shortcuts.md) |
| Theme | Theming system for colors, breakpoints, and design tokens | [core-theme](references/core-theme.md) |
| Variants | Apply variations like hover:, dark:, responsive to rules | [core-variants](references/core-variants.md) |
| Extracting | How UnoCSS extracts utilities from source code | [core-extracting](references/core-extracting.md) |
| Safelist & Blocklist | Force include or exclude specific utilities | [core-safelist](references/core-safelist.md) |
| Layers & Preflights | CSS layer ordering and raw CSS injection | [core-layers](references/core-layers.md) |

## Presets

### Main Presets

| Topic | Description | Reference |
|-------|-------------|-----------|
| Preset Wind3 | Tailwind CSS v3 / Windi CSS compatible preset (most common) | [preset-wind3](references/preset-wind3.md) |
| Preset Wind4 | Tailwind CSS v4 compatible preset with modern CSS features | [preset-wind4](references/preset-wind4.md) |
| Preset Mini | Minimal preset with essential utilities for custom builds | [preset-mini](references/preset-mini.md) |

### Feature Presets

| Topic | Description | Reference |
|-------|-------------|-----------|
| Preset Icons | Pure CSS icons using Iconify with any icon set | [preset-icons](references/preset-icons.md) |
| Preset Attributify | Group utilities in HTML attributes instead of class | [preset-attributify](references/preset-attributify.md) |
| Preset Typography | Prose classes for typographic defaults | [preset-typography](references/preset-typography.md) |
| Preset Web Fonts | Easy Google Fonts and other web fonts integration | [preset-web-fonts](references/preset-web-fonts.md) |
| Preset Tagify | Use utilities as HTML tag names | [preset-tagify](references/preset-tagify.md) |
| Preset Rem to Px | Convert rem units to px for utilities | [preset-rem-to-px](references/preset-rem-to-px.md) |

## Transformers

| Topic | Description | Reference |
|-------|-------------|-----------|
| Variant Group | Shorthand for grouping utilities with common prefixes | [transformer-variant-group](references/transformer-variant-group.md) |
| Directives | CSS directives: @apply, @screen, theme(), icon() | [transformer-directives](references/transformer-directives.md) |
| Compile Class | Compile multiple classes into one hashed class | [transformer-compile-class](references/transformer-compile-class.md) |
| Attributify JSX | Support valueless attributify in JSX/TSX | [transformer-attributify-jsx](references/transformer-attributify-jsx.md) |

## Integrations

| Topic | Description | Reference |
|-------|-------------|-----------|
| Vite Integration | Setting up UnoCSS with Vite and framework-specific tips | [integrations-vite](references/integrations-vite.md) |
| Nuxt Integration | UnoCSS module for Nuxt applications | [integrations-nuxt](references/integrations-nuxt.md) |
