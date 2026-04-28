<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { defaultSignInProviders } from '@proj-airi/stage-ui/components/auth'
import { authClient } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

type SectionId = 'profile' | 'security' | 'connections' | 'danger'

interface LinkedAccountItem {
  id: string
  providerId: string
  accountId: string
  createdAt: string
  scopes: string[]
}

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
// Gravatar fallback is decorated server-side onto `user.image`. We detect
// the fallback by URL prefix instead of carrying a redundant `imageSource`
// flag — Gravatar URL format is stable and prefix-matching keeps the API
// surface small. If the avatar source ever changes, both this constant
// and apps/server/src/libs/gravatar.ts must move together.
const GRAVATAR_AVATAR_PREFIX = 'https://www.gravatar.com/avatar/'
const usingGravatarFallback = computed(
  () => userAvatar.value?.startsWith(GRAVATAR_AVATAR_PREFIX) ?? false,
)
const gravatarProfileUrl = computed(() => {
  if (!usingGravatarFallback.value || !userEmail.value)
    return null
  return `https://gravatar.com/${encodeURIComponent(userEmail.value.trim().toLowerCase())}`
})

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
const connectionsSectionRef = ref<HTMLElement | null>(null)
const dangerSectionRef = ref<HTMLElement | null>(null)

function scrollToSection(id: SectionId) {
  activeSection.value = id
  // Settings layout owns a custom scroll container (#settings-scroll-container).
  // scrollIntoView walks up parents to find a scrollable ancestor, so it works
  // for both window-scroll pages and our inner-scroll layout without a special
  // case here.
  const targets: Record<SectionId, HTMLElement | null> = {
    profile: profileSectionRef.value,
    security: securitySectionRef.value,
    connections: connectionsSectionRef.value,
    danger: dangerSectionRef.value,
  }
  targets[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Connected accounts state. Loaded on mount and re-loaded after each
// link/unlink so the row state matches reality without optimistic guessing.
const linkedAccounts = shallowRef<LinkedAccountItem[]>([])
const linkedAccountsLoading = shallowRef(true)
const linkedAccountsError = shallowRef<string | null>(null)
const linkedAccountsMessage = shallowRef<string | null>(null)
const linkActionInFlight = shallowRef<string | null>(null)

const linkedAccountsByProvider = computed(() => {
  const map = new Map<string, LinkedAccountItem>()
  for (const account of linkedAccounts.value)
    map.set(account.providerId, account)
  return map
})

const hasCredentialAccount = computed(() => linkedAccountsByProvider.value.has('credential'))
const socialLinkedCount = computed(
  () => linkedAccounts.value.filter(a => a.providerId !== 'credential').length,
)

const connectionsDateFormatter = computed(() => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  }
  catch {
    return null
  }
})

function formatLinkedSince(iso: string): string {
  if (!iso)
    return ''
  const formatter = connectionsDateFormatter.value
  if (!formatter)
    return iso
  try {
    return formatter.format(new Date(iso))
  }
  catch {
    return iso
  }
}

async function refreshLinkedAccounts() {
  linkedAccountsLoading.value = true
  linkedAccountsError.value = null
  try {
    const { data, error } = await authClient.listAccounts()
    if (error)
      throw new Error(error.message ?? 'listAccounts failed')

    if (!data) {
      linkedAccounts.value = []
      return
    }

    // NOTICE: better-auth's `listAccounts` typing in v1.6.6 widens each
    // array element to `any` (the OpenAPI schema is `type: object` without
    // field generics). We accept that and consume the row directly — re-
    // typing it inline as `Record<string, unknown>` would just dress the
    // `any` up without giving us real safety. Field shape mirrors the
    // server response at
    // node_modules/better-auth/dist/api/routes/account.mjs L20-50.
    linkedAccounts.value = data.map(account => ({
      id: account.id,
      accountId: account.accountId,
      providerId: account.providerId,
      createdAt: account.createdAt instanceof Date
        ? account.createdAt.toISOString()
        : account.createdAt,
      scopes: account.scopes ?? [],
    }))
  }
  catch (error) {
    linkedAccounts.value = []
    linkedAccountsError.value = errorMessageFrom(error) ?? t('settings.pages.account.connections.error.listFailed')
  }
  finally {
    linkedAccountsLoading.value = false
  }
}

function isLastSignInMethod(providerId: string): boolean {
  if (providerId === 'credential')
    return socialLinkedCount.value === 0
  return !hasCredentialAccount.value && socialLinkedCount.value <= 1
}

async function handleUnlinkProvider(providerId: string) {
  if (linkActionInFlight.value)
    return

  if (isLastSignInMethod(providerId)) {
    linkedAccountsError.value = t('settings.pages.account.connections.error.lastAccount')
    linkedAccountsMessage.value = null
    return
  }

  const providerName = defaultSignInProviders.find(p => p.id === providerId)?.name ?? providerId
  linkActionInFlight.value = providerId
  linkedAccountsError.value = null
  linkedAccountsMessage.value = null

  try {
    const { error } = await authClient.unlinkAccount({ providerId })
    if (error)
      throw new Error(error.message ?? 'unlinkAccount failed')

    linkedAccountsMessage.value = t('settings.pages.account.connections.message.unlinked', { provider: providerName })
    await refreshLinkedAccounts()
  }
  catch (error) {
    linkedAccountsError.value = errorMessageFrom(error) ?? t('settings.pages.account.connections.error.unlinkFailed')
  }
  finally {
    linkActionInFlight.value = null
  }
}

