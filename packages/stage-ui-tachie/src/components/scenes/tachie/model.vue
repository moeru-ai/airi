<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Texture } from '@pixi/core'

import type { TachieEmotion } from '../../../constants/emotions'
import type { TachieLoadedAssets } from '../../../utils/tachie-archive'

import { errorMessageFrom } from '@moeru/std'
import { Texture as PixiTexture, Renderer } from '@pixi/core'
import { Sprite } from '@pixi/sprite'
import { useTheme } from '@proj-airi/ui'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

import { DEFAULT_TACHIE_EMOTION, isTachieEmotion } from '../../../constants/emotions'
import { useTachie } from '../../../stores/tachie'
import {
  loadTachieZip,
  MAX_TACHIE_ARCHIVE_BYTES,
} from '../../../utils/tachie-archive'

interface MountedTachie {
  assets: TachieLoadedAssets
  sprite: Sprite
  textures: Map<TachieEmotion, Texture>
}

const props = withDefaults(defineProps<{
  app: Application
  modelSrc?: string
  modelId?: string
  width: number
  height: number
  shadowEnabled?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  paused?: boolean
}>(), {
  shadowEnabled: true,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  paused: false,
})

const emit = defineEmits<{
  error: [value: unknown]
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const shadowColorRef = useTemplateRef<HTMLDivElement>('shadowColor')
const currentModel = shallowRef<MountedTachie>()
const { isDark } = useTheme()
const { position, scale } = storeToRefs(useTachie())
const shadowFilter = new DropShadowFilter({
  alpha: 0.2,
  blur: 0,
  distance: 20,
  rotation: 45,
})

let loadSequence = 0
let loadAbortController: AbortController | undefined
let shadowAnimationFrame = 0

function render() {
  try {
    props.app.render()
  }
  catch (error) {
    console.error('[Tachie] Pixi render error.', error)
    emit('error', error)
  }
}

function applyTransform(model = currentModel.value) {
  if (!model)
    return

  const containScale = Math.min(
    props.width / model.assets.width,
    props.height / model.assets.height,
  )
  model.sprite.scale.set(containScale * scale.value)
  model.sprite.position.set(
    props.width / 2 + position.value.x,
    props.height / 2 + position.value.y,
  )
  render()
}

function applyShadow(model = currentModel.value) {
  if (!model)
    return

  if (!props.shadowEnabled) {
    model.sprite.filters = []
    render()
    return
  }

  const colorElement = shadowColorRef.value
  if (colorElement) {
    const color = formatHex(getComputedStyle(colorElement).backgroundColor)
    if (color)
      shadowFilter.color = Number(color.replace('#', '0x'))
  }
  model.sprite.filters = [shadowFilter]
  render()
}

function stopDynamicShadow() {
  cancelAnimationFrame(shadowAnimationFrame)
  shadowAnimationFrame = 0
}

function updateDynamicShadow() {
  applyShadow()
  if (props.themeColorsHueDynamic && props.shadowEnabled && !props.paused)
    shadowAnimationFrame = requestAnimationFrame(updateDynamicShadow)
  else
    shadowAnimationFrame = 0
}

function syncDynamicShadow() {
  stopDynamicShadow()
  updateDynamicShadow()
}

function disposeMountedModel(model?: MountedTachie) {
  if (!model)
    return

  props.app.stage.removeChild(model.sprite)
  model.sprite.destroy()
  for (const texture of model.textures.values())
    texture.destroy(true)
  model.assets.dispose()
}

async function fetchModelSource(source: string, signal: AbortSignal) {
  const response = await fetch(source, { signal })
  if (!response.ok)
    throw new Error(`Failed to fetch Tachie archive (${response.status} ${response.statusText}).`)

  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_TACHIE_ARCHIVE_BYTES)
    throw new Error('Tachie archive exceeds the 100 MiB compressed size limit.')

  return response.blob()
}

