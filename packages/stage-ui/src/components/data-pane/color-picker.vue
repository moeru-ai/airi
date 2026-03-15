<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { convertHsvToRgb, convertRgbToHsv, formatHex8 } from 'culori'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'

interface Props {
  alpha?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alpha: true,
  disabled: false,
})

const modelValue = defineModel<string>({ required: false, default: '#000000' })

// Refs
const colorMapRef = ref<HTMLDivElement>()
const hueSliderRef = ref<HTMLDivElement>()
const alphaSliderRef = ref<HTMLDivElement>()
const popoverRef = ref<HTMLDivElement>()

// State
const isOpen = ref(false)
const isDragging = ref(false)
const dragType = ref<'map' | 'hue' | 'alpha' | null>(null)
const colorSpace = ref<'hex' | 'rgb' | 'hsv'>('hex')

// Color values (internal HSV representation)
const hue = ref(0)
const saturation = ref(100)
const value = ref(50)
const alphaValue = ref(1)

// Color conversion utilities
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: Number.parseInt(result[1], 16) / 255,
        g: Number.parseInt(result[2], 16) / 255,
        b: Number.parseInt(result[3], 16) / 255,
      }
    : null
}

function parseColor(color: string) {
  if (!color)
    return { h: 0, s: 0, v: 0, a: 1 }

  // Create a temporary element to parse any CSS color
  const temp = document.createElement('div')
  temp.style.color = color
  document.body.appendChild(temp)
  const computed = getComputedStyle(temp).color
  document.body.removeChild(temp)

  // Parse rgb/rgba
  const rgbMatch = computed.match(/rgba?\(([^)]+)\)/)
  if (rgbMatch) {
    const values = rgbMatch[1].split(',').map(v => Number.parseFloat(v.trim()))
    const rgb = {
      r: values[0] / 255,
      g: values[1] / 255,
      b: values[2] / 255,
    }
    const hsv = convertRgbToHsv(rgb)
    return {
      h: hsv.h || 0,
      s: (hsv.s || 0) * 100,
      v: (hsv.v || 0) * 100,
      a: values[3] !== undefined ? values[3] : 1,
    }
  }

  // Fallback to hex parsing
  const rgb = hexToRgb(color)
  if (rgb) {
    const hsv = convertRgbToHsv(rgb)
    return {
      h: hsv.h || 0,
      s: (hsv.s || 0) * 100,
      v: (hsv.v || 0) * 100,
      a: 1,
    }
  }

  return { h: 0, s: 0, v: 0, a: 1 }
}

// Computed values
const currentColorHsv = computed(() => ({
  h: hue.value,
  s: saturation.value / 100,
  v: value.value / 100,
}))

const currentColorRgb = computed(() => {
  const rgb = convertHsvToRgb(currentColorHsv.value)
  return {
    r: Math.round(rgb.r * 255),
    g: Math.round(rgb.g * 255),
    b: Math.round(rgb.b * 255),
  }
})

const currentColorHex = computed(() => {
  const { r, g, b } = currentColorRgb.value
  const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  return `#${hex}`
})

// Picker positions
const pickerPosition = computed(() => ({
  left: `${(saturation.value / 100) * 100}%`,
  top: `${100 - (value.value / 100) * 100}%`,
}))

const huePosition = computed(() => ({
  left: `${(hue.value / 360) * 100}%`,
}))

const alphaPosition = computed(() => ({
  left: `${alphaValue.value * 100}%`,
}))

// Color map background
const colorMapBackground = computed(() => ({
  background: `linear-gradient(to right, white, hsl(${hue.value}, 100%, 50%))`,
}))

// Alpha slider background
const alphaSliderBackground = computed(() => {
  const { r, g, b } = currentColorRgb.value
  return {
    background: `linear-gradient(to right, transparent, rgb(${r}, ${g}, ${b}))`,
  }
})

// Interaction handlers
function updateColorFromMap(x: number, y: number) {
  if (!colorMapRef.value)
    return

  const rect = colorMapRef.value.getBoundingClientRect()
  const newSaturation = Math.max(0, Math.min(100, (x / rect.width) * 100))
  const newValue = Math.max(0, Math.min(100, ((rect.height - y) / rect.height) * 100))

  saturation.value = newSaturation
  value.value = newValue
}

