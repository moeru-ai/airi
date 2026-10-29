<script setup lang="ts">
import { BasicButton, DropdownMenu } from '@proj-airi/ui'
import { DropdownMenuItem } from 'reka-ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

// The menu root renders no element. Classes from the host style the trigger button.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /**
   * `sm` is 36px for the desktop composer. `md` is 40px for touch.
   * @default 'sm'
   */
  size?: 'sm' | 'md'
  /**
   * A voice call runs, so the call item is off.
   * @default false
   */
  inCall?: boolean
}>(), { size: 'sm', inCall: false })

const emit = defineEmits<{
  /** The user asked to attach images. The host opens its file picker. */
  attachImages: []
  /** The user asked to start a voice call. It is a user gesture, so the host can ask for microphone permission. */
  call: []
}>()

const { t } = useI18n()
const open = shallowRef(false)

const itemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'data-[disabled]:cursor-default data-[disabled]:opacity-50',
  'transition-colors duration-150 ease-in-out',
]
</script>

<template>
  <DropdownMenu v-model:open="open" side="top" align="start" variant="blurry" :content-class="['min-w-[200px]']">
    <template #trigger>
      <BasicButton
        size="unset"
        type="button"
        v-bind="$attrs"
        data-testid="composer-add-button"
        :aria-label="t('stage.chat.composer.add')"
        :title="t('stage.chat.composer.add')"
        :class="[
          props.size === 'md' ? 'size-10' : 'size-9',
          'shrink-0 flex items-center justify-center rounded-full outline-none',
          'text-neutral-500 dark:text-neutral-400',
          'hover:bg-primary-100/70 hover:text-primary-600 dark:hover:bg-primary-900/50 dark:hover:text-primary-300',
          'data-[state=open]:bg-primary-100/70 data-[state=open]:text-primary-600 dark:data-[state=open]:bg-primary-900/50 dark:data-[state=open]:text-primary-300',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500',
          'transition-colors duration-150 motion-reduce:transition-none',
        ]"
      >
        <span
          aria-hidden="true"
          :class="['i-mingcute:add-line size-5.5 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-45']"
        />
      </BasicButton>
    </template>
    <DropdownMenuItem data-testid="composer-add-images" :class="itemClasses" @select="emit('attachImages')">
      <span :class="['i-mingcute:pic-line size-4.5 shrink-0']" />
      <span>{{ t('stage.chat.composer.images') }}</span>
    </DropdownMenuItem>
    <DropdownMenuItem data-testid="composer-add-call" :disabled="props.inCall" :class="itemClasses" @select="emit('call')">
      <span :class="['i-mingcute:phone-line size-4.5 shrink-0']" />
      <span>{{ t('stage.chat.composer.call') }}</span>
    </DropdownMenuItem>
  </DropdownMenu>
</template>
