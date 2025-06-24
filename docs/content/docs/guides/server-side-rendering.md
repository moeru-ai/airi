---
title: Server side rendering
description: Reka UI can be rendered on the server.
---

# Server side rendering

<Description>
Reka UI can be rendered on the server.
</Description>

## Overview

Server side rendering or `SSR`, is a technique used to render components to HTML on the server, as opposed to rendering them only on the client.

Static rendering is another similar approach. Instead it pre-renders pages to HTML at build time rather than on each request.

You should be able to use all of our primitives with both approaches, for example with [Nuxt.js](https://nuxt.com/).

## Nuxt Hydration issue (Vue < 3.5)

Reka UI offers a [Nuxt module](/docs/overview/installation.html#nuxt-modules) that supports auto importing components. However, if you are using Vue < 3.5, minor hydration issues might arise because as of vue <= 3.4 there is [currently no way](https://github.com/vuejs/rfcs/discussions/557) to ensure consistent DOM element `id` between the client and server renders. This is something that Reka UI relies on.

As a temporary workaround, we expose a way to allow Nuxt (with version > `3.10`) inject it's `useId` implementation to `reka-ui`.

To provide a custom `useId` implementation, please follow this [guide](/docs/utilities/config-provider.html#hydration-issue-vue-3-5).