function updateHue(x: number) {
  if (!hueSliderRef.value)
    return

  const rect = hueSliderRef.value.getBoundingClientRect()
  const newHue = Math.max(0, Math.min(360, (x / rect.width) * 360))
  hue.value = newHue
}

function updateAlpha(x: number) {
  if (!alphaSliderRef.value)
    return

  const rect = alphaSliderRef.value.getBoundingClientRect()
  const newAlpha = Math.max(0, Math.min(1, x / rect.width))
  alphaValue.value = newAlpha
}

// Event handlers
function handleColorMapStart(event: MouseEvent | TouchEvent) {
  if (props.disabled)
    return

  isDragging.value = true
  dragType.value = 'map'

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY
  const rect = colorMapRef.value!.getBoundingClientRect()

  updateColorFromMap(clientX - rect.left, clientY - rect.top)
  event.preventDefault()
}

function handleHueStart(event: MouseEvent | TouchEvent) {
  if (props.disabled)
    return

  isDragging.value = true
  dragType.value = 'hue'

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const rect = hueSliderRef.value!.getBoundingClientRect()

  updateHue(clientX - rect.left)
  event.preventDefault()
}

function handleAlphaStart(event: MouseEvent | TouchEvent) {
  if (props.disabled)
    return

  isDragging.value = true
  dragType.value = 'alpha'

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const rect = alphaSliderRef.value!.getBoundingClientRect()

  updateAlpha(clientX - rect.left)
  event.preventDefault()
}

// Global event handlers
function handleGlobalMove(event: MouseEvent | TouchEvent) {
  if (!isDragging.value)
    return

  event.preventDefault()

  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

  switch (dragType.value) {
    case 'map': {
      const rect = colorMapRef.value!.getBoundingClientRect()
      updateColorFromMap(clientX - rect.left, clientY - rect.top)
      break
    }
    case 'hue': {
      const rect = hueSliderRef.value!.getBoundingClientRect()
      updateHue(clientX - rect.left)
      break
    }
    case 'alpha': {
      const rect = alphaSliderRef.value!.getBoundingClientRect()
      updateAlpha(clientX - rect.left)
      break
    }
  }
}

function handleGlobalEnd() {
  if (isDragging.value) {
    isDragging.value = false
    dragType.value = null
    document.body.style.cursor = ''
  }
}

// Watch for external color changes
watch(modelValue, (newValue) => {
  if (newValue && !isDragging.value) {
    const parsed = parseColor(newValue)
    hue.value = parsed.h
    saturation.value = parsed.s
    value.value = parsed.v
    alphaValue.value = parsed.a
  }
}, { immediate: true })

// Handle cursor during drag
watch(isDragging, (dragging) => {
  if (dragging) {
    document.body.style.cursor = 'none'
  }
  else {
    document.body.style.cursor = ''
  }
})

// Setup global event listeners
onMounted(() => {
  useEventListener('mousemove', handleGlobalMove, { passive: false })
  useEventListener('mouseup', handleGlobalEnd)
  useEventListener('touchmove', handleGlobalMove, { passive: false })
  useEventListener('touchend', handleGlobalEnd)

  // Close on outside click
  useEventListener('click', (event) => {
    if (isOpen.value && popoverRef.value && !popoverRef.value.contains(event.target as Node)) {
      isOpen.value = false
    }
  })
})

// Input handlers for different color spaces
function handleHexInput(hex: string) {
  const parsed = parseColor(hex)
  hue.value = parsed.h
  saturation.value = parsed.s
  value.value = parsed.v
  alphaValue.value = parsed.a
  modelValue.value = hex
}

function handleRgbInput(channel: 'r' | 'g' | 'b', val: number) {
  const rgb = { ...currentColorRgb.value }
  rgb[channel] = Math.max(0, Math.min(255, val))

  const hsv = convertRgbToHsv({
    r: rgb.r / 255,
    g: rgb.g / 255,
    b: rgb.b / 255,
  })

  hue.value = hsv.h || 0
  saturation.value = (hsv.s || 0) * 100
  value.value = (hsv.v || 0) * 100
}

