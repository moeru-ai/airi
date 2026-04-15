<script setup lang="ts">
import type { GenericComponentInstance } from 'reka-ui'
import type { Ref } from 'vue'
import type { RouteRecordNormalized } from 'vue-router'

import { useMagicKeys } from '@vueuse/core'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  ListboxContent,
  ListboxFilter,
  ListboxItem,
  ListboxRoot,
} from 'reka-ui'
import { computed, inject, onBeforeUnmount, ref, unref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useSceneNavigation } from '../../composables/screen-navigation/use-screen-navigation'
import { injectSceneRouterStore } from '../screen-router/context'

interface SceneDefinition {
  id: string
  title: string
}

interface SceneNavigatorProps {
  currentSceneId?: Ref<string> | string
  onNavigate?: (sceneId: string) => void
  scenes?: readonly SceneDefinition[]
}

const props = defineProps<SceneNavigatorProps>()
const router = useRouter()
const route = useRoute()
const sceneRouterStore = inject(injectSceneRouterStore, null)

const isPaletteOpen = ref(false)
const isPanelVisible = ref(false)
const listboxRef = ref<GenericComponentInstance<typeof ListboxRoot>>()

let panelHideTimer: ReturnType<typeof setTimeout> | undefined

function createRouteTitle(routeRecord: RouteRecordNormalized): string {
  if (typeof routeRecord.meta.title === 'string' && routeRecord.meta.title.length > 0) {
    return routeRecord.meta.title
  }

  const pathToken = routeRecord.path
    .split('/')
    .filter(Boolean)
    .at(-1)

  if (!pathToken) {
    return 'Home'
  }

  return pathToken
    .split('-')
    .filter(Boolean)
    .map(token => token[0]?.toUpperCase() + token.slice(1))
    .join(' ')
}

const routeScenes = computed<SceneDefinition[]>(() => {
  const normalizedRoutes = router.getRoutes()
    .filter((routeRecord) => {
      if (routeRecord.redirect) {
        return false
      }

      if (routeRecord.path.includes(':')) {
        return false
      }

      return routeRecord.meta.sceneNavigator !== false
    })

  const dedupedByPath = new Map<string, SceneDefinition>()
  for (const routeRecord of normalizedRoutes) {
    if (dedupedByPath.has(routeRecord.path)) {
      continue
    }

    dedupedByPath.set(routeRecord.path, {
      id: routeRecord.path,
      title: createRouteTitle(routeRecord),
    })
  }

  return [...dedupedByPath.values()].sort((a, b) => a.id.localeCompare(b.id))
})

const captureRootScenes = computed<SceneDefinition[]>(() => {
  if (!sceneRouterStore) {
    return []
  }

  return sceneRouterStore.currentRouteCaptureRoots.value.map(captureRoot => ({
    id: captureRoot.id,
    title: captureRoot.title,
  }))
})

const resolvedScenes = computed(() => {
  if (props.scenes) {
    return props.scenes
  }

  if (captureRootScenes.value.length > 0) {
    return captureRootScenes.value
  }

  return routeScenes.value
})

const resolvedCurrentSceneId = computed(() => (
  props.currentSceneId
    ? unref(props.currentSceneId)
    : captureRootScenes.value.length > 0
      ? sceneRouterStore?.activeCaptureRootId.value ?? captureRootScenes.value[0]?.id ?? route.path
      : route.path
))
const currentSceneId = resolvedCurrentSceneId

function navigateToScene(sceneId: string): void {
  if (props.onNavigate) {
    props.onNavigate(sceneId)
    return
  }

  if (sceneId === route.path) {
    return
  }

  if (captureRootScenes.value.length > 0 && sceneRouterStore) {
    void sceneRouterStore.navigateToCaptureRoot(sceneId)
    return
  }

  void router.push({ path: sceneId })
}

const navigation = useSceneNavigation({
  currentSceneId: resolvedCurrentSceneId,
  onNavigate: computed(() => navigateToScene),
  scenes: resolvedScenes,
})

const {
  canGoNext,
  canGoPrev,
  goNext,
  goPrev,
  goToScene,
  paletteItems,
  searchQuery,
} = navigation

function openPalette() {
  isPaletteOpen.value = true
}

function closePalette() {
  isPaletteOpen.value = false
}

function clearPanelHideTimer(): void {
  if (!panelHideTimer) {
    return
  }

  clearTimeout(panelHideTimer)
  panelHideTimer = undefined
}

function schedulePanelHide(): void {
  clearPanelHideTimer()
  panelHideTimer = setTimeout(() => {
    if (isPaletteOpen.value) {
      return
    }

    isPanelVisible.value = false
  }, 1200)
}

function revealPanel(): void {
  isPanelVisible.value = true
  schedulePanelHide()
}

function selectScene(sceneId: string) {
  goToScene(sceneId)
  closePalette()
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}

function hasEditableFocus(): boolean {
  return isEditableTarget(document.activeElement)
}

