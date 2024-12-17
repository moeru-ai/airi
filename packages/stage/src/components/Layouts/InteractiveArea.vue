<script setup lang="ts">
import ChatHistory from '../Widgets/ChatHistory.vue'

const tab = ref<'chat' | 'custom' | 'clothes'>('chat')
</script>

<template>
  <div flex="~ col" h-full w-full items-center pt-4>
    <fieldset flex="~ row" w-fit rounded-lg>
      <label
        :class="[
          tab === 'chat' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'chat' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'chat'"
        :aria-checked="tab === 'chat'"
        border="solid l-2 t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-l-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="chat" hidden>
        <div i-solar:dialog-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span min-w="3em">Chat</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'custom' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'custom' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'custom'"
        :aria-checked="tab === 'custom'"
        border="solid t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 px-2
      >
        <input v-model="tab" type="radio" name="tab" value="custom" hidden>
        <div i-solar:star-fall-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>Custom</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'clothes' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'clothes' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'clothes'"
        :aria-checked="tab === 'clothes'"
        border="solid r-2 t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-r-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="clothes" hidden>
        <div i-solar:magic-stick-3-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>Clothes</span>
        </div>
      </label>
    </fieldset>
    <div h-full max-h="[85vh]" w-full px-12 py-4>
      <div border="solid 2 pink-100 dark:pink-400/20" h-full w-full overflow-scroll rounded-xl p-4>
        <ChatHistory />
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
</style>