function createMountedModel(assets: TachieLoadedAssets): MountedTachie {
  if (!(props.app.renderer instanceof Renderer)) {
    assets.dispose()
    throw new Error('Tachie rendering requires a WebGL renderer.')
  }

  const textures = new Map<TachieEmotion, Texture>()
  try {
    for (const [emotion, image] of assets.images) {
      const texture = PixiTexture.from(image.source)
      // Force the upload now so later emotion changes do not pay a first-use
      // texture upload cost or reveal a decode failure mid-conversation.
      props.app.renderer.texture.bind(texture.baseTexture)
      textures.set(emotion, texture)
    }

    const neutralTexture = textures.get(DEFAULT_TACHIE_EMOTION)
    if (!neutralTexture)
      throw new Error('Decoded Tachie model has no neutral texture.')

    const sprite = new Sprite(neutralTexture)
    sprite.anchor.set(0.5)
    return { assets, sprite, textures }
  }
  catch (error) {
    for (const texture of textures.values())
      texture.destroy(true)
    assets.dispose()
    throw error
  }
}

async function loadModel() {
  const requestId = ++loadSequence
  loadAbortController?.abort()
  loadAbortController = undefined

  if (!props.modelSrc) {
    disposeMountedModel(currentModel.value)
    currentModel.value = undefined
    componentState.value = 'mounted'
    render()
    return
  }

  const controller = new AbortController()
  loadAbortController = controller
  componentState.value = 'loading'

  try {
    const archive = await fetchModelSource(props.modelSrc, controller.signal)
    const assets = await loadTachieZip(archive)
    if (requestId !== loadSequence || controller.signal.aborted) {
      assets.dispose()
      return
    }

    const nextModel = createMountedModel(assets)
    nextModel.sprite.visible = false
    props.app.stage.addChild(nextModel.sprite)
    applyTransform(nextModel)
    applyShadow(nextModel)
    nextModel.sprite.visible = true
    render()

    const previousModel = currentModel.value
    currentModel.value = nextModel
    disposeMountedModel(previousModel)
    componentState.value = 'mounted'
  }
  catch (error) {
    if (controller.signal.aborted)
      return

    console.error('[Tachie] Failed to load model:', errorMessageFrom(error))
    componentState.value = currentModel.value ? 'mounted' : 'pending'
    emit('error', error)
  }
  finally {
    if (loadAbortController === controller)
      loadAbortController = undefined
  }
}

/**
 * Displays the requested AIRI emotion, falling back to the required neutral
 * image when the archive does not provide that state.
 */
function setEmotion(emotion: string, _intensity = 1): TachieEmotion | undefined {
  const model = currentModel.value
  if (!model)
    return undefined

  const requested = isTachieEmotion(emotion) ? emotion : DEFAULT_TACHIE_EMOTION
  const resolved = model.textures.has(requested) ? requested : DEFAULT_TACHIE_EMOTION
  const texture = model.textures.get(resolved)
  if (!texture)
    return undefined

  model.sprite.texture = texture
  render()
  return resolved
}

watch(() => props.modelSrc, () => void loadModel(), { immediate: true })
watch(
  [() => props.width, () => props.height, position, scale],
  () => applyTransform(),
  { deep: true },
)
watch(
  [() => props.shadowEnabled, () => props.themeColorsHue, isDark],
  () => applyShadow(),
)
watch(
  [() => props.themeColorsHueDynamic, () => props.shadowEnabled, () => props.paused],
  syncDynamicShadow,
)

onMounted(syncDynamicShadow)

onUnmounted(() => {
  loadSequence++
  loadAbortController?.abort()
  stopDynamicShadow()
  disposeMountedModel(currentModel.value)
  currentModel.value = undefined
})

defineExpose({
  setEmotion,
})
</script>

<template>
  <div
    ref="shadowColor"
    :class="[
      'hidden',
      'bg-primary-400 dark:bg-primary-500',
    ]"
  />
</template>