watch(isPaletteOpen, (isOpen) => {
  if (isOpen) {
    isPanelVisible.value = true
    clearPanelHideTimer()
    requestAnimationFrame(() => {
      listboxRef.value?.highlightFirstItem()
    })
  }
  else {
    schedulePanelHide()
  }
})

onBeforeUnmount(() => {
  clearPanelHideTimer()
})

const { ctrl_k, meta_k, escape, arrowleft, arrowright, space } = useMagicKeys()

watch(escape, val => val && closePalette())
watch([ctrl_k, meta_k], ([ctrl, meta]) => (ctrl || meta) && openPalette())
watch(arrowleft, val => val && !isPaletteOpen.value && !hasEditableFocus() && goPrev())
watch(arrowright, val => val && !isPaletteOpen.value && !hasEditableFocus() && goNext())
watch(space, val => val && !isPaletteOpen.value && !hasEditableFocus() && goNext())
</script>

<template>
  <div
    :class="[
      'fixed bottom-4 left-4 z-50 size-12',
    ]"
    @mouseenter="revealPanel"
    @mouseleave="schedulePanelHide"
  >
    <button
      v-if="!isPanelVisible && !isPaletteOpen"
      type="button"
      aria-label="Show scene navigation"
      :class="[
        'absolute inset-0 rounded-xl bg-transparent',
      ]"
      @focus="revealPanel"
    />

    <div
      :class="[
        'absolute bottom-0 left-0 flex items-center gap-1 rounded-xl bg-neutral-950/68 p-1.5 backdrop-blur-xl transition-all duration-250 ease-out',
        isPanelVisible || isPaletteOpen
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-1 pointer-events-none',
      ]"
    >
      <button
        data-scene-nav-prev
        type="button"
        :disabled="!canGoPrev"
        :class="[
          'inline-flex size-8 items-center justify-center rounded-lg text-white/86',
          'transition duration-150 ease-out hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80',
          'disabled:cursor-not-allowed disabled:opacity-35',
        ]"
        @click="goPrev"
      >
        <span :class="['i-ph-arrow-left text-base']" />
      </button>

      <DialogRoot v-model:open="isPaletteOpen">
        <DialogTrigger as-child>
          <button
            data-scene-nav-jump
            type="button"
            :class="[
              'inline-flex size-8 items-center justify-center rounded-lg text-white/86',
              'transition duration-150 ease-out hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80',
            ]"
          >
            <span :class="['i-ph-magnifying-glass text-base']" />
          </button>
        </DialogTrigger>

        <DialogPortal>
          <DialogOverlay
            :class="[
              'pointer-events-auto fixed inset-0 z-60 bg-black/40',
            ]"
          />
          <DialogContent
            data-scene-nav-palette
            :class="[
              'fixed left-1/2 top-[18dvh] z-60 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-white/12 bg-neutral-950/94 p-3 text-white',
              'shadow-2xl shadow-black/40 backdrop-blur-xl focus:outline-none',
            ]"
          >
            <DialogTitle :class="['sr-only']">
              Jump to scene
            </DialogTitle>
            <DialogDescription :class="['sr-only']">
              Search and select a scene to navigate.
            </DialogDescription>

            <ListboxRoot ref="listboxRef">
              <label :class="['block']">
                <span :class="['sr-only']">Search scenes</span>
                <ListboxFilter
                  v-model="searchQuery"
                  placeholder="Jump to scene"
                  auto-focus
                  :class="[
                    'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-white outline-none',
                    'placeholder:text-white/35 focus:ring-2 focus:ring-neutral-400/20',
                  ]"
                />
              </label>

              <ListboxContent
                v-if="paletteItems.length > 0"
                as="ul"
                :class="['mt-3 max-h-72 overflow-auto rounded-xl bg-white/4 p-1 flex flex-col gap-1']"
              >
                <ListboxItem
                  v-for="scene in paletteItems"
                  :key="scene.id"
                  :value="scene.id"
                  as-child
                  @select="selectScene(scene.id)"
                >
                  <button
                    :data-scene-nav-item="scene.id"
                    type="button"
                    :class="[
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
                      'data-[highlighted]:bg-white/15 data-[highlighted]:text-white',
                      scene.id === currentSceneId
                        ? 'bg-white/12 text-white'
                        : 'text-white/78 hover:bg-white/8 hover:text-white',
                    ]"
                  >
                    <span :class="['min-w-0 truncate font-medium']">{{ scene.title }}</span>
                  </button>
                </ListboxItem>
              </ListboxContent>
            </ListboxRoot>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <button
        data-scene-nav-next
        type="button"
        :disabled="!canGoNext"
        :class="[
          'inline-flex size-8 items-center justify-center rounded-lg text-white/86',
          'transition duration-150 ease-out hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80',
          'disabled:cursor-not-allowed disabled:opacity-35',
        ]"
        @click="goNext"
      >
        <span :class="['i-ph-arrow-left-bold text-base rotate-180']" />
      </button>
    </div>
  </div>
</template>
