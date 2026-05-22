/// <reference types="vite/client" />

// UnoCSS injects this virtual stylesheet at build time; declared so a plain
// side-effect import type-checks without pulling in UnoCSS's client types.
declare module 'virtual:uno.css' {}
