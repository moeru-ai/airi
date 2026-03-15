<script setup lang="ts">
import type {
  PluginHostSessionSummary,
  PluginManifestSummary,
} from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'

import { Section } from '@proj-airi/stage-ui/components'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { Button, Callout, Input } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

const store = usePluginHostInspectorStore()
const filter = ref('')
const selectedPluginName = ref('')

const discoveredPlugins = computed(() => {
  const query = filter.value.trim().toLowerCase()
  const plugins = store.discoveredPlugins.slice().sort((left, right) => left.name.localeCompare(right.name))
  if (!query)
    return plugins
  return plugins.filter(plugin =>
    plugin.name.toLowerCase().includes(query)
    || plugin.path.toLowerCase().includes(query),
  )
})

const enabledPlugins = computed(() => {
  return discoveredPlugins.value.filter(plugin => plugin.enabled)
})

const loadedPlugins = computed(() => {
  return discoveredPlugins.value.filter(plugin => plugin.loaded)
})

const sessionByPluginName = computed(() => {
  const map = new Map<string, PluginHostSessionSummary>()
  for (const session of store.sessions) {
    map.set(session.manifestName, session)
  }
  return map
})

const readyCapabilitiesCount = computed(() => {
  return store.capabilities.filter(capability => capability.state === 'ready').length
})

function chipClasses(theme: 'neutral' | 'emerald' | 'amber') {
  if (theme === 'emerald') {
    return [
      'bg-emerald-100',
      'text-emerald-700',
      'dark:bg-emerald-900/50',
      'dark:text-emerald-300',
      'border-emerald-300',
      'dark:border-emerald-700',
    ]
  }

  if (theme === 'amber') {
    return [
      'bg-amber-100',
      'text-amber-700',
      'dark:bg-amber-900/50',
      'dark:text-amber-300',
      'border-amber-300',
      'dark:border-amber-700',
    ]
  }

  return [
    'bg-neutral-100',
    'text-neutral-700',
    'dark:bg-neutral-800',
    'dark:text-neutral-300',
    'border-neutral-300',
    'dark:border-neutral-700',
  ]
}

function phaseChipTheme(phase: string) {
  if (phase === 'ready')
    return 'emerald'
  if (phase === 'failed')
    return 'amber'
  if (phase === 'loading' || phase === 'authenticating' || phase === 'preparing')
    return 'amber'
  return 'neutral'
}

async function refresh() {
  try {
    await store.refreshAll()
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to refresh plugin host debug state.')
  }
}

async function loadEnabled() {
  try {
    await store.loadEnabled()
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to load enabled plugins.')
  }
}

async function setEnabled(plugin: PluginManifestSummary, enabled: boolean) {
  try {
    await store.setEnabled({
      name: plugin.name,
      enabled,
      path: plugin.path,
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `Failed to update enabled state for ${plugin.name}.`)
  }
}

async function loadPlugin(plugin: PluginManifestSummary) {
  try {
    await store.load({ name: plugin.name })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `Failed to load plugin ${plugin.name}.`)
  }
}

async function unloadPlugin(plugin: PluginManifestSummary) {
  try {
    await store.unload({ name: plugin.name })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `Failed to unload plugin ${plugin.name}.`)
  }
}

async function loadSelectedPlugin() {
  const name = selectedPluginName.value.trim()
  if (!name) {
    toast.error('Enter a plugin name to load.')
    return
  }

  try {
    await store.load({ name })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `Failed to load plugin ${name}.`)
  }
}

onMounted(async () => {
  await refresh()
})
</script>

