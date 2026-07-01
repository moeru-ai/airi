<script setup lang="ts">
import type { OfficialCatalogSurface, OfficialProviderAlias, OfficialProviderAliasRoute } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const aliases = shallowRef<OfficialProviderAlias[]>([])
const surface = ref<OfficialCatalogSurface>('llm')
const loading = shallowRef(false)
const syncing = shallowRef(false)

const enabledCount = computed(() => aliases.value.filter(alias => alias.enabled).length)
const routeCount = computed(() => aliases.value.reduce((total, alias) => total + alias.routes.length, 0))

onMounted(() => {
  void loadAliases()
})

async function loadAliases() {
  loading.value = true
  try {
    aliases.value = await adminApi.officialAliases(surface.value)
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load provider catalog'))
  }
  finally {
    loading.value = false
  }
}

async function syncAliases() {
  syncing.value = true
  try {
    await adminApi.syncOfficialAliases(surface.value)
    toast.success('Provider aliases synced')
    await loadAliases()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to sync provider aliases'))
  }
  finally {
    syncing.value = false
  }
}

async function updateAlias(alias: OfficialProviderAlias, patch: Partial<Pick<OfficialProviderAlias, 'displayName' | 'enabled' | 'displayOrder' | 'fallbackEnabled' | 'loadBalancingEnabled'>>) {
  try {
    const updated = await adminApi.updateOfficialAlias(alias.id, patch)
    aliases.value = aliases.value.map(item => item.id === updated.id ? { ...item, ...updated, routes: item.routes } : item)
    toast.success('Alias updated')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to update alias'))
  }
}

