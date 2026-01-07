<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
})

const modelValue = defineModel<number>({ required: true })

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

onMounted(() => updateTrackColor())
watch(sliderValue, () => updateTrackColor(), { immediate: true })
watch([scaledMin, scaledMax, scaledStep], () => updateTrackColor(), { immediate: true })

function updateTrackColor() {
  if (!sliderRef.value) {
    return
  }

  sliderRef.value.style.setProperty('--value', sliderValue.value.toString())
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
    class="slider-progress form_input-round-range"
    @input="handleInput"
  >
</template>

<style scoped>
/*generated with Input range slider CSS style generator (version 20211225)
https://toughengineer.github.io/demo/slider-styler*/
.form_input-round-range {
  --height: 2em;

  min-height: var(--height);
  appearance: none;
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;

  --thumb-width: var(--height);
  --thumb-height: var(--height);
  --thumb-box-shadow: none;
  --thumb-border: none;
  --thumb-border-radius: 0px;
  --thumb-background: transparent;

  --track-height: calc(var(--height) - var(--track-value-padding) * 2);
  --track-box-shadow: 0 0 12px -2px rgb(0 0 0 / 22%);
  --track-border: none;
  --track-border-radius: 10px;
  --track-background: rgba(0, 0, 0, 0.4);

  --track-value-background: rgb(255, 255, 255);
  --track-value-padding: 0px;
}

[data-direction="vertical"].form_input-round-range {
  transform: rotate(180deg);
}

.dark .form_input-round-range {
  --thumb-background: rgb(238, 238, 238);

  --track-border: none;
  --track-background: rgba(99, 99, 99, 0.7);
  --track-box-shadow: 0 0 12px -2px rgb(0 0 0 / 22%);

  --track-value-background: rgb(238, 238, 238);
}

/*progress support*/
.form_input-round-range.slider-progress {
  --range: calc(var(--max) - var(--min));
  --ratio: calc((var(--value) - var(--min)) / var(--range));
  --sx: calc(0.5 * 0em + var(--ratio) * (100% - 0em));
}

.form_input-round-range:focus {
  outline: none;
}

/*webkit*/
.form_input-round-range::-webkit-slider-thumb {
  appearance: none;
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: var(--thumb-border);
  box-shadow: var(--thumb-box-shadow);
  margin-top: 0px;
  margin-left: calc(0 - var(--track-value-padding));
  cursor: col-resize;
  transition:
    background 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out,
    transform 0.2s cubic-bezier(0.165, 0.84, 0.44, 1),
    width 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
}

[data-direction="vertical"]::-webkit-slider-thumb {
  cursor: ns-resize;
}

.form_input-round-range::-webkit-slider-runnable-track {
  height: var(--track-height);
  border: var(--track-border);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  backdrop-filter: blur(4px);
  box-shadow: var(--track-box-shadow);
  position: relative;
  cursor: col-resize;
  overflow: hidden;
  transition:
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out;
}

[data-direction="vertical"]::-webkit-slider-runnable-track {
  cursor: ns-resize;
}

.form_input-round-range.slider-progress::-webkit-slider-runnable-track {
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

[data-direction="vertical"].form_input-round-range.slider-progress::-webkit-slider-runnable-track {
  background: linear-gradient(var(--track-value-background) var(--sx), var(--track-background) var(--sx)) no-repeat;
}

/*mozilla*/
.form_input-round-range::-moz-range-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: none;
  box-shadow: var(--thumb-box-shadow);
  cursor: col-resize;
  margin-left: calc(0 - var(--track-value-padding));
  transition:
    background 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out,
    transform 0.2s cubic-bezier(0.165, 0.84, 0.44, 1),
    width 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
}

[data-direction="vertical"]::-moz-range-thumb {
  cursor: ns-resize;
}

.form_input-round-range::-moz-range-track {
  height: var(--track-height);
  border: var(--track-border);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  backdrop-filter: blur(4px);
  box-shadow: var(--track-box-shadow);
  cursor: col-resize;
  overflow: hidden;
  /* Trim left and right paddings of track */
  width: calc(100% - var(--track-value-padding) * 2);
}

[data-direction="vertical"]::-moz-range-track {
  cursor: ns-resize;
}

.form_input-round-range.slider-progress::-moz-range-track {
  background:
    linear-gradient(var(--track-value-background), var(--track-value-background)) 0 / var(--sx) 100% no-repeat,
    var(--track-background);
}

[data-direction="vertical"].form_input-round-range.slider-progress::-moz-range-track {
  background: linear-gradient(var(--track-value-background) var(--sx), var(--track-background) var(--sx)) no-repeat;
}

/*ms*/
.form_input-round-range::-ms-fill-upper {
  background: transparent;
  border-color: transparent;
}

.form_input-round-range::-ms-fill-lower {
  background: transparent;
  border-color: transparent;
}

.form_input-round-range::-ms-thumb {
  width: var(--thumb-width);
  height: var(--thumb-height);
  border-radius: var(--thumb-border-radius);
  background: var(--thumb-background);
  border: var(--thumb-border);
  box-shadow: var(--thumb-box-shadow);
  box-sizing: border-box;
  cursor: col-resize;

  transition:
    background 0.2s ease-in-out,
    box-shadow 0.2s ease-in-out,
    border-color 0.2s ease-in-out,
    transform 0.2s cubic-bezier(0.165, 0.84, 0.44, 1),
    width 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
}

[data-direction="vertical"]::-ms-thumb {
  cursor: ns-resize;
}

.form_input-round-range::-ms-track {
  height: var(--track-height);
  border-radius: var(--track-border-radius);
  background: var(--track-background);
  backdrop-filter: blur(4px);
  border: var(--track-border);
  box-shadow: var(--track-box-shadow);
  box-sizing: border-box;
  cursor: col-resize;
  overflow: hidden;
}

[data-direction="vertical"]::-ms-track {
  cursor: ns-resize;
}

.form_input-round-range.slider-progress::-ms-fill-lower {
  height: var(--track-height);
  border-radius: var(--track-border-radius) 0 0 var(--track-border-radius);
  margin: 0;
  background: var(--track-value-background);
  border: none;
  border-right-width: 0;
}
</style>
