<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
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

const modelValue = defineModel<number>('modelValue', { required: true })

const scaledMin = computed(() => props.min * 10000)
const scaledMax = computed(() => props.max * 10000)
const scaledStep = computed(() => props.step * 10000)

const sliderRef = ref<HTMLInputElement>()
const sliderValue = computed({
  get: () => modelValue.value * 10000,
  set: (value: number) => {
    modelValue.value = value / 10000
    updateTrackColor()
  },
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

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement
  target.style.setProperty('--value', target.value)
}
</script>

<template>
  <input
    ref="sliderRef"
    v-model.number="sliderValue"
    type="range"
    :min="scaledMin"
    :max="scaledMax"
    :step="scaledStep"
    class="slider-progress form_input-range"
    @input="handleInput"
  >
</template>

<style scoped>
/*generated with Input range slider CSS style generator (version 20211225)
https://toughengineer.github.io/demo/slider-styler*/
.form_input-range {
  --height: 2em;

  min-height: var(--height);
  appearance: none;
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  --thumb-width: 4px;
  --thumb-height: var(--height);
  --thumb-box-shadow: 0 0 0px #e6e6e6;
  --thumb-border: none;
  --thumb-border-radius: 999px;
  --thumb-background: oklch(80% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));
  --thumb-background-hover: oklch(90% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));
  --thumb-background-active: oklch(70% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));

  --track-height: calc(var(--height) - var(--track-value-padding) * 2);
  --track-box-shadow: none;
  --track-border: solid 2px rgb(238, 238, 238);
  --track-border-radius: 6px;
  --track-background: rgb(238, 238, 238);
  --track-background-hover: rgb(238, 238, 238);
  --track-background-active: rgb(238, 238, 238);

  --track-value-background: rgb(255, 255, 255);
  --track-value-background-hover: rgb(255, 255, 255);
  --track-value-background-active: rgb(255, 255, 255);
  --track-value-padding: 2px;
}

.dark .form_input-range {
  --thumb-background: oklch(70% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));
  --thumb-background-hover: oklch(90% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));
  --thumb-background-active: oklch(80% var(--chromatic-chroma-200) calc(var(--chromatic-hue) + 0));

  --track-border: solid 2px rgb(44, 44, 44);
  --track-background: rgb(44, 44, 44);
  --track-background-hover: rgb(44, 44, 44);
  --track-background-active: rgb(44, 44, 44);

  --track-value-background: rgb(164, 164, 164);
  --track-value-background-hover: rgb(164, 164, 164);
  --track-value-background-active: rgb(164, 164, 164);
}

/*progress support*/
.form_input-range.slider-progress {
  --range: calc(var(--max) - var(--min));
  --ratio: calc((var(--value) - var(--min)) / var(--range));
  --sx: calc(0.5 * 0em + var(--ratio) * (100% - 0em));
}

.form_input-range:focus {
  outline: none;
}

/*webkit*/
.form_input-range::-webkit-slider-thumb {
  appearance: none;
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: var(--thumb-border);
  box-shadow: var(--thumb-box-shadow);
  margin-top: calc(var(--track-height) * 0.5 - var(--thumb-height) * 0.5 - 2px);
  margin-left: calc(0 - var(--track-value-padding));
  cursor: col-resize;
  transition:
    background 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

.form_input-range::-webkit-slider-runnable-track {
  height: var(--track-height);
  border: var(--track-border);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  box-shadow: var(--track-box-shadow);
  position: relative;
  cursor: col-resize;
  transition:
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out;
}

.form_input-range::-webkit-slider-thumb:hover {
  background: var(--thumb-background-hover);
}

.form_input-range:hover::-webkit-slider-runnable-track {
  background: var(--track-background-hover);
}

.form_input-range::-webkit-slider-thumb:active {
  background: var(--thumb-background-active);
}

.form_input-range:active::-webkit-slider-runnable-track {
  background: var(--track-background-active);
}

.form_input-range.slider-progress::-webkit-slider-runnable-track {
  /* margin-left: var(--track-value-padding); */
  margin-right: calc(0 - var(--track-value-padding));
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

.form_input-range.slider-progress:hover::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background-hover), var(--track-value-background-hover)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-hover);
}

.form_input-range.slider-progress:active::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background-active), var(--track-value-background-active)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-active);
}

/*mozilla*/
.form_input-range::-moz-range-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: none;
  box-shadow: var(--thumb-box-shadow);
  cursor: col-resize;
  margin-left: calc(0 - var(--track-value-padding));
}

.form_input-range::-moz-range-track {
  height: var(--track-height);
  border: var(--track-border);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  box-shadow: var(--track-box-shadow);
  cursor: col-resize;
  /* Trim left and right paddings of track */
  width: calc(100% - var(--track-value-padding) * 2);
}

.form_input-range::-moz-range-thumb:hover {
  background: var(--thumb-background-hover);
}

.form_input-range:hover::-moz-range-track {
  background: var(--track-background-hover);
}

.form_input-range::-moz-range-thumb:active {
  background: var(--thumb-background-active);
}

.form_input-range:active::-moz-range-track {
  background: var(--track-background-active);
}

.form_input-range.slider-progress::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

.form_input-range.slider-progress:hover::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background-hover), var(--track-value-background-hover)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-hover);
}

.form_input-range.slider-progress:active::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background-active), var(--track-value-background-active)) 0 / var(--sx) 100%
      no-repeat,
    var(--track-background-active);
}

/*ms*/
.form_input-range::-ms-fill-upper {
  background: transparent;
  border-color: transparent;
}

.form_input-range::-ms-fill-lower {
  background: transparent;
  border-color: transparent;
}

.form_input-range::-ms-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: var(--thumb-border);
  box-shadow: var(--thumb-box-shadow);
  /** Center thumb */
  margin-top: 0;
  /** Shift left thumb */
  margin-left: calc(0 - var(--track-value-padding));
  box-sizing: border-box;
  cursor: col-resize;
}

.form_input-range::-ms-track {
  height: var(--track-height);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  border: var(--track-border);
  box-shadow: var(--track-box-shadow);
  box-sizing: border-box;
  cursor: col-resize;
}

.form_input-range::-ms-thumb:hover {
  background: var(--thumb-background-hover);
}

.form_input-range:hover::-ms-track {
  background: var(--track-background-hover);
}

.form_input-range::-ms-thumb:active {
  background: var(--thumb-background-active);
}

.form_input-range:active::-ms-track {
  background: var(--track-background-active);
}

.form_input-range.slider-progress::-ms-fill-lower {
  height: var(--track-height);
  border-radius: var(--track-border-radius) 0 0 var(--track-border-radius);
  margin: 0;
  background: var(--track-value-background);
  border: none;
  border-right-width: 0;
  /** Shift left thumb */
  margin-left: calc(var(--track-value-padding));
  /** Shift right thumb */
  margin-right: calc(0 - var(--track-value-padding));
}

.form_input-range.slider-progress:hover::-ms-fill-lower {
  background: var(--track-value-background-hover);
}

.form_input-range.slider-progress:active::-ms-fill-lower {
  background: var(--track-value-background-active);
}
</style>