async function updateRoute(alias: OfficialProviderAlias, route: OfficialProviderAliasRoute, patch: Partial<Pick<OfficialProviderAliasRoute, 'enabled' | 'pool' | 'weight' | 'displayOrder'>>) {
  try {
    const updated = await adminApi.updateOfficialAliasRoute(route.id, patch)
    aliases.value = aliases.value.map(item => item.id === alias.id
      ? { ...item, routes: item.routes.map(existing => existing.id === updated.id ? updated : existing) }
      : item)
    toast.success('Route updated')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to update route'))
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
</script>

<template>
  <div :class="['space-y-4']">
    <section :class="['panel', 'overflow-hidden']">
      <div :class="['flex', 'flex-col', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4', 'md:flex-row', 'md:items-center', 'md:justify-between']">
        <div>
          <h2 :class="['text-sm', 'font-semibold']">
            Provider Catalog
          </h2>
          <p :class="['mt-1', 'text-sm', 'text-neutral-500']">
            Product aliases for official LLM and ASR capabilities.
          </p>
        </div>
        <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
          <div :class="['inline-flex', 'h-8', 'overflow-hidden', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'text-sm']">
            <button
              :class="['px-3', surface === 'llm' ? 'bg-neutral-900 text-white' : 'text-neutral-600']"
              type="button"
              @click="surface = 'llm'; loadAliases()"
            >
              LLM
            </button>
            <button
              :class="['px-3', surface === 'asr' ? 'bg-neutral-900 text-white' : 'text-neutral-600']"
              type="button"
              @click="surface = 'asr'; loadAliases()"
            >
              ASR
            </button>
          </div>
          <span :class="['badge', 'badge-green']">
            <span :class="['i-lucide-check-circle-2']" />
            {{ enabledCount }} enabled
          </span>
          <span :class="['badge', 'badge-amber']">
            <span :class="['i-lucide-route']" />
            {{ routeCount }} routes
          </span>
          <Button :disabled="syncing" :icon="syncing ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-refresh-cw'" label="Sync" size="sm" variant="secondary" @click="syncAliases" />
        </div>
      </div>

      <div v-if="loading && aliases.length === 0" :class="['empty-state']">
        <span :class="['i-lucide-loader-2', 'animate-spin', 'text-2xl']" />
        Loading provider catalog
      </div>

      <div v-else-if="aliases.length > 0" :class="['divide-y', 'divide-neutral-200']">
        <article v-for="alias in aliases" :key="alias.id" :class="['px-5', 'py-4']">
          <div :class="['grid', 'gap-3', 'lg:grid-cols-[minmax(0,1fr)_auto]']">
            <div :class="['min-w-0']">
              <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
                <span :class="['font-mono', 'text-xs', 'text-neutral-500']">{{ alias.aliasId }}</span>
                <input
                  :class="['h-8', 'w-56', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']"
                  :value="alias.displayName"
                  @change="event => updateAlias(alias, { displayName: (event.target as HTMLInputElement).value })"
                >
                <span :class="['badge', alias.enabled ? 'badge-green' : 'badge-amber']">
                  <span :class="[alias.enabled ? 'i-lucide-check-circle-2' : 'i-lucide-pause-circle']" />
                  {{ alias.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              <div :class="['mt-2', 'text-xs', 'text-neutral-500']">
                Updated {{ formatDate(alias.updatedAt) }}
              </div>
            </div>
            <div :class="['flex', 'flex-wrap', 'items-center', 'gap-3']">
              <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
                <input :checked="alias.enabled" type="checkbox" @change="event => updateAlias(alias, { enabled: (event.target as HTMLInputElement).checked })">
                Visible
              </label>
              <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
                <input :checked="alias.fallbackEnabled" type="checkbox" @change="event => updateAlias(alias, { fallbackEnabled: (event.target as HTMLInputElement).checked })">
                Fallback
              </label>
              <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
                <input :checked="alias.loadBalancingEnabled" type="checkbox" @change="event => updateAlias(alias, { loadBalancingEnabled: (event.target as HTMLInputElement).checked })">
                Balance
              </label>
              <input
                :class="['h-8', 'w-20', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']"
                min="0"
                type="number"
                :value="alias.displayOrder"
                @change="event => updateAlias(alias, { displayOrder: Number((event.target as HTMLInputElement).value) })"
              >
            </div>
          </div>

          <table :class="['table', 'mt-4']">
            <thead>
              <tr>
                <th>Router model</th>
                <th>Pool</th>
                <th>Weight</th>
                <th>Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="route in alias.routes" :key="route.id">
                <td :class="['font-mono', 'text-xs']">
                  {{ route.routerModelId }}
                </td>
                <td>
                  <select :class="['h-8', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" :value="route.pool" @change="event => updateRoute(alias, route, { pool: (event.target as HTMLSelectElement).value as 'primary' | 'fallback' })">
                    <option value="primary">
                      primary
                    </option>
                    <option value="fallback">
                      fallback
                    </option>
                  </select>
                </td>
                <td>
                  <input :class="['h-8', 'w-20', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" min="1" type="number" :value="route.weight" @change="event => updateRoute(alias, route, { weight: Number((event.target as HTMLInputElement).value) })">
                </td>
                <td>
                  <input :class="['h-8', 'w-20', 'rounded-md', 'border', 'border-neutral-200', 'bg-white', 'px-2', 'text-sm']" min="0" type="number" :value="route.displayOrder" @change="event => updateRoute(alias, route, { displayOrder: Number((event.target as HTMLInputElement).value) })">
                </td>
                <td>
                  <label :class="['flex', 'items-center', 'gap-2', 'text-sm']">
                    <input :checked="route.enabled" type="checkbox" @change="event => updateRoute(alias, route, { enabled: (event.target as HTMLInputElement).checked })">
                    {{ route.enabled ? 'Enabled' : 'Disabled' }}
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>

      <div v-else :class="['empty-state']">
        <span :class="['i-lucide-route-off', 'text-2xl']" />
        No aliases configured
        <Button icon="i-lucide-refresh-cw" label="Sync aliases" size="sm" variant="secondary" @click="syncAliases" />
      </div>
    </section>
  </div>
</template>
