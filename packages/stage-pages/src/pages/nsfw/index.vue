<template>
  <div class="min-h-screen px-4 py-10 md:px-8">
    <div mx-auto max-w-5xl class="space-y-6">
      <section class="rounded-[2rem] bg-linear-to-br from-neutral-950 via-neutral-900 to-rose-950 px-6 py-8 text-white shadow-sm">
        <div class="max-w-3xl">
          <div class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] backdrop-blur">
            Separate NSFW Workspace
          </div>
          <h1 class="text-4xl font-semibold md:text-5xl">
            Keep NSFW separate from the normal product flow
          </h1>
          <p class="mt-4 max-w-2xl text-sm text-white/75 leading-6 md:text-base">
            This area is reserved for NSFW-specific routes, character controls, prompts, gallery behavior, and moderation policy so your regular companion UX stays clean.
          </p>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            Character Access
          </h2>
          <p class="mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
            Per-character NSFW enablement, explicitness level, and separate onboarding or gating.
          </p>
        </div>
        <div class="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            Prompt Layer
          </h2>
          <p class="mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
            Separate routing, style controls, and policy logic without mixing it into normal companion prompts.
          </p>
        </div>
        <div class="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 class="text-lg font-semibold">
            Gallery & Media
          </h2>
          <p class="mt-2 text-sm text-neutral-600 leading-6 dark:text-neutral-300">
            Reserved for image generation, galleries, and other NSFW-specific media workflows.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  title: NSFW Workspace
</route>
