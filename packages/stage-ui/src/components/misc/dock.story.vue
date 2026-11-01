<script setup lang="ts">
import type { DockSize, DockVariant } from '@proj-airi/ui'

import { Dock, DockButton, dockItemClasses, DockSeparator, DropdownMenu, MenuItem, Tooltip, TransitionBud } from '@proj-airi/ui'
import { computed, reactive, shallowRef } from 'vue'

import sceneUrl from '../../assets/backgrounds/cute-streaming-room-with-pastel-decor.avif'

// A translucent dock must stay readable on bright, dark, and detailed backgrounds. The scene is a stage background.
const backgrounds = {
  bright: { class: 'bg-neutral-100', style: undefined },
  dark: { class: 'bg-neutral-900', style: undefined },
  scene: { class: 'bg-cover bg-center', style: { backgroundImage: `url(${sceneUrl})` } },
}

const playground = reactive({
  orientation: 'horizontal' as 'horizontal' | 'vertical',
  size: 'sm' as DockSize,
  variant: 'default' as DockVariant,
  opacity: 0.8,
  blur: 12,
  background: 'scene' as keyof typeof backgrounds,
})
const muted = shallowRef(false)
const pinned = shallowRef(true)
const lastAction = shallowRef('None')

const background = computed(() => backgrounds[playground.background])

const feed = shallowRef(false)
const islandOrientation = shallowRef<'horizontal' | 'vertical'>('horizontal')

const states = [
  { id: 'action', title: 'Plain action', note: 'No aria-pressed', props: { icon: 'i-lucide:minimize-2', label: 'Hide chat' } },
  { id: 'off', title: 'Toggle, off', note: 'Light gray icon', props: { icon: 'i-mingcute:pin-2-line', pressedIcon: 'i-mingcute:pin-2-fill', label: 'Keep on top', pressed: false } },
  { id: 'on', title: 'Toggle, on', note: 'Theme-color icon, and the pressed icon', props: { icon: 'i-mingcute:pin-2-line', pressedIcon: 'i-mingcute:pin-2-fill', label: 'Keep on top', pressed: true } },
  { id: 'loading', title: 'Loading', note: 'Spinner, blocked', props: { icon: 'i-mingcute:refresh-2-line', label: 'Refreshing', loading: true } },
  { id: 'disabled', title: 'Disabled', note: 'Faded, blocked', props: { icon: 'i-mingcute:delete-2-line', label: 'Delete', disabled: true } },
  { id: 'no-tooltip', title: 'Without tooltip', note: 'For a button that shows its own label', props: { icon: 'i-mingcute:eye-line', label: 'Show', tooltip: false } },
]
</script>

