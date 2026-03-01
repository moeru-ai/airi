<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div
    :class="[
      'w-full px-2',
    ]"
  >
    <main :class="['grid gap-3']">
      <section :class="['grid gap-3 md:grid-cols-[minmax(220px,300px)_1fr]']">
        <RouterLink to="/v2/dashboard/characters">
          <article
            :class="[
              'min-h-[420px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
              'dark:border-neutral-800 dark:bg-neutral-900/70',
            ]"
          >
            <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
              Characters
            </h2>
          </article>
        </RouterLink>

        <article
          :class="[
            'min-h-[420px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Status Center
          </h2>
        </article>
      </section>

      <section :class="['grid gap-3 md:grid-cols-[minmax(220px,300px)_minmax(180px,240px)_1fr]']">
        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Settings
          </h2>
        </article>

        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Plugins
          </h2>
        </article>

        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Update Notes
          </h2>
        </article>
      </section>
    </main>

    <main :class="['grid gap-3']">
      <section :class="['grid gap-3 md:grid-cols-[minmax(220px,300px)_1fr]']">
        <RouterLink to="/v2/dashboard/characters">
          <article
            :class="[
              'min-h-[420px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
              'dark:border-neutral-800 dark:bg-neutral-900/70',
            ]"
          >
            <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
              Characters
            </h2>
          </article>
        </RouterLink>

        <article
          :class="[
            'min-h-[420px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Status Center
          </h2>
        </article>
      </section>

      <section :class="['grid gap-3 md:grid-cols-[minmax(220px,300px)_minmax(180px,240px)_1fr]']">
        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Settings
          </h2>
        </article>

        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Plugins
          </h2>
        </article>

        <article
          :class="[
            'min-h-[150px] rounded-2xl border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur',
            'dark:border-neutral-800 dark:bg-neutral-900/70',
          ]"
        >
          <h2 :class="['text-sm text-neutral-500 font-semibold uppercase tracking-[0.08em]']">
            Update Notes
          </h2>
        </article>
      </section>
    </main>
  </div>
</template>

<route lang="yaml">
meta:
  layout: desktop-wide
</route>
