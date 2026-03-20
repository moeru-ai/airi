<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useRouter } from 'vue-router'

const router = useRouter()

const memorySections = [
  {
    id: 'short-term',
    title: 'Short-Term Memory',
    subtitle: 'Recent daily summary blocks injected into prompt context',
    icon: 'i-solar:alarm-bold-duotone',
    accent: 'from-cyan-500/20 to-sky-500/10',
    route: '/settings/modules/memory-short-term',
    bullets: [
      'Per-character daily summary blocks',
      'Window-size and token-budget controls',
      'Manual rebuild from existing chat history',
    ],
  },
  {
    id: 'long-term',
    title: 'Long-Term Memory',
    subtitle: 'Append-only journal archive with on-demand lookup',
    icon: 'i-solar:notebook-bookmark-bold-duotone',
    accent: 'from-emerald-500/20 to-teal-500/10',
    route: '/settings/modules/memory-long-term',
    bullets: [
      'Per-character journal archive',
      'Keyword search over timestamped entries',
      'Append-only memory designed for later semantic search',
    ],
  },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="border border-neutral-200 rounded-2xl bg-neutral-100/90 p-5 dark:border-neutral-700 dark:bg-[rgba(0,0,0,0.26)]">
      <div class="mb-3 flex items-center gap-3">
        <div class="i-solar:leaf-bold-duotone text-2xl text-primary-500" />
        <div>
          <h2 class="text-lg text-neutral-700 md:text-2xl dark:text-neutral-200">
            Memory Is Character-Centric
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            AIRI memory is split into a recent context layer and a durable archive layer. Both should stay scoped to the active character instead of collapsing everyone into one global bucket.
          </p>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-3">
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Principle
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            Short-term memory builds session context. Long-term memory preserves raw history for later lookup.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Scope
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            Each character keeps their own memory trail, summaries, and archive results.
          </div>
        </div>
        <div class="border border-neutral-200 rounded-xl bg-white/80 p-4 dark:border-neutral-700 dark:bg-neutral-900/60">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Current State
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-200">
            These pages are UI prototypes with mock data so the product shape can be reviewed before storage and retrieval hooks land.
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section
        v-for="section in memorySections"
        :key="section.id"
        :class="[
          'rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/70',
        ]"
      >
        <div
          :class="[
            'mb-4 rounded-xl border border-white/30 bg-gradient-to-br p-4 dark:border-white/10',
            section.accent,
          ]"
        >
          <div class="mb-3 flex items-start gap-3">
            <div :class="[section.icon, 'text-2xl text-primary-500']" />
            <div>
              <h3 class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
                {{ section.title }}
              </h3>
              <p class="text-sm text-neutral-600 dark:text-neutral-300">
                {{ section.subtitle }}
              </p>
            </div>
          </div>

          <ul class="grid gap-2 text-sm text-neutral-700 dark:text-neutral-200">
            <li
              v-for="bullet in section.bullets"
              :key="bullet"
              class="flex items-start gap-2"
            >
              <div class="i-solar:check-circle-bold-duotone mt-0.5 text-base text-primary-500" />
              <span>{{ bullet }}</span>
            </li>
          </ul>
        </div>

        <div class="mb-4 border border-neutral-300 rounded-xl border-dashed bg-neutral-50/80 p-4 dark:border-neutral-700 dark:bg-neutral-950/40">
          <div class="mb-2 text-xs text-neutral-500 font-semibold tracking-wide uppercase dark:text-neutral-400">
            Review Goal
          </div>
          <p class="text-sm text-neutral-700 dark:text-neutral-200">
            Use this mock page to validate layout, language, and what testers instinctively expect to click before the real storage and tool hooks are implemented.
          </p>
        </div>

        <Button
          :label="`Open ${section.title}`"
          icon="i-solar:arrow-right-up-bold-duotone"
          variant="secondary"
          @click="router.push(section.route)"
        />
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
