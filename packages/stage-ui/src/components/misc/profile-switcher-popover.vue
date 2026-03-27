<script setup lang="ts">
import { Select } from '@proj-airi/ui'
import { onClickOutside } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../stores/modules/airi-card'

withDefaults(defineProps<Props>(), { placement: 'down' })
const emit = defineEmits<{
  (e: 'manage'): void
}>()
const CREATE_PROFILE_ACTION = '__create-profile__'
const MANAGE_PROFILE_ACTION = '__manage-profile__'

type ProfileSelectValue = string | typeof CREATE_PROFILE_ACTION | typeof MANAGE_PROFILE_ACTION

export interface Props {
  placement?: 'down' | 'up'
}

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const cardStore = useAiriCardStore()
const { cards, activeCardId, activeCard } = storeToRefs(cardStore)

const creatingNew = ref(false)
const newProfileName = ref('')
const nameInputRef = ref<HTMLInputElement>()
const containerRef = ref<HTMLElement>()

const cardsList = computed(() =>
  Array.from(cards.value.entries()).map(([id, card]) => ({ id, name: card.name })),
)
const selectedProfile = ref<ProfileSelectValue | undefined>(activeCardId.value)

const isDuplicateName = computed(() => {
  const name = newProfileName.value.trim()
  return name !== '' && Array.from(cards.value.values()).some(card => card.name === name)
})

const selectOptions = computed(() => [
  {
    groupLabel: cardsList.value.length ? undefined : t('stage.profile-switcher.no-profiles'),
    children: cardsList.value.map(card => ({
      label: card.name,
      value: card.id,
      icon: card.id === activeCardId.value
        ? 'i-solar:check-circle-bold-duotone'
        : 'i-solar:emoji-funny-square-broken',
    })),
  },
  {
    groupLabel: '',
    children: [
      {
        label: t('stage.profile-switcher.save-as-new'),
        value: CREATE_PROFILE_ACTION,
        icon: 'i-solar:add-circle-bold-duotone',
      },
      {
        label: t('stage.profile-switcher.manage'),
        value: MANAGE_PROFILE_ACTION,
        icon: 'i-solar:settings-minimalistic-bold-duotone',
      },
    ],
  },
])

watch(open, (isOpen) => {
  if (!isOpen) {
    cancelCreate()
  }
})

watch(activeCardId, (value) => {
  selectedProfile.value = value
}, { immediate: true })

watch(selectedProfile, (value, previousValue) => {
  if (!value || value === previousValue) {
    return
  }

  handleSelection(value)
})

onClickOutside(containerRef, () => {
  open.value = false
  cancelCreate()
})

function handleSelection(value: ProfileSelectValue) {
  if (value === CREATE_PROFILE_ACTION) {
    selectedProfile.value = activeCardId.value
    void showCreateInput()
    return
  }

  if (value === MANAGE_PROFILE_ACTION) {
    selectedProfile.value = activeCardId.value
    handleManage()
    return
  }

  activeCardId.value = value
}

