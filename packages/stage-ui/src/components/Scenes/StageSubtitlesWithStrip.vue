<script setup lang="ts">
import MarkdownRenderer from '../MarkdownRenderer.vue'

import { useChatStore } from '../../stores/chat'

const { streamingMessage } = useChatStore()
</script>

<template>
  <div
    v-if="streamingMessage.content !== ''"
    class="animate-stripe"
    absolute
    left="1/2"
    bottom="20%"
    z="20"
    rounded-2xl
    text="primary-600"
    px-2 py-2
    transform="translate-x--1/2"
  >
    <div bg="primary-50" rounded-xl px-10 py-6>
      <MarkdownRenderer :content="streamingMessage.content as string" />
    </div>
  </div>
</template>

<style lang="css" scoped>
/**
  Plunker - Untitled
  https://plnkr.co/edit/4wPv1ogKNMfJ6rQPhZdJ?p=preview&preview

  by https://stackoverflow.com/a/31547711/19954520
 */
.animate-stripe {
  --animate-stripe-color-primary: color-mix(in srgb, oklch(74% var(--chromatic-chroma-400) calc(var(--chromatic-hue) + 0deg) / %alpha) 80%, oklch(100% 0 360 / %alpha));
  --animate-stripe-color-secondary: color-mix(in srgb, oklch(90% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0deg) / %alpha) 80%, oklch(100% 0 360 / %alpha));

  background-image: repeating-linear-gradient(-45deg, var(--animate-stripe-color-primary), var(--animate-stripe-color-primary) 25px, var(--animate-stripe-color-secondary) 25px, var(--animate-stripe-color-secondary) 50px);
  animation: progress 2s linear infinite;
  background-size: 150% 100%;
}

.dark .animate-stripe {
  --animate-stripe-color-primary: color-mix(in srgb, oklch(37% calc(var(--chromatic-chroma-900) * 0.5) var(--chromatic-hue)) 30%, oklch(100% 0 360));
  --animate-stripe-color-secondary: color-mix(in srgb, oklch(29% calc(var(--chromatic-chroma-950) * 0.5) var(--chromatic-hue)) 30%, oklch(100% 0 360));
}

@-webkit-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-moz-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-ms-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -70px 0px;
  }
}
</style>
