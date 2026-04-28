<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

type SectionId = 'profile' | 'security' | 'danger'

const emit = defineEmits<{
  login: []
  logout: []
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, credits } = storeToRefs(authStore)

const userName = computed(() => user.value?.name ?? '')
const userEmail = computed(() => user.value?.email ?? null)
const userAvatar = computed(() => user.value?.image ?? null)

// Track avatar load failure so we can fall back to the placeholder icon
// instead of rendering an alt-text overflow inside the circle. Resets when
// the URL changes so a fixed URL re-attempts loading.
const avatarLoadError = ref(false)
watch(userAvatar, () => { avatarLoadError.value = false })

// Locale-aware thousand separator. Bare 5–6 digit numbers are noisy to scan
// (e.g. "44965" reads as one block); Intl.NumberFormat respects user locale
// (44,965 / 44 965 / 44.965 depending on region) without us having to ship a
// formatter.
const formattedCredits = computed(() => credits.value.toLocaleString())

// Profile form. Initialized from store and re-synced when user changes (e.g.
// after a successful save we mutate the store).
// NOTICE:
// Avatar editing is intentionally absent here pending the avatar-upload
// feature (R2/MinIO presigned PUT pipeline). The previous URL-pasting input
// was a placeholder UX and has been removed; the existing user.image is
// still rendered as the avatar circle above, just not editable for now.
const profileForm = reactive({ name: '' })

watch(
  user,
  (next) => {
    profileForm.name = next?.name ?? ''
  },
  { immediate: true },
)

const profileLoading = shallowRef(false)
const profileError = shallowRef<string | null>(null)
const profileSuccess = shallowRef<string | null>(null)

const profileDirty = computed(() => {
  if (!user.value)
    return false
  const name = profileForm.name.trim()
  if (!name)
    return false
  return name !== (user.value.name ?? '')
})

// Security form: change password.
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordLoading = shallowRef(false)
const passwordError = shallowRef<string | null>(null)
const passwordSuccess = shallowRef<string | null>(null)

// Sidebar active section. Click jumps + highlights; we don't observe scroll
// position because the page is short enough that simple click → scroll is
// sufficient and easier to reason about.
const activeSection = ref<SectionId>('profile')
const profileSectionRef = ref<HTMLElement | null>(null)
const securitySectionRef = ref<HTMLElement | null>(null)
const dangerSectionRef = ref<HTMLElement | null>(null)

