<script setup lang="ts">
import type { SettingsNeedsAttentionItem } from '../../../composables/use-settings-needs-attention'

import { Button, GhostButton, TransitionVertical } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** The providers whose last check failed. The section shows nothing when the list is empty. */
  items: SettingsNeedsAttentionItem[]
}>()

const emit = defineEmits<{
  /** The person wants to change the provider. Open its settings page. */
  fix: [item: SettingsNeedsAttentionItem]
  /** The person dismissed the provider. */
  dismiss: [item: SettingsNeedsAttentionItem]
}>()

/** The most provider icons that the summary shows on top of each other. */
const MAX_FACES = 4

const { t, locale } = useI18n()
const open = shallowRef(false)

/** Providers whose image did not load. Their module icon shows instead. */
const fallbackIds = shallowRef(new Set<string>())

function useFallbackIcon(id: string) {
  if (!fallbackIds.value.has(id))
    fallbackIds.value = new Set([...fallbackIds.value, id])
}

function iconOf(item: SettingsNeedsAttentionItem) {
  return fallbackIds.value.has(item.id) ? item.fallbackIcon : (item.icon ?? (item.iconImage ? undefined : item.fallbackIcon))
}

function imageOf(item: SettingsNeedsAttentionItem) {
  return fallbackIds.value.has(item.id) || item.icon ? undefined : item.iconImage
}

function listOf(names: string[]) {
  return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(names)
}

const single = computed(() => props.items.length === 1 ? props.items[0] : undefined)
const modules = computed(() => [...new Set(props.items.flatMap(item => item.modules))])
const title = computed(() => props.items.length === 1
  ? t('settings.needs-attention.title-one', { name: props.items[0]?.name ?? '' })
  : t('settings.needs-attention.title-many', { count: props.items.length }))
const summary = computed(() => {
  if (modules.value.length)
    return t('settings.needs-attention.affects', { modules: listOf(modules.value) })
  return t('settings.needs-attention.unused-many')
})

/** One quiet line under a provider name: the reason of the check, and the modules that use the provider, if any. */
function detailOf(item: SettingsNeedsAttentionItem) {
  const usedBy = item.modules.length ? t('settings.needs-attention.used-by', { modules: listOf(item.modules) }) : ''
  return [item.reason, usedBy].filter(Boolean).join(' · ')
}
</script>