<template>
  <Story title="Dock" group="misc">
    <Variant id="playground" title="Playground">
      <template #controls>
        <HstButtonGroup v-model="playground.orientation" title="Orientation" :options="['horizontal', 'vertical']" />
        <HstButtonGroup v-model="playground.size" title="Size" :options="['sm', 'md']" />
        <HstButtonGroup v-model="playground.variant" title="Variant" :options="['default', 'blurry']" />
        <HstSlider v-model="playground.opacity" title="Opacity (blurry)" :min="0" :max="1" :step="0.05" />
        <HstSlider v-model="playground.blur" title="Blur (blurry)" :min="0" :max="32" :step="1" />
        <HstButtonGroup v-model="playground.background" title="Background" :options="['bright', 'dark', 'scene']" />
      </template>
      <div :class="['flex flex-col gap-3 p-4']">
        <div
          :class="['h-72 flex items-center justify-center rounded-2xl', background.class]"
          :style="background.style"
        >
          <Dock
            :orientation="playground.orientation"
            :size="playground.size"
            :variant="playground.variant"
            :opacity="playground.opacity"
            :blur="playground.blur"
          >
            <DockButton icon="i-lucide:minimize-2" label="Hide chat" @click="lastAction = 'Hide chat'" />
            <DockSeparator />
            <DockButton
              icon="i-mingcute:volume-line"
              pressed-icon="i-mingcute:volume-off-line"
              :label="muted ? 'Unmute' : 'Mute'"
              :pressed="muted"
              @click="muted = !muted"
            />
            <DockButton
              icon="i-mingcute:pin-2-line"
              pressed-icon="i-mingcute:pin-2-fill"
              label="Keep on top"
              :pressed="pinned"
              @click="pinned = !pinned"
            />
            <DropdownMenu align="end">
              <template #trigger>
                <DockButton icon="i-mingcute:layers-line" label="Chat window style" />
              </template>
              <MenuItem @select="lastAction = 'Classic window'">
                Classic window
              </MenuItem>
              <MenuItem @select="lastAction = 'Floating'">
                Floating
              </MenuItem>
            </DropdownMenu>
          </Dock>
        </div>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          Hover a button to see its tooltip. Muted: {{ muted ? 'on' : 'off' }} · Keep on top: {{ pinned ? 'on' : 'off' }} ·
          Last action: {{ lastAction }}
        </p>
      </div>
    </Variant>

    <Variant id="island" title="Island: bud and merge">
      <template #controls>
        <HstButtonGroup v-model="islandOrientation" title="Orientation" :options="['horizontal', 'vertical']" />
      </template>
      <div :class="['flex flex-col gap-6 p-4']">
        <ol :class="['list-decimal pl-5 text-sm text-neutral-600 dark:text-neutral-300', 'flex flex-col gap-1']">
          <li>Turn on the message feed. Its settings bud off the dock as an island. Turn it off, and the island merges back.</li>
          <li>Put the island in the same row or column as the dock, after it, with an 8px gap.</li>
          <li>Wrap the island in <code>TransitionBud</code>, and show it with <code>v-if</code>.</li>
          <li>Set <code>from</code> to the side of the island where the dock is.</li>
          <li>Keep the dock above the island, for example with <code>z-index</code>, so the island hides under the dock.</li>
        </ol>
        <!-- The row starts at its edge, so the dock stays in place when the island buds off. -->
        <div :class="['h-48 flex gap-2', islandOrientation === 'vertical' ? 'flex-col items-start' : 'items-start']">
          <Dock :orientation="islandOrientation" :class="['relative z-1']">
            <DockButton icon="i-lucide:minimize-2" label="Hide chat" />
            <DockSeparator />
            <DockButton icon="i-mingcute:subtitle-line" label="Message feed" :pressed="feed" @click="feed = !feed" />
          </Dock>
          <TransitionBud :from="islandOrientation === 'vertical' ? 'top' : 'left'">
            <Dock v-if="feed" :class="['relative z-0']">
              <DockButton icon="i-mingcute:sandglass-line" label="Hide read messages" />
            </Dock>
          </TransitionBud>
        </div>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          Message feed: {{ feed ? 'on' : 'off' }}
        </p>
      </div>
    </Variant>

    <Variant id="states" title="Button states">
      <div :class="['flex flex-col gap-3 p-4']">
        <div v-for="state in states" :key="state.id" :class="['flex items-center gap-4']">
          <Dock>
            <DockButton v-bind="state.props" />
          </Dock>
          <div :class="['flex flex-col']">
            <span :class="['text-sm font-medium']">{{ state.title }}</span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ state.note }}</span>
          </div>
        </div>
      </div>
    </Variant>

    <Variant id="in-airi" title="In AIRI">
      <div :class="['flex flex-wrap items-start gap-12 p-4']">
        <div :class="['flex flex-col gap-3']">
          <span :class="['text-sm font-medium']">Floating chat dock: horizontal, small, blurry</span>
          <Dock variant="blurry">
            <DockButton icon="i-lucide:minimize-2" label="Hide chat" />
            <!-- A custom item takes `dockItemClasses`, so its icon and text match the buttons beside it. -->
            <Tooltip label="Conversations">
              <button
                type="button"
                :class="['flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 outline-none transition-colors', dockItemClasses('blurry')]"
              >
                <span :class="['size-6 flex items-center justify-center']">
                  <span :class="['i-mingcute:chat-2-line size-4']" />
                </span>
                <span :class="['text-sm font-medium']">AIRI</span>
              </button>
            </Tooltip>
            <DockSeparator />
            <DockButton icon="i-mingcute:volume-line" label="Mute" />
            <DockButton icon="i-mingcute:subtitle-line" label="Message feed" :pressed="false" />
            <DockButton icon="i-mingcute:pin-2-line" pressed-icon="i-mingcute:pin-2-fill" label="Keep on top" :pressed="true" />
            <DockButton icon="i-mingcute:layers-line" label="Chat window style" />
          </Dock>
        </div>
        <div :class="['flex flex-col gap-3']">
          <span :class="['text-sm font-medium']">Fullscreen island: vertical, medium, blurry</span>
          <div :class="['flex flex-col items-start gap-2']">
            <Dock orientation="vertical" size="md" variant="blurry">
              <DockButton icon="i-mingcute:settings-3-line" label="Settings" :pressed="false" />
              <DockButton icon="i-mingcute:chat-2-line" label="Chat" :pressed="true" />
              <DockSeparator />
              <DockButton icon="i-mingcute:sun-line" label="Switch to dark mode" />
            </Dock>
            <Dock orientation="vertical" size="md" variant="blurry">
              <DockButton icon="i-mingcute:fullscreen-exit-line" label="Exit fullscreen" />
            </Dock>
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
