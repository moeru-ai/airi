<script setup lang="ts">
import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AuthStepForms from '../components/AuthStepForms.vue'

import { createEnrollContext } from '../modules/email-auth-flow'
import { getServerAuthBootstrapContext } from '../modules/server-auth-context'

const { t } = useI18n()
const bootstrapContext = getServerAuthBootstrapContext()
const fallbackApiServerUrl = bootstrapContext?.apiServerUrl ?? SERVER_URL
const currentUrl = bootstrapContext?.currentUrl ?? window.location.href

const enrollContext = computed(() => createEnrollContext(currentUrl, fallbackApiServerUrl))

// NOTICE:
// The OIDC authorize URL Electron handed us as `continue` does NOT carry the
// enrollment token — `buildEnrollUrl` keeps `token` and `continue` as separate
// query params on the enroll page URL. Re-attach the single-use `enrollToken`
// here so that once the user authenticates (directly, or after email
// verification via the verify-email `continueURL`), the authorize choke point
// finds `enrollToken` in the query, consumes it, and links Steam. Without this
// the user would sign in but Steam would never be linked.
const resumeURL = computed(() => {
  const ctx = enrollContext.value
  if (!ctx)
    return ''
  const url = new URL(ctx.continueUrl)
  url.searchParams.set('enrollToken', ctx.enrollToken)
  return url.toString()
})
</script>

<template>
  <AuthStepForms
    v-if="enrollContext"
    scope="enroll"
    :api-server-url="enrollContext.apiServerUrl"
    :callback-url="resumeURL"
    :verify-continue-url="resumeURL"
  >
    <template #banner>
      <div :class="['mb-6 w-full max-w-sm rounded-xl p-4 bg-primary-500/10 dark:bg-primary-400/10']">
        <div :class="['text-center text-sm font-semibold text-primary-700 dark:text-primary-300']">
          {{ t('server.auth.enroll.banner.title') }}
        </div>
        <div :class="['mt-1 text-center text-xs text-primary-600/80 dark:text-primary-400/80']">
          {{ t('server.auth.enroll.banner.description') }}
        </div>
      </div>
    </template>
  </AuthStepForms>

  <main
    v-else
    :class="['min-h-screen flex flex-col items-center justify-center px-6 py-10 font-cuteen']"
  >
    <div :class="['mb-2 text-2xl font-bold']">
      {{ t('server.auth.enroll.error.invalidLink') }}
    </div>
    <p :class="['mb-6 max-w-sm text-center text-sm text-neutral-500']">
      {{ t('server.auth.enroll.error.invalidLinkDescription') }}
    </p>
    <RouterLink to="/sign-in" :class="['text-xs text-neutral-500 underline']">
      {{ t('server.auth.verifyEmail.action.backToSignIn') }}
    </RouterLink>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
