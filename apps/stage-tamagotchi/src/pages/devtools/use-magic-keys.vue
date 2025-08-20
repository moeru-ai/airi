<script setup lang="ts">
import { useMagicKeys } from '@vueuse/core'
import { computed, defineComponent, h } from 'vue'

import { useTauriRdevEventTarget } from '../../composables/tauri-rdev'

const eventTarget = useTauriRdevEventTarget()
const {
  shift,
  control,
  escape,
  tab,
  v,
  u,
  e,
  s,
  v_u_e,
  u_s_e,
  i_Shift_Alt,
  a_Shift_Alt,
  n_Shift_Alt,
  current,
} = useMagicKeys({ target: eventTarget })
const keys = computed(() => Array.from(current))

const Key = defineComponent({
  props: {
    value: {
      type: Boolean,
      required: true,
    },
  },
  render() {
    return h('div', {
      class: [
        'font-mono px-4 py-2 rounded',
        this.value
          ? 'opacity-100 text-primary bg-primary bg-opacity-15'
          : 'opacity-50 bg-gray-600 bg-opacity-10 dark:(bg-gray-400 bg-opacity-10)',
      ],
    }, this.$slots.default?.())
  },
})
</script>

<template>
  <div class="flex flex-col md:flex-row">
    <img
      class="m-auto h-38 transform py-8 transition duration-500"
      :class="{ 'opacity-0': !v_u_e, 'rotate-180': shift }"
    >

    <div>
      <div class="mb-5 mt-0 text-center">
        Press the following keys to test out
      </div>
      <div class="flex justify-center gap-3">
        <Key :value="v">
          V
        </Key>
        <Key :value="u">
          u
        </Key>
        <Key :value="e">
          e
        </Key>
        <div class="mx-1" />
        <Key :value="u">
          U
        </Key>
        <Key :value="s">
          s
        </Key>
        <Key :value="e">
          e
        </Key>
      </div>

      <div class="mt-3 flex justify-center gap-3">
        <Key :value="escape">
          Escape
        </Key>
        <Key :value="shift">
          Shift
        </Key>
        <Key :value="control">
          Control
        </Key>
        <Key :value="tab">
          Tab
        </Key>
      </div>

      <div class="mt-3 flex justify-center gap-3">
        <Key :value="v_u_e">
          Vue
        </Key>
        <Key :value="u_s_e">
          Use
        </Key>
      </div>

      <div class="mt-3 flex flex-col items-center gap-3">
        <Key :value="i_Shift_Alt">
          Shift + Alt + I
        </Key>
        <Key :value="a_Shift_Alt">
          Shift + Alt + A
        </Key>
        <Key :value="n_Shift_Alt">
          Shift + Alt + N
        </Key>
      </div>

      <div class="mt-4 text-center">
        <div>Keys Pressed</div>
        <div class="mt-2 min-h-1.5em flex justify-center space-x-1">
          <code
            v-for="key in keys"
            :key="key"
            class="font-mono"
          >
            {{ key }}
          </code>
        </div>
      </div>
    </div>

    <img
      class="m-auto h-38 transform py-8 transition duration-500"
      :class="{ 'opacity-0': !u_s_e, 'rotate-180': shift }"
    >
  </div>
</template>
