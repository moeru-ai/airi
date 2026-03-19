<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../stores/modules/airi-card'

interface Props {
  // 'down': opens below the trigger (for elements near the top, e.g. header)
  // 'up': opens above the trigger (for elements near the bottom, e.g. floating island)
  placement?: 'down' | 'up'
}

const props = withDefaults(defineProps<Props>(), { placement: 'down' })

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'manage'): void
}>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCardId, activeCard } = storeToRefs(cardStore)

const open = ref(false)
const creatingNew = ref(false)
const newProfileName = ref('')
const nameInputRef = ref<HTMLInputElement>()
const popoverRef = ref<HTMLElement>()

onClickOutside(popoverRef, () => {
  open.value = false
  cancelCreate()
})

const cardsList = computed(() =>
  Array.from(cards.value.entries()).map(([id, card]) => ({ id, name: card.name })),
)

function activateCard(id: string) {
  activeCardId.value = id
  open.value = false
}

async function showCreateInput() {
  creatingNew.value = true
  newProfileName.value = activeCard.value?.name ?? ''
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

function confirmCreate() {
  const current = activeCard.value
  const name = newProfileName.value.trim()
  if (!current || !name)
    return

  const newId = cardStore.addCard({
    ...structuredClone(toRaw(current)),
    name,
  })
  activeCardId.value = newId
  creatingNew.value = false
  newProfileName.value = ''
  open.value = false
  emit('create')
}

function cancelCreate() {
  creatingNew.value = false
  newProfileName.value = ''
}

function handleManage() {
  open.value = false
  emit('manage')
}
</script>

<template>
  <div ref="popoverRef" class="relative">
    <!-- Trigger button -->
    <slot :open="open" :toggle="() => open = !open" :active-card="activeCard">
      <button
        :class="[
          'flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm transition-all',
          'border border-neutral-200/60 dark:border-neutral-800/60',
          'bg-neutral-50/70 dark:bg-neutral-800/70 backdrop-blur-md',
          'hover:bg-neutral-100 dark:hover:bg-neutral-700',
          open ? 'ring-2 ring-primary-500/20' : '',
        ]"
        type="button"
        @click="open = !open"
      >
        <div class="i-solar:emoji-funny-square-broken size-4 text-neutral-500 dark:text-neutral-400" />
        <span class="max-w-28 truncate text-neutral-700 dark:text-neutral-200">
          {{ activeCard?.name ?? t('stage.profile-switcher.no-profile') }}
        </span>
        <div
          class="i-solar:alt-arrow-down-linear size-3 text-neutral-400 transition-transform duration-200"
          :class="open === (placement === 'down') ? 'rotate-180' : ''"
        />
      </button>
    </slot>

    <!-- Popover panel -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      :enter-from-class="placement === 'up' ? 'translate-y-1 opacity-0 scale-95' : '-translate-y-1 opacity-0 scale-95'"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="translate-y-0 opacity-100 scale-100"
      :leave-to-class="placement === 'up' ? 'translate-y-1 opacity-0 scale-95' : '-translate-y-1 opacity-0 scale-95'"
    >
      <div
        v-if="open"
        :class="[
          'absolute right-0 z-50 w-48',
          placement === 'up'
            ? 'bottom-full mb-2 origin-bottom-right'
            : 'top-full mt-2 origin-top-right',
          'border border-neutral-200/60 dark:border-neutral-800/60 rounded-xl',
          'bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl shadow-xl',
          'divide-y divide-neutral-100 dark:divide-neutral-800',
        ]"
      >
        <!-- New profile name input -->
        <Transition
          enter-active-class="transition-[grid-template-rows,opacity] duration-200 ease-out"
          enter-from-class="grid-rows-[0fr] opacity-0"
          enter-to-class="grid-rows-[1fr] opacity-100"
          leave-active-class="transition-[grid-template-rows,opacity] duration-150 ease-in"
          leave-from-class="grid-rows-[1fr] opacity-100"
          leave-to-class="grid-rows-[0fr] opacity-0"
        >
          <div v-if="creatingNew" class="grid">
            <div class="overflow-hidden">
              <div class="p-2">
                <div :class="['flex items-center gap-1.5 rounded-lg', 'border border-primary-300 dark:border-primary-700', 'bg-white dark:bg-neutral-800']">
                  <input
                    ref="nameInputRef"
                    v-model="newProfileName"
                    :class="[
                      'min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm outline-none',
                      'text-neutral-800 dark:text-neutral-100',
                      'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
                    ]"
                    type="text"
                    :placeholder="t('stage.profile-switcher.new-profile-name')"
                    @keydown.enter="confirmCreate"
                    @keydown.escape="cancelCreate"
                  >
                  <button
                    :class="['shrink-0 p-1.5 transition', 'text-primary-500 hover:text-primary-600 dark:hover:text-primary-400', newProfileName.trim() ? '' : 'opacity-30 pointer-events-none']"
                    type="button"
                    @click="confirmCreate"
                  >
                    <div class="i-solar:check-circle-bold size-4.5" />
                  </button>
                  <button
                    :class="['shrink-0 p-1.5 pr-2 transition', 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300']"
                    type="button"
                    @click="cancelCreate"
                  >
                    <div class="i-solar:close-circle-bold size-4.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Profile list -->
        <div class="max-h-60 overflow-y-auto p-1">
          <button
            v-for="card in cardsList"
            :key="card.id"
            :class="[
              'group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
              card.id === activeCardId
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            type="button"
            @click="activateCard(card.id)"
          >
            <div
              :class="[
                'size-4 shrink-0',
                card.id === activeCardId
                  ? 'i-solar:check-circle-bold-duotone text-primary-500'
                  : 'i-solar:emoji-funny-square-broken text-neutral-400',
              ]"
            />
            <span class="truncate">{{ card.name }}</span>
          </button>

          <div
            v-if="cardsList.length === 0"
            class="px-3 py-2 text-sm text-neutral-400 dark:text-neutral-500"
          >
            {{ t('stage.profile-switcher.no-profiles') }}
          </div>
        </div>

        <!-- Actions -->
        <div class="p-1">
          <button
            :class="[
              'group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
              'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            type="button"
            @click="showCreateInput"
          >
            <div class="i-solar:add-circle-bold-duotone size-4 text-neutral-400 transition group-hover:text-primary-500" />
            {{ t('stage.profile-switcher.save-as-new') }}
          </button>

          <button
            :class="[
              'group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
              'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            type="button"
            @click="handleManage"
          >
            <div class="i-solar:settings-minimalistic-bold-duotone size-4 text-neutral-400 transition group-hover:text-primary-500" />
            {{ t('stage.profile-switcher.manage') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
