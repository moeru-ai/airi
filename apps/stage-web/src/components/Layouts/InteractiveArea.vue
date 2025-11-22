<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import ChatActionButtons from '../Widgets/ChatActionButtons.vue'
import ChatArea from '../Widgets/ChatArea.vue'
import ChatContainer from '../Widgets/ChatContainer.vue'

const DeferredChatHistory = defineAsyncComponent({
  loader: () => import('../Widgets/ChatHistory.vue'),
})
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <ChatContainer>
        <div w="full" max-h="<md:[60%]" py="<sm:2" flex="~ col" rounded="lg" relative h-full flex-1 overflow-hidden py-4>
          <DeferredChatHistory @vue:mounted="console.log('mounted')" />
        </div>
        <ChatArea />
      </ChatContainer>
    </div>

    <ChatActionButtons />
  </div>
</template>
