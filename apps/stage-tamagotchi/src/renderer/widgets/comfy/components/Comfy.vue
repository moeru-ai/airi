<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  id?: string
  status?: 'idle' | 'generating' | 'done' | 'error'
  imageUrl?: string
  prompt?: string
  progress?: number
  actionLabel?: string
  remixId?: string | number
  renderTime?: string
  engineStats?: string
}>(), {
  status: 'idle',
  progress: 0,
})

const history = ref<{ url: string, prompt?: string, remixId?: string | number }[]>([])
const currentIndex = ref(0)
const isFlipped = ref(false)
const errorOccurred = ref(false)

// Add new images to history as they arrive
watch(() => props.imageUrl, (newUrl) => {
  if (!newUrl)
    return

  errorOccurred.value = false

  // Rule: check if different then set it as active. if same don't change.
  if (currentImage.value?.url === newUrl)
    return

  const existingIndex = history.value.findIndex(img => img.url === newUrl)
  if (existingIndex === -1) {
    history.value.push({
      url: newUrl,
      prompt: props.prompt,
      remixId: props.remixId,
    })
    currentIndex.value = history.value.length - 1
  }
  else {
    currentIndex.value = existingIndex
  }
}, { immediate: true })

const currentImage = computed(() => history.value[currentIndex.value])

function handleImageError() {
  errorOccurred.value = true
}

function nextImage() {
  if (history.value.length === 0)
    return
  errorOccurred.value = false
  currentIndex.value = (currentIndex.value + 1) % history.value.length
}

function prevImage() {
  if (history.value.length === 0)
    return
  errorOccurred.value = false
  currentIndex.value = (currentIndex.value - 1 + history.value.length) % history.value.length
}

function toggleFlip() {
  isFlipped.value = !isFlipped.value
}
</script>

