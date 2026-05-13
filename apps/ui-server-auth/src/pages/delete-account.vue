<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

// NOTICE:
// This page is a SUCCESS landing — better-auth's `/api/auth/delete-user/callback`
// performs the actual deletion server-side, then redirects here via the
// `callbackURL` we passed to `authClient.deleteUser`. By the time the user
// sees this page their session is already revoked and the user row is gone.
// Source: node_modules/better-auth/dist/api/routes/update-user.mjs L380.
//
// No "back to home" button: this page lives on the API-server origin and has
// no reliable way to point at the calling app (stage-web / stage-tamagotchi /
// stage-pocket) — the API server doesn't know where the product UI is
// deployed. Asking the user to close the tab is the simplest correct thing.
//
// Failure case (e.g. token expired, or `beforeDelete` handler threw): the
// server returns a JSON error response from `/delete-user/callback` instead
// of redirecting, so the user does not land here. Surfacing that gracefully
// is a follow-up — for v1 we accept the raw API JSON in the error path.
const { t } = useI18n()
const route = useRoute()

// Optional ?error param if a future server hook redirects failed deletions
// here with an explanatory string. Today this is always undefined.
const errorMessage = computed(() => {
  const value = route.query.error
  return typeof value === 'string' ? value : null
})
</script>

<template>
  <main
    :class="[
      'min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen',
    ]"
  >
    <div :class="['mb-6 text-2xl font-bold']">
      {{
        errorMessage
          ? t('server.auth.deleteAccount.title.failed')
          : t('server.auth.deleteAccount.title.success')
      }}
    </div>

    <div :class="['max-w-sm flex flex-col items-center gap-4 text-center text-sm']">
      <p
        v-if="!errorMessage"
        :class="['text-neutral-600 dark:text-neutral-300']"
      >
        {{ t('server.auth.deleteAccount.message.success') }}
      </p>
      <p
        v-else
        :class="['text-red-500']"
      >
        {{ errorMessage }}
      </p>

      <p
        v-if="!errorMessage"
        :class="['text-xs text-neutral-400 dark:text-neutral-500']"
      >
        {{ t('server.auth.deleteAccount.action.closeTab') }}
      </p>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