<template>
  <section
    v-if="items.length"
    :aria-label="title"
    :class="[
      'settings-needs-attention',
      'relative isolate overflow-hidden',
      'rounded-xl bg-neutral-50 dark:bg-neutral-900',
    ]"
  >
    <!-- One provider: the row itself holds the reason and the actions, so nothing repeats in a list below. -->
    <div v-if="single" :class="['flex flex-wrap items-center gap-x-3 gap-y-2', 'px-3.5 py-3']">
      <span
        :class="[
          'size-7 shrink-0 self-start rounded-full',
          'grid place-items-center',
          'bg-neutral-100 dark:bg-neutral-800',
        ]"
      >
        <img v-if="imageOf(single)" :src="imageOf(single)" alt="" :class="['size-4 object-contain']" @error="useFallbackIcon(single.id)">
        <span v-else :class="['size-4', iconOf(single)]" />
      </span>
      <div :class="['min-w-48 flex-1']">
        <div :class="['text-base']">
          {{ title }}
        </div>
        <div v-if="detailOf(single)" :class="['mt-0.5 text-sm text-neutral-500 dark:text-neutral-400', 'break-words line-clamp-2']">
          {{ detailOf(single) }}
        </div>
      </div>
      <div :class="['ml-auto flex shrink-0 items-center gap-1']">
        <Button size="sm" :label="t('settings.needs-attention.fix')" @click="emit('fix', single)" />
        <GhostButton size="sm" @click="emit('dismiss', single)">
          {{ t('settings.needs-attention.dismiss') }}
        </GhostButton>
      </div>
    </div>

    <!-- More providers: one line sums them up, and it opens the list with the reasons and the actions. -->
    <template v-else>
      <button
        type="button"
        :aria-expanded="open"
        :class="[
          'settings-needs-attention-summary',
          'relative isolate w-full',
          'flex items-center gap-3',
          'px-3.5 py-3 text-left',
          'outline-none focus-visible:outline-2 focus-visible:outline-primary-300 focus-visible:outline-offset--2 focus-visible:outline-solid',
          'rounded-xl',
        ]"
        @click="open = !open"
      >
        <span :class="['flex shrink-0']">
          <span
            v-for="item in items.slice(0, MAX_FACES)"
            :key="item.id"
            :class="[
              'settings-needs-attention-face',
              'size-7 rounded-full',
              'grid place-items-center',
              'bg-neutral-100 dark:bg-neutral-800',
              'ring-2 ring-neutral-50 dark:ring-neutral-900',
            ]"
          >
            <img v-if="imageOf(item)" :src="imageOf(item)" alt="" :class="['size-4 object-contain']" @error="useFallbackIcon(item.id)">
            <span v-else :class="['size-4', iconOf(item)]" />
          </span>
        </span>
        <span :class="['min-w-0 flex-1']">
          <span :class="['settings-needs-attention-title', 'block text-base', 'transition-colors duration-300 ease-in-out']">
            {{ title }}
          </span>
          <span :class="['block text-sm text-neutral-500 dark:text-neutral-400']">
            {{ summary }}
          </span>
        </span>
        <span
          :class="[
            'i-solar:alt-arrow-down-linear',
            'size-4 shrink-0',
            'text-neutral-400 dark:text-neutral-500',
            'transition-transform duration-300 ease-in-out',
            open ? 'rotate-180' : 'rotate-0',
          ]"
        />
      </button>

      <TransitionVertical>
        <ul v-if="open" :class="['m-0 list-none', 'px-1.5 pb-2']">
          <li
            v-for="item in items"
            :key="item.id"
            :class="['flex flex-wrap items-start gap-x-3 gap-y-1.5', 'px-2 py-2']"
          >
            <img v-if="imageOf(item)" :src="imageOf(item)" alt="" :class="['mt-0.5 size-4.5 shrink-0 object-contain']" @error="useFallbackIcon(item.id)">
            <span v-else :class="['mt-0.5 size-4.5 shrink-0', iconOf(item)]" />
            <div :class="['min-w-48 flex-1']">
              <div :class="['text-sm']">
                {{ item.name }}
              </div>
              <div v-if="detailOf(item)" :class="['mt-0.5 text-xs text-neutral-500 dark:text-neutral-400', 'break-words line-clamp-2']">
                {{ detailOf(item) }}
              </div>
            </div>
            <div :class="['ml-auto flex shrink-0 items-center gap-1']">
              <Button size="sm" :label="t('settings.needs-attention.fix')" @click="emit('fix', item)" />
              <GhostButton size="sm" @click="emit('dismiss', item)">
                {{ t('settings.needs-attention.dismiss') }}
              </GhostButton>
            </div>
          </li>
        </ul>
      </TransitionVertical>
    </template>
  </section>
</template>

<style scoped>
/* The dot texture fills the top-left corner and fades out toward the middle, as on the settings cards. */
.settings-needs-attention::after {
  --at-apply: 'bg-dotted-[neutral-200/60] dark:bg-dotted-[neutral-700/25]';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  background-size: 10px 10px;
  mask-image: linear-gradient(165deg, white 20%, transparent 40%);
  pointer-events: none;
}

/* Hover sweeps the theme color in from the left, as on the settings cards. */
.settings-needs-attention-summary::before {
  --at-apply: 'bg-gradient-to-r from-primary-500/20 via-primary-500/10 to-transparent dark:from-primary-400/20 dark:via-primary-400/10';
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 25%;
  border-radius: inherit;
  opacity: 0;
  transition: all 0.4s ease-in-out;
  pointer-events: none;
}

.settings-needs-attention-summary:hover::before,
.settings-needs-attention-summary:focus-visible::before {
  width: 100%;
  opacity: 1;
}

.settings-needs-attention-summary:hover .settings-needs-attention-title,
.settings-needs-attention-summary:focus-visible .settings-needs-attention-title {
  --at-apply: 'text-primary-600 dark:text-primary-300';
}

/* The provider icons overlap, so each one after the first moves left under the ring of the one before. */
.settings-needs-attention-face + .settings-needs-attention-face {
  margin-left: -0.5rem;
}
</style>