function handleHsvInput(channel: 'h' | 's' | 'v', val: number) {
  switch (channel) {
    case 'h':
      hue.value = Math.max(0, Math.min(360, val))
      break
    case 's':
      saturation.value = Math.max(0, Math.min(100, val))
      break
    case 'v':
      value.value = Math.max(0, Math.min(100, val))
      break
  }
}

function handleAlphaInput(val: number) {
  alphaValue.value = Math.max(0, Math.min(1, val / 100))
}

watch([hue, saturation, value, alphaValue], () => {
  const rgb = convertHsvToRgb({
    h: hue.value,
    s: saturation.value / 100,
    v: value.value / 100,
    alpha: alphaValue.value,
  })

  modelValue.value = formatHex8(rgb)
}, { immediate: true })
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger class="grid grid-col-span-3 grid-cols-3 h-fit items-center">
      <div :style="{ backgroundColor: modelValue }" grid-col-span-2 min-h-5 rounded-md />
      <div grid-col-span-1 font-mono text="[10px] right">
        {{ modelValue }}
      </div>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent align="start" class="relative z-20">
        <div class="z-20 mt-2 space-y-2" bg="white/90 dark:neutral-900/90" rounded-xl p-1>
          <!-- Color Map -->
          <div class="relative h-48 w-full select-none overflow-hidden rounded-lg">
            <div
              ref="colorMapRef"
              class="relative h-full w-full cursor-crosshair"
              :style="[
                colorMapBackground,
                { cursor: isDragging && dragType === 'map' ? 'none' : 'crosshair' },
              ]"
              @mousedown="handleColorMapStart"
              @touchstart="handleColorMapStart"
            >
              <!-- Brightness overlay -->
              <div class="absolute inset-0" style="background: linear-gradient(to bottom, transparent, black);" />
              <!-- Color picker circle -->
              <div
                class="pointer-events-none absolute h-4 w-4 border-2 border-white rounded-full shadow-lg transition-transform"
                :style="[
                  pickerPosition,
                  {
                    transform: `translate(-50%, -50%) ${isDragging && dragType === 'map' ? 'scale(1.2)' : 'scale(1)'}`,
                    backgroundColor: modelValue,
                  },
                ]"
              />
            </div>
          </div>

          <!-- Hue Slider -->
          <div class="relative h-6 w-full select-none overflow-hidden rounded-lg">
            <div
              ref="hueSliderRef"
              class="hue-slider h-full w-full cursor-pointer"
              style="background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);"
              :style="{ cursor: isDragging && dragType === 'hue' ? 'none' : 'pointer' }"
              @mousedown="handleHueStart"
              @touchstart="handleHueStart"
            >
              <div
                class="pointer-events-none absolute top-0 h-14 w-1 cursor-pointer cursor-col-resize appearance-none bg-white shadow-lg transition-colors,transform,width,height duration-200 hover:h-13 hover:w-2 hover:bg-neutral-800"
                :style="[
                  huePosition,
                  {
                    transform: `translateX(-50%) ${isDragging && dragType === 'hue' ? 'scaleY(1.2)' : 'scaleY(1)'}`,
                  },
                ]"
              />
            </div>
          </div>

          <!-- Alpha Slider -->
          <div v-if="alpha" class="relative h-6 w-full select-none overflow-hidden rounded-lg">
            <!-- Checkerboard background -->
            <div
              class="alpha-slider absolute inset-0 opacity-50"
              style="
                background-image:
                  linear-gradient(45deg, #ccc 25%, transparent 25%),
                  linear-gradient(-45deg, #ccc 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #ccc 75%),
                  linear-gradient(-45deg, transparent 75%, #ccc 75%);
                background-size: 8px 8px;
                background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
              "
            />
            <div
              ref="alphaSliderRef"
              class="relative h-full w-full cursor-pointer"
              :style="[
                alphaSliderBackground,
                { cursor: isDragging && dragType === 'alpha' ? 'none' : 'pointer' },
              ]"
              @mousedown="handleAlphaStart"
              @touchstart="handleAlphaStart"
            >
              <div
                class="pointer-events-none absolute top-0 h-14 w-1 cursor-pointer cursor-col-resize appearance-none bg-white shadow-lg transition-colors,transform,width,height duration-200 hover:h-13 hover:w-2 hover:bg-neutral-800"
                :style="[
                  alphaPosition,
                  {
                    transform: `translateX(-50%) ${isDragging && dragType === 'alpha' ? 'scaleY(1.2)' : 'scaleY(1)'}`,
                  },
                ]"
              />
            </div>
          </div>

          <!-- Color Inputs -->
          <div class="flex justify-center gap-2">
            <div class="flex gap-2">
              <select
                v-model="colorSpace"
                class="flex-shrink-0 border rounded-lg px-2 py-1 text-sm"
              >
                <option value="hex">
                  HEX
                </option>
                <option value="rgb">
                  RGB
                </option>
                <option value="hsv">
                  HSV
                </option>
              </select>
            </div>

            <!-- HEX Input -->
            <div v-if="colorSpace === 'hex'" class="flex gap-2">
              <input
                :value="currentColorHex"
                class="flex-1 border rounded-lg px-2 py-1 text-sm font-mono"
                placeholder="#000000"
                @input="handleHexInput(($event?.target as HTMLInputElement).value)"
              >
              <input
                v-if="alpha"
                type="number"
                :value="Math.round(alphaValue * 100)"
                min="0"
                max="100"
                class="w-16 border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="A%"
                @input="handleAlphaInput(Number(($event?.target as HTMLInputElement).value))"
              >
            </div>

            <!-- RGB Inputs -->
            <div v-else-if="colorSpace === 'rgb'" class="grid gap-2" :class="alpha ? 'grid-cols-4' : 'grid-cols-3'">
              <input
                type="number"
                :value="currentColorRgb.r"
                min="0"
                max="255"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="R"
                @input="handleRgbInput('r', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                type="number"
                :value="currentColorRgb.g"
                min="0"
                max="255"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="G"
                @input="handleRgbInput('g', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                type="number"
                :value="currentColorRgb.b"
                min="0"
                max="255"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="B"
                @input="handleRgbInput('b', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                v-if="alpha"
                type="number"
                :value="Math.round(alphaValue * 100)"
                min="0"
                max="100"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="A%"
                @input="handleAlphaInput(Number(($event?.target as HTMLInputElement).value))"
              >
            </div>

            <!-- HSV Inputs -->
            <div v-else-if="colorSpace === 'hsv'" class="grid gap-2" :class="alpha ? 'grid-cols-4' : 'grid-cols-3'">
              <input
                type="number"
                :value="Math.round(hue)"
                min="0"
                max="360"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="H°"
                @input="handleHsvInput('h', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                type="number"
                :value="Math.round(saturation)"
                min="0"
                max="100"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="S%"
                @input="handleHsvInput('s', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                type="number"
                :value="Math.round(value)"
                min="0"
                max="100"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="V%"
                @input="handleHsvInput('v', Number(($event?.target as HTMLInputElement).value))"
              >
              <input
                v-if="alpha"
                type="number"
                :value="Math.round(alphaValue * 100)"
                min="0"
                max="100"
                class="border border-neutral-200 rounded-lg px-2 py-1 text-sm dark:border-neutral-700"
                placeholder="A%"
                @input="handleAlphaInput(Number(($event?.target as HTMLInputElement).value))"
              >
            </div>
          </div>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
data-[data-reka-popper-content-wrapper=""] {
  z-index: 20;
}
</style>

<style>
.hue-slider,
.alpha-slider {
  &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  .dark &::-webkit-slider-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  &::-moz-range-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-600 cursor-pointer shadow-lg border-2 border-neutral-500
      hover: bg-neutral-800 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }

  .dark &::-moz-range-thumb {
    --at-apply: w-1 h-12 hover:w-2 hover:h-13 appearance-none rounded-md bg-neutral-100 cursor-pointer shadow-md border-2 border-white
      hover: bg-neutral-300 transition-colors,transform,width,height duration-200 cursor-col-resize;
  }
}
</style>
