<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  thumbColor?: string
  trackColor?: string
  trackValueColor?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  thumbColor: '#9090906e',
  trackColor: 'gray',
  trackValueColor: 'red',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const scaledMin = computed(() => props.min * 10000)
const scaledMax = computed(() => props.max * 10000)
const scaledStep = computed(() => props.step * 10000)

const sliderRef = ref<HTMLInputElement>()
const sliderValue = ref(props.modelValue * 10000)

watch(sliderValue, (value) => {
  emit('update:modelValue', value / 10000)
  updateTrackColor()
})

onMounted(() => {
  updateTrackColor()
})

function updateTrackColor() {
  if (!sliderRef.value)
    return

  sliderRef.value.style.setProperty('--value', sliderRef.value.value)
  sliderRef.value.style.setProperty('--min', !sliderRef.value.min ? props.min.toString() : sliderRef.value.min)
  sliderRef.value.style.setProperty('--max', !sliderRef.value.max ? props.max.toString() : sliderRef.value.max)
}
</script>

<template>
  <input
    ref="sliderRef"
    v-model="sliderValue"
    type="range"
    :min="scaledMin"
    :max="scaledMax"
    :step="scaledStep"
    class="data-gui-range slider-progress"
    @input="(e) => {
      (e.target as HTMLInputElement).style.setProperty('--value', (e.target as HTMLInputElement).value)
    }"
  >
</template>

<style scoped>
/*generated with Input range slider CSS style generator (version 20211225)
https://toughengineer.github.io/demo/slider-styler*/
.data-gui-range {
  --total-height: 3em;

  min-height: var(--total-height);
  appearance: none;
  background: transparent;
  border-radius: 0.5em;
  transition: background-color 0.2s ease;

  --thumb-width: 4px;
  --thumb-height: var(--total-height);
  --thumb-box-shadow: 0 0 2px #8d8d8d;
  --thumb-border: none;
  --thumb-border-radius: 999px;
  --thumb-background: #e2e2e2;
  --thumb-background-hover: #ffffff;
  --thumb-background-active: #d7d7d7;

  --track-height: 2em;
  --track-border-radius: 0.5em;
  --track-box-shadow: none;
  --track-background: rgb(144, 144, 144);
  --track-background-hover: rgb(144, 144, 144);
  --track-background-active: rgb(144, 144, 144);

  --track-value-background: rgb(255, 255, 255);
  --track-value-background-hover: rgb(255, 255, 255);
  --track-value-background-active: rgb(255, 255, 255);
}

.dark .data-gui-range {
  --thumb-background: #e2e2e2;
  --thumb-background-hover: #ffffff;
  --thumb-background-active: #d7d7d7;

  --track-background: rgb(44, 44, 44);
  --track-background-hover: rgb(44, 44, 44);
  --track-background-active: rgb(44, 44, 44);

  --track-value-background: rgb(219, 219, 219);
  --track-value-background-hover: rgb(219, 219, 219);
  --track-value-background-active: rgb(219, 219, 219);
}

/*progress support*/
.data-gui-range.slider-progress {
  --range: calc(var(--max) - var(--min));
  --ratio: calc((var(--value) - var(--min)) / var(--range));
  --sx: calc(0.5 * 0em + var(--ratio) * (100% - 0em));
}

.data-gui-range:focus {
  outline: none;
}

/*webkit*/
.data-gui-range::-webkit-slider-thumb {
  appearance: none;
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: var(--thumb-border);
  box-shadow: var(--thumb-box-shadow);
  transform: translateY(calc(((var(--track-height)) - var(--thumb-height)) / 2));
  cursor: col-resize;
  transition:
    background 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

.data-gui-range::-webkit-slider-runnable-track {
  height: var(--track-height);
  border: none;
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  box-shadow: var(--track-box-shadow);
  position: relative;
  cursor: col-resize;
  transition:
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out;
}

.data-gui-range::-webkit-slider-thumb:hover {
  background: var(--thumb-background-hover);
}

.data-gui-range:hover::-webkit-slider-runnable-track {
  background: var(--track-background-hover);
}

.data-gui-range::-webkit-slider-thumb:active {
  background: var(--thumb-background-active);
}

.data-gui-range:active::-webkit-slider-runnable-track {
  background: var(--track-background-active);
}

.data-gui-range.slider-progress::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

.data-gui-range.slider-progress:hover::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background-hover), var(--track-value-background-hover)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-hover);
}

.data-gui-range.slider-progress:active::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background-active), var(--track-value-background-active)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-active);
}

/*mozilla*/
.data-gui-range::-moz-range-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: none;
  box-shadow: var(--thumb-box-shadow);
  transform: translateY(calc(((var(--track-height)) - var(--thumb-height)) / 2));
  cursor: col-resize;
}

.data-gui-range::-moz-range-track {
  height: var(--track-height);
  border: none;
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  box-shadow: var(--track-box-shadow);
  cursor: col-resize;
}

.data-gui-range::-moz-range-thumb:hover {
  background: var(--thumb-background-hover);
}

.data-gui-range:hover::-moz-range-track {
  background: var(--track-background-hover);
}

.data-gui-range::-moz-range-thumb:active {
  background: var(--thumb-background-active);
}

.data-gui-range:active::-moz-range-track {
  background: var(--track-background-active);
}

.data-gui-range.slider-progress::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

.data-gui-range.slider-progress:hover::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background-hover), var(--track-value-background-hover)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-hover);
}

.data-gui-range.slider-progress:active::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background-active), var(--track-value-background-active)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-active);
}

/*ms*/
.data-gui-range::-ms-fill-upper {
  background: transparent;
  border-color: transparent;
}

.data-gui-range::-ms-fill-lower {
  background: transparent;
  border-color: transparent;
}

.data-gui-range::-ms-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: none;
  box-shadow: var(--thumb-box-shadow);
  transform: translateY(calc(((var(--track-height)) - var(--thumb-height)) / 2));
  box-sizing: border-box;
  cursor: col-resize;
}

.data-gui-range::-ms-track {
  height: var(--track-height);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  border: none;
  box-shadow: var(--track-box-shadow);
  box-sizing: border-box;
  cursor: col-resize;
}

.data-gui-range::-ms-thumb:hover {
  background: var(--thumb-background-hover);
}

.data-gui-range:hover::-ms-track {
  background: var(--track-background-hover);
}

.data-gui-range::-ms-thumb:active {
  background: var(--thumb-background-active);
}

.data-gui-range:active::-ms-track {
  background: var(--track-background-active);
}

.data-gui-range.slider-progress::-ms-fill-lower {
  height: var(--track-height);
  border-radius: var(--track-border-radius) 0 0 var(--track-border-radius);
  margin: 0;
  background: var(--track-value-background);
  border: none;
  border-right-width: 0;
}

.data-gui-range.slider-progress:hover::-ms-fill-lower {
  background: var(--track-value-background-hover);
}

.data-gui-range.slider-progress:active::-ms-fill-lower {
  background: var(--track-value-background-active);
}
</style>
