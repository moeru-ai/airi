<script setup lang="ts">
import { filterBrightness, formatRgb, rgb } from 'culori'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  backgroundLabel?: string
  description: string
  image?: string
  cardHeight?: number
  cardWidth?: number
  primaryColor: string
  primaryColorDark?: string
  secondaryColor: string
  backgroundColor?: string
  dividerColor?: string
  dividerOpacity?: number
  textColor: string
  textShadowColor?: string
  textShadowSize?: string
  descriptionTextColor?: string
  subtitleTextColor?: string
  barWidth?: number
  barcodeCount?: number
}>(), {
  backgroundLabel: 'Character',
  cardHeight: 130,
  cardWidth: 80,
  dividerOpacity: 0.3,
  textShadowColor: '#71717a',
  textShadowSize: '0px 0px 3px',
  descriptionTextColor: '#a1a1aa',
  subtitleTextColor: '#ffffff',
  barcodeCount: 8,
  barWidth: 10,
})

// Generate random barcode lines
const barcodeLines = computed(() => {
  const lines = []
  for (let i = 0; i < props.barcodeCount; i++) {
    lines.push({
      width: Math.random() > 0.7 ? 3 : 1,
      space: Math.ceil(Math.random() * 2),
    })
  }
  return lines
})

const dimmer50 = filterBrightness(0.5)

// CSS variables for the component
const cssVars = computed(() => {
  const backgroundLabelColor = dimmer50(rgb(props.primaryColor)!)
  backgroundLabelColor.alpha = 0.1

  const backgroundMaskBackgroundColor = rgb(props.backgroundColor)!
  backgroundMaskBackgroundColor.alpha = 1

  const backgroundDotGridColor = dimmer50(rgb(props.primaryColor)!)
  backgroundDotGridColor.alpha = 0.1

  const backgroundColor = rgb(props.backgroundColor)!
  backgroundColor.alpha = 1

  const dividerColor = dimmer50(rgb(props.primaryColor)!)
  dividerColor.alpha = props.dividerOpacity

  return {
    '--card-height': `${props.cardHeight * 4}px`,
    '--card-width': `${props.cardWidth * 4}px`,
    '--bar-width': `${props.barWidth * 4}px`,

    // RGB values for colors
    '--primary-rgb': `${formatRgb(props.primaryColor)}`,
    '--secondary-rgb': `${formatRgb(props.secondaryColor)}`,
    '--text-rgb': `${formatRgb(props.textColor)}`,
    '--text-shadow-color': props.textShadowColor,
    '--text-shadow-size': props.textShadowSize,
    '--description-text-color': props.descriptionTextColor,
    '--subtitle-text-color': props.subtitleTextColor,

    // Opacity values
    '--divider-color': `${formatRgb(dividerColor)}`,
    '--divider-opacity': `${dividerColor.alpha}`,

    // Components
    '--background-color': `${formatRgb(backgroundColor)}`,
    '--background-dot-grid-color': `${formatRgb(backgroundDotGridColor)}`,
    '--background-mask-color': `${formatRgb(backgroundMaskBackgroundColor)}`,
    '--background-label-color': `${formatRgb(backgroundLabelColor)}`,
  }
})
</script>