<template>
  <div class="comfy-widget perspective-1000 relative h-full w-full select-none font-sans">
    <div
      class="preserve-3d relative h-full w-full transition-transform duration-700"
      :class="{ 'rotate-y-180': isFlipped }"
    >
      <!-- Front Side: Gallery/Generator -->
      <div
        class="backface-hidden absolute inset-0 overflow-hidden border border-white/10 rounded-2xl from-neutral-900 via-neutral-900 to-neutral-800 bg-gradient-to-br shadow-2xl"
      >
        <!-- Generation Overlay -->
        <div
          v-if="status === 'generating'"
          class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center transition-all duration-500"
        >
          <!-- Center Loader: Only if no images yet -->
          <template v-if="history.length === 0">
            <div class="z-minus-1 absolute inset-0 bg-black/60" />
            <div class="relative mb-6">
              <div class="animate-spin-slow i-iconify-meteocons:clear-day-fill text-[5rem] text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
              <div class="absolute inset-0 flex items-center justify-center text-xl text-white font-bold drop-shadow-md">
                {{ Math.round(progress) }}%
              </div>
            </div>
            <div class="max-w-xs w-full px-6 space-y-2">
              <div class="truncate text-center text-sm text-white/90 font-medium tracking-widest uppercase">
                {{ actionLabel || 'Thinking...' }}
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  class="h-full from-yellow-400 to-orange-500 bg-gradient-to-r transition-all duration-300 ease-out"
                  :style="{ width: `${progress}%` }"
                />
              </div>
            </div>
          </template>

          <!-- Slim Bottom Progress: If images exist -->
          <template v-else>
            <div class="absolute inset-x-0 bottom-0 z-40 h-10 flex flex-col justify-end from-black/80 to-transparent bg-gradient-to-t px-4 pb-1">
              <div class="mb-1 flex items-center justify-between px-1">
                <div class="flex items-center gap-1.5 text-[9px] text-white/50 font-mono">
                  <span class="size-1.5 animate-pulse rounded-full bg-yellow-400" />
                  <span class="tracking-widest uppercase opacity-80">{{ actionLabel || 'Manifesting...' }}</span>
                </div>
                <div class="text-[9px] text-yellow-400/80 font-bold font-mono">
                  {{ Math.round(progress) }}%
                </div>
              </div>
              <div class="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  class="h-full from-yellow-400 to-orange-500 bg-gradient-to-r shadow-[0_0_10px_rgba(250,204,21,0.4)] transition-all duration-300 ease-out"
                  :style="{ width: `${progress}%` }"
                />
              </div>
            </div>
          </template>
        </div>

        <!-- Image Display -->
        <div class="relative h-full w-full flex items-center justify-center bg-black">
          <img
            v-if="currentImage && !errorOccurred"
            :key="currentImage.url"
            :src="currentImage.url"
            class="h-full w-full object-cover transition-all duration-500"
            @error="handleImageError"
          >
          <div v-else-if="errorOccurred" class="h-full w-full">
            <img
              src="https://placehold.co/600x400/991b1b/white?text=Error+Loading+Image&font=roboto"
              class="h-full w-full object-cover"
            >
          </div>
          <div v-else-if="status !== 'generating'" class="p-8 text-center text-white/20">
            <div class="i-iconify-material-symbols:image-not-supported-outline mb-2 text-4xl" />
            <div class="text-sm">
              Awaiting first generation...
            </div>
          </div>
        </div>

        <!-- Navigation Overlay -->
        <div v-if="history.length > 1" class="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex justify-between px-3 -translate-y-1/2">
          <button
            class="pointer-events-auto size-14 flex items-center justify-center border border-white/20 rounded-full bg-black/50 text-white shadow-2xl backdrop-blur-md transition-all active:scale-95 hover:scale-110 hover:bg-black/80"
            @click.stop="prevImage"
          >
            <span class="flex items-center justify-center pb-1 text-2xl leading-none font-mono">&lt;</span>
          </button>
          <button
            class="pointer-events-auto size-14 flex items-center justify-center border border-white/20 rounded-full bg-black/50 text-white shadow-2xl backdrop-blur-md transition-all active:scale-95 hover:scale-110 hover:bg-black/80"
            @click.stop="nextImage"
          >
            <span class="flex items-center justify-center pb-1 text-2xl leading-none font-mono">&gt;</span>
          </button>
        </div>

        <!-- Counter & Flip Toggle -->
        <div class="absolute inset-x-0 bottom-2 z-10 flex items-center justify-between px-3">
          <div v-if="history.length > 0" class="rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/70 font-mono backdrop-blur-sm">
            {{ currentIndex + 1 }} / {{ history.length }}
          </div>
          <div v-else />

          <button
            class="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-all active:scale-95 hover:scale-110 hover:bg-white/20"
            @click="toggleFlip"
          >
            <div class="i-iconify-material-symbols:info-outline text-lg" />
          </button>
        </div>
      </div>

      <!-- Back Side: Metadata -->
      <div
        class="backface-hidden rotate-y-180 absolute inset-0 flex flex-col gap-3 overflow-hidden border border-white/20 rounded-2xl bg-[#0a0a0c] p-4 font-mono shadow-2xl"
      >
        <div class="flex items-center justify-between border-b border-white/10 pb-2">
          <div class="text-xs text-yellow-500 font-bold tracking-tighter uppercase">
            Engine.Cortex_V1
          </div>
          <button class="text-white/40 transition-colors hover:text-white" @click="toggleFlip">
            <div class="i-iconify-material-symbols:close text-lg" />
          </button>
        </div>

        <div class="custom-scrollbar flex-1 overflow-y-auto pr-1 text-[11px] space-y-4">
          <div class="space-y-1">
            <div class="text-[9px] text-white/30 font-bold uppercase">
              Generated Prompt
            </div>
            <div class="border border-white/5 rounded bg-white/5 p-2 text-white/80 leading-relaxed italic">
              {{ currentImage?.prompt || prompt || 'No prompt available for this frame.' }}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="border border-white/5 rounded bg-white/5 p-2">
              <div class="mb-1 text-[8px] text-white/30 font-bold uppercase">
                Remix ID
              </div>
              <div class="text-white/90">
                #{{ currentImage?.remixId || remixId || '000000' }}
              </div>
            </div>
            <div class="border border-white/5 rounded bg-white/5 p-2">
              <div class="mb-1 text-[8px] text-white/30 font-bold uppercase">
                Time
              </div>
              <div class="text-white/90">
                {{ renderTime || '--.--s' }}
              </div>
            </div>
          </div>

          <div v-if="engineStats" class="border border-white/10 rounded border-dashed bg-black/40 p-2">
            <div class="mb-1 text-[8px] text-white/30 font-bold uppercase">
              Performance Details
            </div>
            <div class="text-green-500/80 leading-tight">
              {{ engineStats }}
            </div>
          </div>
        </div>

        <div class="pointer-events-none mt-auto flex select-none items-center gap-2 pt-2 text-[9px] text-white opacity-30">
          <div class="size-1.5 animate-pulse rounded-full bg-green-500" />
          <span>CUIPP BACKEND LINKED</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}
.preserve-3d {
  transform-style: preserve-3d;
}
.backface-hidden {
  backface-visibility: hidden;
}
.rotate-y-180 {
  transform: rotateY(180deg);
}

.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
</style>
