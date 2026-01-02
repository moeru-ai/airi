<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  src?: string
  light?: string
  dark?: string
  poster?: string
  autoplay?: boolean
  controls?: boolean
  muted?: boolean
  loop?: boolean
}>(), {
  autoplay: false,
  controls: true,
  muted: true,
  loop: true,
})

const { isDark } = useData()

const currentSrc = computed(() => {
  if (props.light && props.dark) {
    return isDark.value ? props.dark : props.light
  }
  return props.src
})

const videoRef = ref<HTMLVideoElement | null>(null)
let observer: IntersectionObserver | null = null
const isVisible = ref(false)

function handleVisibility(entries: IntersectionObserverEntry[]) {
  entries.forEach((entry) => {
    if (!videoRef.value)
      return

    if (entry.isIntersecting) {
      isVisible.value = true
      if (props.autoplay) {
        videoRef.value.play().catch(() => {
          // Auto-play was prevented
        })
      }
    }
    else {
      isVisible.value = false
      if (props.autoplay) {
        videoRef.value.pause()
      }
    }
  })
}

onMounted(() => {
  if (props.autoplay && videoRef.value) {
    observer = new IntersectionObserver(handleVisibility, {
      threshold: 0.2, // Lower threshold to start loading earlier
      rootMargin: '100px 0px', // Preload when close to viewport
    })
    observer.observe(videoRef.value)
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})

watch(currentSrc, async () => {
  if (props.autoplay && videoRef.value && isVisible.value) {
    // If src changes while visible (e.g. theme toggle), ensure we play the new src
    // Using nextTick to allow DOM update
    await nextTick()
    videoRef.value?.play().catch(() => {})
  }
})
</script>

<template>
  <div class="themed-video-wrapper my-4 overflow-hidden rounded-xl">
    <video
      ref="videoRef"
      :src="currentSrc"
      :poster="poster"
      :controls="controls"
      :muted="muted"
      :loop="loop"
      playsinline
      class="block w-full"
      preload="none"
    >
      <slot>
        Your browser does not support the video tag.
      </slot>
    </video>
  </div>
</template>

<style scoped>
.themed-video-wrapper video {
  max-height: 60vh;
  object-fit: contain;
}
</style>