<template>
  <div
    class="character-card [&_.card-cover_img]:hover:translate-y-2 [&_.card-cover_img]:hover:scale-102"
    :style="cssVars"
    w-fit cursor-pointer rounded-xl shadow-sm
  >
    <div flex="~ items-center justify-center" w-fit bg="inherit">
      <div class="card-container">
        <div h-full flex>
          <div flex="1 ~ col" class="main-container" h-full rounded-l-xl>
            <div flex="1 ~ col" relative>
              <!-- Background section -->
              <div
                class="background-section-container"
                flex="~ col 1"
                relative
                z-1
                overflow-hidden
                rounded-l-xl
              >
                <span
                  class="background-label mt-2"
                  leading="[1]"
                  font-quicksand absolute inline-block font-semibold
                  :style="{ writingMode: 'vertical-rl' }"
                >
                  {{ backgroundLabel }}
                </span>
              </div>
              <!-- Title section -->
              <div font-jura relative z-3 pb-4 pl-4 pt-2>
                <div relative z-4 class="subtitle-text">
                  <!-- Subtitle section -->
                  <div text-base font-semibold>
                    <span text-base>{{ subtitle }}</span>
                  </div>
                  <!-- Title section -->
                  <div
                    class="title-text"

                    font-jura text-6xl font-bold font-italic text-stroke-1
                    :style="{ paintOrder: 'stroke fill' }"
                    leading="[0.75]"
                  >
                    <span>{{ title }}</span>
                  </div>
                </div>
                <div
                  class="title-gradient"
                  absolute
                  bottom-0
                  left-0
                  right-0
                  h-full
                />
              </div>
              <!-- Cover section -->
              <div absolute bottom-0 left-0 right-0 top--20 z-2 overflow-hidden class="card-cover">
                <slot name="cover">
                  <img v-if="image" :src="image" h="300" object-cover mix-blend-screen transition-all duration-500 ease-in-out>
                  <div v-else h="300" w-full object-cover mix-blend-screen transition-all duration-500 ease-in-out />
                </slot>
              </div>
            </div>
            <!-- Divider section -->
            <div mx-5 h-0.5 rounded-full class="divider" />
            <!-- Info section -->
            <div class="description" max-h="[4.5rem]" font-quicksand mx-5 mb-4 mt-2 h-full>
              <div h-full text-base>
                {{ description }}
              </div>
            </div>
          </div>
          <!-- Holding section -->
          <div
            relative
            z-2
            h-full
            class="bar-container"
            rounded-r-xl
          >
            <div class="barcode-container">
              <div class="barcode">
                <div
                  v-for="(line, index) in barcodeLines" :key="index"
                  class="barcode-line"
                  :style="{
                    width: `${line.width}px`,
                    marginRight: `${line.space}px`,
                  }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-container {
  height: var(--card-height);
  width: var(--card-width);
}

.main-container {
  background-color: var(--background-color);
}

.background-section-container {
  background-image: linear-gradient(to bottom, var(--primary-rgb) 0%, var(--primary-rgb) 50%);
}

.background-label {
  font-size: 4rem;
  color: var(--background-label-color);
}

.title-gradient {
  background-image: linear-gradient(to bottom, transparent 0%, var(--background-mask-color) 100%);
}

.subtitle-text {
  color: var(--subtitle-text-color);
  text-shadow: var(--text-shadow-size) var(--text-shadow-color);
}

.title-text {
  color: var(--text-rgb);
  text-shadow: var(--text-shadow-size) var(--text-rgb);
  -webkit-text-stroke: 1px var(--text-rgb);
}

.description {
  color: var(--description-text-color);
}

.divider {
  background-color: var(--divider-color);
}

.bar-container {
  width: var(--bar-width);
  background-image: linear-gradient(to bottom, var(--secondary-rgb) 0%, var(--primary-rgb) 100%);
}

.background-section-container::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 10;
  width: 100%;
  height: 100%;
  background-image: radial-gradient(circle at 2px 2px, var(--background-dot-grid-color) 2px, transparent 0);
  background-size: 10px 10px;
  transition: all 0.4s ease-in-out;
  mask-image: linear-gradient(164deg, white 0%, transparent 24%);
}

.card-cover {
  mask-image: linear-gradient(11deg, rgba(0, 0, 0, 0) 5%, rgba(0, 0, 0, 1) 13%),
    radial-gradient(#fff 57%, #ffffff00 86%);
}

.barcode {
  display: flex;
  transform: translateY(30px) rotate(90deg);
  transform-origin: center;
}

.barcode-line {
  height: 20px;
  background-color: white;
}

/* Barcode guide number sections */
.barcode::before,
.barcode::after {
  content: '';
  height: 101%;
  width: 2px;
  background-color: white;
  position: absolute;
}

.barcode::before {
  left: -10px;
}

.barcode::after {
  right: -10px;
}
</style>
