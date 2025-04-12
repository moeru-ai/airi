<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  backgroundLabel?: string
  description: string
  image: string
  cardHeight?: number
  cardWidth?: number
  primaryColor: string
  primaryColorDark?: string
  secondaryColor: string
  backgroundColor?: string
  dividerColor?: string
  textColor: string
  barWidth?: number
  barcodeCount?: number
}>(), {
  backgroundLabel: 'Character',
  cardHeight: 130,
  cardWidth: 80,
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

// CSS variables for the component
const cssVars = computed(() => {
  return {
    '--card-height': `${props.cardHeight * 4}px`,
    '--card-width': `${props.cardWidth * 4}px`,
    '--bar-width': `${props.barWidth * 4}px`,

    // RGB values for colors
    '--primary-rgb': props.primaryColor,
    '--primary-dark-rgb': props.primaryColorDark || props.primaryColor,
    '--secondary-rgb': props.secondaryColor,
    '--background-rgb': props.backgroundColor,
    '--text-rgb': props.textColor,

    // Opacity values
    '--divider-opacity': props.dividerColor,
  }
})
</script>

<template>
  <div
    class="character-card [&_.gradient-image_img]:hover:translate-y-2 [&_.gradient-image_img]:hover:scale-102"
    :style="cssVars"
    w-fit
    cursor-pointer
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
                  absolute
                  inline-block
                  font-semibold
                  :style="{ writingMode: 'vertical-rl' }"
                >
                  {{ backgroundLabel }}
                </span>
              </div>
              <!-- Title section -->
              <div font-jura relative z-3 pb-4 pl-4 pt-2>
                <div relative z-4 text-white text-shadow-md text-shadow-color-neutral-500>
                  <!-- Subtitle section -->
                  <div text-base font-semibold>
                    <span text-base>{{ subtitle }}</span>
                  </div>
                  <!-- Title section -->
                  <div
                    class="title-text"
                    font-jura
                    text-6xl
                    font-bold
                    font-italic
                    text-stroke-1
                    :style="{ paintOrder: 'stroke fill' }"
                    text-shadow="[0px_0px_1px]"
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
              <div absolute bottom-0 left-0 right-0 top--20 z-2 overflow-hidden class="gradient-image">
                <img :src="image" h="300" object-cover mix-blend-screen transition-all duration-500 ease-in-out>
              </div>
            </div>
            <!-- Divider section -->
            <div mx-5 h-0.5 rounded-full class="divider" />
            <!-- Info section -->
            <div class="description" max-h="[4.5rem]" mx-5 mb-4 mt-2 h-full text="neutral-400">
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
  background-color: rgb(var(--background-rgb));
}

.background-section-container {
  background-image: linear-gradient(to bottom, rgb(var(--primary-rgb)) 0%, rgba(var(--primary-rgb), 1) 50%);
}

.background-label {
  font-size: 4rem;
  color: rgba(var(--primary-dark-rgb), 0.1);
}

.title-gradient {
  background-image: linear-gradient(to bottom, transparent 0%, rgb(var(--background-rgb)) 100%);
}

.title-text {
  color: rgb(var(--text-rgb));
  text-shadow: 0px 0px 3px rgb(var(--text-rgb));
  -webkit-text-stroke: 1px rgb(var(--text-rgb));
}

.divider {
  background-color: rgba(var(--primary-dark-rgb), var(--divider-opacity));
}

.bar-container {
  width: var(--bar-width);
  background-image: linear-gradient(to bottom, rgb(var(--secondary-rgb)) 0%, rgb(var(--primary-rgb)) 100%);
}

.background-section-container::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 10;
  width: 100%;
  height: 100%;
  background-image: radial-gradient(circle at 2px 2px, rgba(var(--primary-dark-rgb), 0.1) 2px, transparent 0);
  background-size: 10px 10px;
  transition: all 0.4s ease-in-out;
  mask-image: linear-gradient(164deg, white 0%, transparent 24%);
}

.gradient-image {
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