async function handleLinkProvider(providerId: 'github' | 'google') {
  if (linkActionInFlight.value)
    return

  const providerName = defaultSignInProviders.find(p => p.id === providerId)?.name ?? providerId
  linkActionInFlight.value = providerId
  linkedAccountsError.value = null
  linkedAccountsMessage.value = t('settings.pages.account.connections.message.linkStarted', { provider: providerName })

  try {
    // Round-trip back to /settings/account so the freshly linked provider
    // shows up as soon as the OAuth dance returns.
    const callbackURL = new URL('/settings/account', window.location.origin).toString()
    const { data, error } = await authClient.linkSocial({ provider: providerId, callbackURL })
    if (error)
      throw new Error(error.message ?? 'linkSocial failed')

    if (data?.url) {
      window.location.assign(data.url)
      return
    }

    // No URL came back (e.g. provider returned status: true synchronously) —
    // treat as success and reload the list.
    await refreshLinkedAccounts()
    linkedAccountsMessage.value = t('settings.pages.account.connections.message.linked', { provider: providerName })
  }
  catch (error) {
    linkedAccountsError.value = errorMessageFrom(error) ?? t('settings.pages.account.connections.error.linkFailed')
    linkedAccountsMessage.value = null
  }
  finally {
    linkActionInFlight.value = null
  }
}

onMounted(() => {
  // Defer the call to the next tick so the auth store's bearer token is
  // already wired up by the time better-auth's authClient fires.
  if (isAuthenticated.value)
    refreshLinkedAccounts()
})

watch(isAuthenticated, (next) => {
  if (next)
    refreshLinkedAccounts()
  else
    linkedAccounts.value = []
})

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
            v-for="section in ['profile', 'security', 'connections', 'danger'] as SectionId[]"
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
                <p
                  v-if="usingGravatarFallback"
                  :class="['text-xs text-neutral-500 dark:text-neutral-400 mt-1']"
                >
                  <span>{{ t('settings.pages.account.profile.avatar.gravatarNotice') }}</span>
                  <a
                    v-if="gravatarProfileUrl"
                    :href="gravatarProfileUrl"
                    target="_blank"
                    rel="noreferrer"
                    :class="['ml-1 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-300']"
                  >
                    {{ t('settings.pages.account.profile.avatar.gravatarLink') }}
                  </a>
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

          <!-- Connected accounts section. Lives between Security and Danger
               because it's identity-adjacent (which providers can authenticate
               you) and reversible — unlinking and re-linking is a routine
               account hygiene task, not a destructive one. -->
          <section
            ref="connectionsSectionRef"
            :class="['flex flex-col gap-4 py-8 border-b border-neutral-200/70 dark:border-neutral-800/60']"
          >
            <header :class="['flex flex-col gap-1']">
              <h3 :class="['text-lg font-semibold']">
                {{ t('settings.pages.account.connections.title') }}
              </h3>
              <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.account.connections.description') }}
              </p>
            </header>

            <div
              v-if="linkedAccountsLoading"
              :class="['text-sm text-neutral-500 dark:text-neutral-400']"
            >
              {{ t('settings.pages.account.connections.message.loading') }}
            </div>

            <ul v-else :class="['flex flex-col gap-2 max-w-md']">
              <li
                v-for="provider in defaultSignInProviders"
                :key="provider.id"
                :class="[
                  'flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2',
                ]"
              >
                <div :class="['flex items-center gap-2 min-w-0']">
                  <span :class="[provider.icon, 'h-5 w-5 shrink-0']" aria-hidden="true" />
                  <div :class="['flex flex-col min-w-0']">
                    <span :class="['truncate text-sm font-medium']">{{ provider.name }}</span>
                    <span :class="['truncate text-xs text-neutral-500 dark:text-neutral-400']">
                      <template v-if="linkedAccountsByProvider.get(provider.id)">
                        {{
                          t('settings.pages.account.connections.status.linkedSince', {
                            date: formatLinkedSince(linkedAccountsByProvider.get(provider.id)!.createdAt),
                          })
                        }}
                      </template>
                      <template v-else>
                        {{ t('settings.pages.account.connections.status.notLinked') }}
                      </template>
                    </span>
                  </div>
                </div>

                <Button
                  v-if="linkedAccountsByProvider.get(provider.id)"
                  variant="secondary"
                  :class="['shrink-0 px-3 py-1 text-xs']"
                  :loading="linkActionInFlight === provider.id"
                  :disabled="!!linkActionInFlight && linkActionInFlight !== provider.id"
                  :label="t('settings.pages.account.connections.action.unlink')"
                  @click="handleUnlinkProvider(provider.id)"
                />
                <Button
                  v-else
                  :class="['shrink-0 px-3 py-1 text-xs']"
                  :loading="linkActionInFlight === provider.id"
                  :disabled="!!linkActionInFlight && linkActionInFlight !== provider.id"
                  :label="t('settings.pages.account.connections.action.link')"
                  @click="handleLinkProvider(provider.id)"
                />
              </li>
            </ul>

            <div
              v-if="linkedAccountsError"
              :class="['text-sm text-red-500']"
              role="alert"
              aria-live="polite"
            >
              {{ linkedAccountsError }}
            </div>
            <div
              v-else-if="linkedAccountsMessage"
              :class="['text-sm text-green-600 dark:text-green-400']"
              aria-live="polite"
            >
              {{ linkedAccountsMessage }}
            </div>
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
