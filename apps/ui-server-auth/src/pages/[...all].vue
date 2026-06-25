<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <main
    :class="[
      'min-h-screen w-full',
      'flex items-center justify-center',
      'bg-neutral-50 px-6 py-10 text-neutral-900',
      'dark:bg-neutral-950 dark:text-neutral-50',
    ]"
  >
    <section
      :class="[
        'w-full max-w-sm',
        'flex flex-col items-center gap-6 text-center',
      ]"
    >
      <div
        :class="[
          'flex flex-col items-center gap-3',
        ]"
      >
        <p
          :class="[
            'text-sm font-medium text-neutral-500 uppercase tracking-wide',
            'dark:text-neutral-400',
          ]"
        >
          404
        </p>
        <h1
          :class="[
            'text-2xl font-semibold',
          ]"
        >
          Page not found
        </h1>
        <p
          :class="[
            'text-sm leading-6 text-neutral-600',
            'dark:text-neutral-300',
          ]"
        >
          This auth page does not exist.
        </p>
      </div>

      <div
        :class="[
          'flex flex-wrap items-center justify-center gap-3',
        ]"
      >
        <Button @click="router.push('/sign-in')">
          Sign in
        </Button>
        <Button variant="secondary" @click="router.go(-1)">
          Go back
        </Button>
      </div>
    </section>
  </main>
</template>