<template>
  <div :class="['h-full', 'flex', 'flex-col', 'gap-4', 'overflow-y-auto', 'p-4']">
    <Callout
      v-if="!store.isAvailable"
      theme="orange"
      label="Plugin host debug is unavailable in this runtime."
      description="Open this page from Stage Tamagotchi renderer to use Electron plugin host controls."
    />

    <Callout
      v-if="store.error"
      theme="orange"
      label="Last Error"
      :description="store.error"
    />

    <div :class="['grid', 'gap-2', 'sm:grid-cols-2', 'xl:grid-cols-4']">
      <div :class="['rounded-xl', 'bg-neutral-100', 'p-3', 'dark:bg-neutral-900/70']">
        <div :class="['text-xs', 'uppercase', 'opacity-70']">
          Discovered
        </div>
        <div :class="['text-2xl', 'font-semibold']">
          {{ store.discoveredPlugins.length }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-neutral-100', 'p-3', 'dark:bg-neutral-900/70']">
        <div :class="['text-xs', 'uppercase', 'opacity-70']">
          Enabled
        </div>
        <div :class="['text-2xl', 'font-semibold']">
          {{ store.enabledPlugins.length }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-neutral-100', 'p-3', 'dark:bg-neutral-900/70']">
        <div :class="['text-xs', 'uppercase', 'opacity-70']">
          Loaded
        </div>
        <div :class="['text-2xl', 'font-semibold']">
          {{ store.loadedPlugins.length }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-neutral-100', 'p-3', 'dark:bg-neutral-900/70']">
        <div :class="['text-xs', 'uppercase', 'opacity-70']">
          Capabilities
        </div>
        <div :class="['text-2xl', 'font-semibold']">
          {{ readyCapabilitiesCount }} / {{ store.capabilities.length }}
        </div>
      </div>
    </div>

    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Input
        v-model="filter"
        placeholder="Filter discovered plugins..."
        class="max-w-[440px] min-w-[280px]"
      />
      <Button
        label="Refresh"
        icon="i-solar:refresh-bold-duotone"
        size="sm"
        :loading="store.loading"
        @click="refresh"
      />
      <Button
        label="Load Enabled"
        icon="i-solar:play-bold-duotone"
        size="sm"
        :loading="store.loading"
        @click="loadEnabled"
      />
    </div>

    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Input
        v-model="selectedPluginName"
        placeholder="Load discovered plugin by exact name..."
        class="max-w-[520px] min-w-[320px]"
      />
      <Button
        label="Load Plugin"
        icon="i-solar:download-minimalistic-bold-duotone"
        size="sm"
        :disabled="!selectedPluginName.trim()"
        :loading="store.loading"
        @click="loadSelectedPlugin"
      />
    </div>

    <Section
      title="Discovered Plugins"
      icon="i-solar:list-check-bold-duotone"
      inner-class="gap-3"
    >
      <div
        v-if="discoveredPlugins.length === 0"
        :class="['rounded-xl', 'border', 'border-dashed', 'border-neutral-400/50', 'p-4', 'text-sm', 'opacity-70']"
      >
        No discovered plugin manifests found.
      </div>

      <div v-else :class="['grid', 'gap-3']">
        <div
          v-for="plugin in discoveredPlugins"
          :key="plugin.path"
          :class="['rounded-xl', 'border', 'border-neutral-300', 'bg-white/70', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']"
        >
          <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-2']">
            <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
              <div :class="['font-semibold']">
                {{ plugin.name }}
              </div>
              <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses(plugin.enabled ? 'emerald' : 'neutral')]">
                {{ plugin.enabled ? 'enabled' : 'disabled' }}
              </span>
              <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses(plugin.loaded ? 'emerald' : 'neutral')]">
                {{ plugin.loaded ? 'loaded' : 'not loaded' }}
              </span>
              <span v-if="plugin.isNew" :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses('amber')]">
                new
              </span>
            </div>
            <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
              <Button
                size="sm"
                variant="secondary"
                :label="plugin.enabled ? 'Disable' : 'Enable'"
                :icon="plugin.enabled ? 'i-solar:lock-keyhole-minimalistic-unlocked-bold-duotone' : 'i-solar:lock-keyhole-bold-duotone'"
                :loading="store.loading"
                @click="setEnabled(plugin, !plugin.enabled)"
              />
              <Button
                size="sm"
                variant="secondary"
                label="Load"
                icon="i-solar:play-bold-duotone"
                :disabled="plugin.loaded"
                :loading="store.loading"
                @click="loadPlugin(plugin)"
              />
              <Button
                size="sm"
                variant="ghost"
                label="Unload"
                icon="i-solar:stop-bold-duotone"
                :disabled="!plugin.loaded"
                :loading="store.loading"
                @click="unloadPlugin(plugin)"
              />
            </div>
          </div>

          <div :class="['mt-2', 'text-xs', 'opacity-70', 'font-mono', 'break-all']">
            {{ plugin.path }}
          </div>
          <div :class="['mt-2', 'text-xs', 'opacity-70']">
            entrypoints: {{ JSON.stringify(plugin.entrypoints) }}
          </div>
          <div
            v-if="sessionByPluginName.get(plugin.name)"
            :class="['mt-2', 'flex', 'items-center', 'gap-2', 'text-sm']"
          >
            <span>phase:</span>
            <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses(phaseChipTheme(sessionByPluginName.get(plugin.name)!.phase))]">
              {{ sessionByPluginName.get(plugin.name)!.phase }}
            </span>
            <span :class="['opacity-70', 'font-mono']">{{ sessionByPluginName.get(plugin.name)!.moduleId }}</span>
          </div>
        </div>
      </div>
    </Section>

    <Section
      title="Enabled Plugins"
      icon="i-solar:check-circle-bold-duotone"
      inner-class="gap-2"
    >
      <div :class="['text-sm', 'opacity-80']">
        {{ enabledPlugins.length }} plugin(s) enabled in registry.
      </div>
      <div :class="['flex', 'flex-wrap', 'gap-2']">
        <span
          v-for="plugin in enabledPlugins"
          :key="`enabled-${plugin.path}`"
          :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses('emerald')]"
        >
          {{ plugin.name }}
        </span>
      </div>
    </Section>

    <Section
      title="Loaded Plugins"
      icon="i-solar:play-circle-bold-duotone"
      inner-class="gap-2"
    >
      <div :class="['text-sm', 'opacity-80']">
        {{ loadedPlugins.length }} plugin(s) currently loaded in host sessions.
      </div>
      <div :class="['grid', 'gap-2']">
        <div
          v-for="plugin in loadedPlugins"
          :key="`loaded-${plugin.path}`"
          :class="['rounded-lg', 'bg-neutral-100', 'p-2', 'dark:bg-neutral-900/70']"
        >
          <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
            <span :class="['font-semibold']">{{ plugin.name }}</span>
            <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses(phaseChipTheme(sessionByPluginName.get(plugin.name)?.phase ?? 'unknown'))]">
              {{ sessionByPluginName.get(plugin.name)?.phase ?? 'unknown' }}
            </span>
          </div>
        </div>
      </div>
    </Section>

    <Section
      title="Capabilities"
      icon="i-solar:widget-2-bold-duotone"
      inner-class="gap-2"
    >
      <div
        v-if="store.capabilities.length === 0"
        :class="['text-sm', 'opacity-70']"
      >
        No capabilities announced.
      </div>
      <div v-else :class="['grid', 'gap-2']">
        <div
          v-for="capability in store.capabilities"
          :key="capability.key"
          :class="['rounded-lg', 'border', 'border-neutral-300', 'bg-white/60', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']"
        >
          <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-2']">
            <span :class="['font-mono', 'text-xs', 'sm:text-sm']">{{ capability.key }}</span>
            <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'text-xs', ...chipClasses(capability.state === 'ready' ? 'emerald' : 'amber')]">
              {{ capability.state }}
            </span>
          </div>
          <div :class="['mt-2', 'text-xs', 'opacity-70']">
            updated: {{ new Date(capability.updatedAt).toLocaleString() }}
          </div>
          <pre :class="['mt-2', 'overflow-auto', 'rounded-lg', 'bg-neutral-100', 'p-2', 'text-xs', 'dark:bg-neutral-900/70']">{{ JSON.stringify(capability.metadata ?? {}, null, 2) }}</pre>
        </div>
      </div>
    </Section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Plugin Host Debug
  subtitleKey: tamagotchi.settings.devtools.title
</route>