function scrollToSection(id: SectionId) {
  activeSection.value = id
  const target
    = id === 'profile'
      ? profileSectionRef.value
      : id === 'security'
        ? securitySectionRef.value
        : dangerSectionRef.value
  // Settings layout owns a custom scroll container (#settings-scroll-container).
  // scrollIntoView walks up parents to find a scrollable ancestor, so it works
  // for both window-scroll pages and our inner-scroll layout without a special
  // case here.
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function handleSaveProfile(event: Event) {
  event.preventDefault()
  if (profileLoading.value || !profileDirty.value)
    return

  profileError.value = null
  profileSuccess.value = null
  profileLoading.value = true

  const trimmedName = profileForm.name.trim()

  try {
    const { error } = await authClient.updateUser({
      name: trimmedName,
    })
    if (error)
      throw new Error(error.message ?? 'updateUser failed')

    if (user.value) {
      authStore.user = {
        ...user.value,
        name: trimmedName,
      }
    }
    profileForm.name = trimmedName
    profileSuccess.value = t('settings.pages.account.profile.message.saved')
  }
  catch (error) {
    profileError.value = errorMessageFrom(error) ?? t('settings.pages.account.profile.error.fallback')
  }
  finally {
    profileLoading.value = false
  }
}

async function handleChangePassword(event: Event) {
  event.preventDefault()
  if (passwordLoading.value)
    return

  passwordError.value = null
  passwordSuccess.value = null

  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = t('settings.pages.account.security.error.passwordMismatch')
    return
  }
  if (passwordForm.next === passwordForm.current) {
    passwordError.value = t('settings.pages.account.security.error.passwordSameAsCurrent')
    return
  }

  passwordLoading.value = true
  try {
    const { error } = await authClient.changePassword({
      currentPassword: passwordForm.current,
      newPassword: passwordForm.next,
      revokeOtherSessions: true,
    })
    if (error)
      throw new Error(error.message ?? 'changePassword failed')

    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    passwordSuccess.value = t('settings.pages.account.security.message.changed')
  }
  catch (error) {
    passwordError.value = errorMessageFrom(error) ?? t('settings.pages.account.security.error.fallback')
  }
  finally {
    passwordLoading.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'p-4']">
    <template v-if="isAuthenticated">
      <!-- 2-col layout on md+; pure single-column on mobile. The sidebar is
           navigation chrome that adds noise on small viewports — sections are
           short enough to scroll through directly. Sign-out lives at the page
           foot as a standalone action so it doesn't share visual real estate
           with the destructive Danger Zone tab. -->
      <div :class="['flex flex-col md:grid md:grid-cols-[180px_minmax(0,1fr)] md:items-start gap-8']">
        <!-- Sidebar / section nav (desktop only). Logout sits at the foot,
             separated by a divider — it's an action, not a section anchor, so
             the visual break prevents users from reading it as just another
             section like Profile / Security / Danger. -->
        <aside :class="['hidden md:flex flex-col gap-1 md:sticky md:top-2']">
          <button
            v-for="section in ['profile', 'security', 'danger'] as SectionId[]"
            :key="section"
            type="button"
            :class="[
              'w-full text-left rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer',
              activeSection === section
                ? section === 'danger'
                  ? 'bg-red-100/70 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-primary-100/70 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                : section === 'danger'
                  ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/60',
            ]"
            @click="scrollToSection(section)"
          >
            {{ t(`settings.pages.account.${section}.tab`) }}
          </button>

          <div :class="['my-2 border-t border-neutral-200/70 dark:border-neutral-800/60']" />

          <button
            type="button"
            :class="[
              'w-full text-left rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer',
              'flex items-center gap-2',
              'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60',
            ]"
            @click="emit('logout')"
          >
            <div :class="['i-solar:logout-3-bold-duotone', 'size-4 flex-shrink-0']" />
            {{ t('settings.pages.account.logout') }}
          </button>
        </aside>

        <!-- Main column. max-w-3xl keeps long lines (descriptions, the Flux
             card) within a comfortable reading column instead of stretching
             across the full settings viewport. -->
        <div :class="['flex flex-col min-w-0 max-w-3xl']">
          <!-- Identity + Flux. Combined into a single divider-separated
               section so the page reads as: account-info | profile | security
               | danger. Earlier version split identity (no border) and flux
               (border-b) into two visual blocks, which read as "Flux is its
               own section like Profile/Security" — but Flux is metadata
               about the same account, not a separate concern. -->
          <section :class="['flex flex-col gap-3 pb-6 border-b border-neutral-200/70 dark:border-neutral-800/60']">
            <div :class="['flex items-center gap-4 py-2']">
              <div :class="['size-16 sm:size-20 rounded-full overflow-hidden flex-shrink-0', 'bg-neutral-100 dark:bg-neutral-800', 'flex items-center justify-center']">
                <img
                  v-if="userAvatar && !avatarLoadError"
                  :src="userAvatar"
                  :alt="userName"
                  :class="['size-full object-cover']"
                  @error="avatarLoadError = true"
                >
                <div v-else :class="['i-solar:user-circle-bold-duotone', 'size-10 text-neutral-400']" />
              </div>
              <div :class="['flex flex-col gap-0.5 min-w-0']">
                <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                  {{ t('settings.pages.account.signedInAs') }}
                </span>
                <h2 :class="['text-lg sm:text-xl font-semibold truncate']">
                  {{ userName || t('settings.pages.account.profile.name.placeholder') }}
                </h2>
                <p
                  v-if="userEmail"
                  :class="['text-sm text-neutral-500 dark:text-neutral-400 truncate']"
                >
                  {{ userEmail }}
                </p>
              </div>
            </div>

            <!-- Flux row — quiet inline metadata. Hover bg only on hover so at
                 rest it reads as plain text (not a button); chevron + colored
                 link text are the only navigability hints. -->
            <RouterLink
              to="/settings/flux"
              :class="[
                '-mx-2 flex items-center gap-2 px-2 py-1.5 rounded-md',
                'text-sm no-underline text-inherit',
                'hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors',
              ]"
            >
              <span :class="['text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.fluxBalance') }}
              </span>
              <span :class="['font-semibold tabular-nums']">
                {{ formattedCredits }}
              </span>
              <span :class="['ml-auto flex items-center gap-1 text-primary-600 dark:text-primary-400']">
                <span>{{ t('settings.pages.account.viewFluxDetails') }}</span>
                <div :class="['i-solar:alt-arrow-right-linear', 'size-4']" />
              </span>
            </RouterLink>
          </section>

          <!-- Profile section. No card outline — sections are separated by a
               bottom divider + generous padding so the page reads as a single
               surface rather than stacked boxes. Form chrome is constrained to
               max-w-md so display-name / URL fields don't sprawl across the
               viewport. -->
          <section
            ref="profileSectionRef"
            :class="['flex flex-col gap-4 py-8 border-b border-neutral-200/70 dark:border-neutral-800/60']"
          >
            <header :class="['flex flex-col gap-1']">
              <h3 :class="['text-lg font-semibold']">
                {{ t('settings.pages.account.profile.title') }}
              </h3>
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.profile.description') }}
              </p>
            </header>

            <form :class="['flex flex-col gap-3 max-w-md']" @submit="handleSaveProfile">
              <FieldInput
                v-model="profileForm.name"
                type="text"
                :label="t('settings.pages.account.profile.name.label')"
                :placeholder="t('settings.pages.account.profile.name.placeholder')"
              />

              <div
                v-if="profileError"
                :class="['text-sm text-red-500']"
                role="alert"
                aria-live="polite"
              >
                {{ profileError }}
              </div>
              <div
                v-else-if="profileSuccess"
                :class="['text-sm text-green-600 dark:text-green-400']"
                aria-live="polite"
              >
                {{ profileSuccess }}
              </div>

              <div :class="['flex justify-start']">
                <Button
                  type="submit"
                  :loading="profileLoading"
                  :disabled="!profileDirty"
                  :label="t('settings.pages.account.profile.action.save')"
                />
              </div>
            </form>
          </section>

          <!-- Security section. Same treatment as Profile — borderless,
               divider-separated, form constrained to readable column width. -->
          <section
            ref="securitySectionRef"
            :class="['flex flex-col gap-4 py-8 border-b border-neutral-200/70 dark:border-neutral-800/60']"
          >
            <header :class="['flex flex-col gap-1']">
              <h3 :class="['text-lg font-semibold']">
                {{ t('settings.pages.account.security.title') }}
              </h3>
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.security.description') }}
              </p>
            </header>

            <form :class="['flex flex-col gap-3 max-w-md']" @submit="handleChangePassword">
              <FieldInput
                v-model="passwordForm.current"
                type="password"
                :label="t('settings.pages.account.security.currentPassword.label')"
                :placeholder="t('settings.pages.account.security.currentPassword.placeholder')"
                required
                hide-required-mark
                autocomplete="current-password"
              />
              <FieldInput
                v-model="passwordForm.next"
                type="password"
                :label="t('settings.pages.account.security.newPassword.label')"
                :placeholder="t('settings.pages.account.security.newPassword.placeholder')"
                required
                hide-required-mark
                autocomplete="new-password"
              />
              <FieldInput
                v-model="passwordForm.confirm"
                type="password"
                :label="t('settings.pages.account.security.confirmPassword.label')"
                :placeholder="t('settings.pages.account.security.confirmPassword.placeholder')"
                required
                hide-required-mark
                autocomplete="new-password"
              />

              <div
                v-if="passwordError"
                :class="['text-sm text-red-500']"
                role="alert"
                aria-live="polite"
              >
                {{ passwordError }}
              </div>
              <div
                v-else-if="passwordSuccess"
                :class="['text-sm text-green-600 dark:text-green-400']"
                aria-live="polite"
              >
                {{ passwordSuccess }}
              </div>

              <div :class="['flex justify-start']">
                <Button
                  type="submit"
                  :loading="passwordLoading"
                  :label="t('settings.pages.account.security.action.changePassword')"
                />
              </div>
            </form>
          </section>

          <!-- Danger zone. Same divider-based section style as Profile /
               Security; semantic weight comes from the red header text and the
               variant="danger" button, not nested boxes. Trailing border-b
               separates the destructive group from the quiet sign-out utility
               below — without it the logout row visually attaches to delete
               account, blurring the boundary between "reversible" and
               "destructive". -->
          <section
            ref="dangerSectionRef"
            :class="['flex flex-col gap-4 py-8 border-b border-neutral-200/70 dark:border-neutral-800/60']"
          >
            <header :class="['flex flex-col gap-1']">
              <h3 :class="['text-lg font-semibold text-red-600 dark:text-red-400']">
                {{ t('settings.pages.account.danger.title') }}
              </h3>
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.danger.description') }}
              </p>
            </header>

            <!-- TODO: Wire up delete-account once server enables
                 user.deleteUser in better-auth config. The endpoint sends a
                 confirmation email and revokes all sessions, so the UX needs
                 a confirmation modal + post-delete redirect. -->
            <div :class="['flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3']">
              <div :class="['flex flex-col gap-0.5 min-w-0']">
                <span :class="['text-sm font-medium']">
                  {{ t('settings.pages.account.danger.deleteAccount.title') }}
                </span>
                <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                  {{ t('settings.pages.account.danger.deleteAccount.description') }}
                </span>
              </div>
              <div :class="['flex-shrink-0']">
                <Button
                  variant="danger"
                  disabled
                  :title="t('settings.pages.account.danger.deleteAccount.notAvailable')"
                  :label="t('settings.pages.account.danger.deleteAccount.action')"
                />
              </div>
            </div>
          </section>

          <!-- Sign out at the page foot — mobile-only fallback because the
               sidebar (which owns logout on desktop) is hidden on small
               viewports. Kept outside the Danger Zone because logging out is
               reversible (just sign back in) — putting it in the destructive
               group would over-signal severity. -->
          <div :class="['md:hidden pt-2']">
            <button
              type="button"
              :class="[
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer',
                'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60',
                'transition-colors',
              ]"
              @click="emit('logout')"
            >
              <div :class="['i-solar:logout-3-bold-duotone', 'size-4']" />
              {{ t('settings.pages.account.logout') }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div :class="['flex flex-col items-center gap-6', 'rounded-xl p-8', 'bg-neutral-50 dark:bg-neutral-900']">
        <div :class="['i-solar:user-circle-bold-duotone', 'size-16 text-neutral-300 dark:text-neutral-600']" />
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400', 'text-center max-w-xs']">
          {{ t('settings.pages.account.notLoggedIn') }}
        </p>
        <button
          :class="[
            'rounded-lg py-2.5 px-6',
            'text-sm font-medium',
            'text-white',
            'bg-primary-500 hover:bg-primary-600',
            'transition-colors cursor-pointer',
          ]"
          @click="emit('login')"
        >
          {{ t('settings.pages.account.login') }}
        </button>
      </div>
    </template>
  </div>
</template>