async function showCreateInput() {
  open.value = false
  creatingNew.value = true
  newProfileName.value = activeCard.value?.name ?? ''
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

function confirmCreate() {
  const current = activeCard.value
  const name = newProfileName.value.trim()
  if (!current || !name || isDuplicateName.value) {
    return
  }

  const newId = cardStore.addCard({
    ...structuredClone(toRaw(current)),
    name,
  })

  activeCardId.value = newId
  cancelCreate()
}

function cancelCreate() {
  creatingNew.value = false
  newProfileName.value = ''
}

function handleManage() {
  open.value = false
  cancelCreate()
  emit('manage')
}

function toggleOpen() {
  open.value = !open.value
}
</script>

<template>
  <div ref="containerRef" :class="['relative inline-flex flex-col items-end gap-2']">
    <!-- Electron -->
    <div
      v-if="$slots.default"
      :class="['profile-switcher-select-overlay', 'relative inline-flex']"
    >
      <slot :open="open" :toggle="toggleOpen" :active-card="activeCard" />

      <Select
        v-model="selectedProfile"
        v-model:open="open"
        :options="selectOptions"
        :placeholder="t('stage.profile-switcher.no-profile')"
        :content-min-width="224"
      >
        <template #value="{ option, placeholder }">
          <div :class="['min-w-0', 'flex', 'items-center', 'gap-2', 'p-1']">
            <div
              :class="[
                'size-6 shrink-0',
                option?.value === activeCardId ? 'i-solar:check-circle-bold-duotone text-primary-500' : option?.icon ?? 'i-solar:emoji-funny-square-broken text-neutral-400',
              ]"
            />
            <span
              :class="[
                'block truncate',
                'text-sm',
                'select-none',
                option ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500',
              ]"
            >
              {{ option?.label ?? placeholder }}
            </span>
          </div>
        </template>
        <template #option="{ option }">
          <div :class="['min-w-0', 'flex', 'flex-1', 'items-center', 'gap-2.5', 'py-1']">
            <div
              v-if="option.icon"
              :class="[
                'size-5 shrink-0',
                option.value === activeCardId ? 'text-primary-500' : 'text-neutral-400',
                option.icon,
              ]"
            />
            <span
              :class="[
                'inline-block w-full flex-1',
                'truncate',
                'text-sm',
                'select-none',
                option.value === activeCardId ? 'text-primary-700 dark:text-primary-300' : '',
              ]"
            >
              {{ option.label }}
            </span>
          </div>
        </template>
      </Select>
    </div>

    <!-- Web -->
    <Select
      v-else
      v-model="selectedProfile"
      v-model:open="open"
      :options="selectOptions"
      :placeholder="t('stage.profile-switcher.no-profile')"
      :content-min-width="224"
      variant="blurry"
      shape="rounded"
    >
      <template #value="{ option, placeholder }">
        <div :class="['min-w-0', 'flex', 'items-center', 'gap-2', 'px-1 py-1.5']">
          <div
            :class="[
              'size-6 shrink-0',
              option?.value === activeCardId ? 'i-solar:check-circle-bold-duotone text-primary-500' : option?.icon ?? 'i-solar:emoji-funny-square-broken text-neutral-400',
            ]"
          />
          <span
            :class="[
              'inline-block w-full flex-1',
              'text-sm',
              'select-none',
              option ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500',
            ]"
          >
            {{ option?.label ?? placeholder }}
          </span>
        </div>
      </template>
      <template #option="{ option }">
        <div :class="['min-w-0', 'flex', 'flex-1', 'items-center', 'gap-2.5', 'py-1']">
          <div
            v-if="option.icon"
            :class="[
              'size-5 shrink-0',
              option.value === activeCardId ? 'text-primary-500' : 'text-neutral-400',
              option.icon,
            ]"
          />
          <span
            :class="[
              'inline-block w-full flex-1',
              'truncate',
              'text-sm',
              'select-none',
              option.value === activeCardId ? 'text-primary-700 dark:text-primary-300' : '',
            ]"
          >
            {{ option.label }}
          </span>
        </div>
      </template>
    </Select>

    <Transition
      enter-active-class="transition-[opacity,transform] duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-[opacity,transform] duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="creatingNew"
        :class="[
          'absolute right-0 z-[10011] w-56 rounded-xl border-2 p-2 shadow-sm backdrop-blur-xl',
          placement === 'up' ? 'bottom-full mb-2 origin-bottom-right' : 'top-full mt-2 origin-top-right',
          'border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-900/95',
        ]"
      >
        <div :class="['flex items-center gap-2']">
          <input
            ref="nameInputRef"
            v-model="newProfileName"
            type="text"
            :placeholder="t('stage.profile-switcher.new-profile-name')"
            :class="[
              'min-w-0 flex-1 rounded-lg border-2 px-2 py-1 text-sm outline-none transition-colors',
              'bg-neutral-50 text-neutral-800 placeholder:text-neutral-400',
              'dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500',
              isDuplicateName
                ? 'border-red-400 dark:border-red-600'
                : 'border-neutral-100 focus:border-primary-300 dark:border-neutral-900 dark:focus:border-primary-400/50',
            ]"
            @keydown.enter="confirmCreate"
            @keydown.escape="cancelCreate"
          >

          <button
            :class="[
              'shrink-0 p-1.5 transition',
              'text-primary-500 hover:text-primary-600 dark:hover:text-primary-400',
              (newProfileName.trim() && !isDuplicateName) ? '' : 'pointer-events-none opacity-30',
            ]"
            type="button"
            @click="confirmCreate"
          >
            <div class="i-solar:check-circle-bold size-4.5" />
          </button>

          <button
            :class="[
              'shrink-0 p-1.5 transition',
              'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300',
            ]"
            type="button"
            @click="cancelCreate"
          >
            <div class="i-solar:close-circle-bold size-4.5" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.profile-switcher-select-overlay {
  min-width: 0;
}

.profile-switcher-select-overlay > :deep(button[role='combobox']) {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  opacity: 0;
}
</style>
