<!-- src/components/MemoryTable.vue -->
<script setup lang="ts">
interface MemoryDataItem {
  storyid: string
  score: number
  lastupdate: string // ISO timestamp
  last_retrieved_at: string // ISO timestamp
  retrieval_count: number
  lastupdate_str: string
  last_retrieved_str: string
  age_in_seconds: number
  time_since_retrieval: number
  ltm_factor?: number // Optional since it's only present when longTermMemoryEnabled is true
  decayed_score: number
}

const props = defineProps<{
  memories: MemoryDataItem[]
  selectedId: string | null
  longTermMemoryEnabled: boolean
  longTermMemoryThreshold: number
}>()

const emit = defineEmits(['select', 'retrieve'])

function selectMemory(id) {
  emit('select', id)
}

function retrieveMemory(id, event) {
  event.stopPropagation()
  emit('retrieve', id)
}

function getMemoryStatus(memory) {
  if (props.longTermMemoryEnabled && memory.retrieval_count >= props.longTermMemoryThreshold) {
    return {
      type: 'long-term',
      label: `Long-term (${Math.round((memory.ltm_factor || 0) * 100)}%)`,
      class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    }
  }
  else if (memory.retrieval_count > 0) {
    return {
      type: 'working',
      label: props.longTermMemoryEnabled ? `Working (${memory.retrieval_count}/${props.longTermMemoryThreshold})` : 'Working',
      class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    }
  }
  else {
    return {
      type: 'short-term',
      label: 'Short-term',
      class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    }
  }
}
</script>

<template>
  <div class="rounded-lg bg-neutral-50 shadow dark:bg-neutral-800/50">
    <div class="border-b p-4 dark:border-neutral-700">
      <h2 class="text-xl font-semibold">
        All Memory Items
      </h2>
      <p class="mt-1 text-sm text-neutral-500">
        Items are ranked by current memory strength (click to analyze or simulate retrieval)
      </p>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
        <thead class="bg-neutral-100 dark:bg-neutral-800">
          <tr>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Rank
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Memory ID
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Original Score
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Age (Days)
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Retrievals
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Last Retrieved
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Memory Status
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Current Score
            </th>
            <th class="px-4 py-3 text-left text-xs text-neutral-500 font-medium tracking-wider uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-neutral-200 dark:bg-neutral-900 dark:divide-neutral-800">
          <tr
            v-for="(item, idx) in memories" :key="item.storyid"
            :class="{ 'bg-blue-50 dark:bg-blue-900/20': item.storyid === selectedId }"
            class="cursor-pointer transition duration-150 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            @click="selectMemory(item.storyid)"
          >
            <td class="whitespace-nowrap px-4 py-2 text-sm font-medium">
              {{ idx + 1 }}
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-sm">
              {{ item.storyid }}
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-sm">
              {{ Math.round(item.score) }}
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-sm">
              {{ Math.round(item.age_in_seconds / (24 * 60 * 60)) }}
            </td>
            <td
              class="whitespace-nowrap px-4 py-2 text-sm font-medium"
              :class="item.retrieval_count > 0 ? 'text-green-600 dark:text-green-400' : ''"
            >
              {{ item.retrieval_count }}
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-sm">
              {{ item.retrieval_count > 0 ? new Date(item.last_retrieved_at).toLocaleDateString() : '-' }}
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-sm">
              <span
                class="rounded px-2 py-1 text-xs font-medium"
                :class="getMemoryStatus(item).class"
              >
                {{ getMemoryStatus(item).label }}
              </span>
            </td>
            <td class="whitespace-nowrap px-4 py-2">
              <div class="flex items-center">
                <div class="w-16 text-sm">
                  {{ Math.round(item.decayed_score) }}
                </div>
                <div class="ml-2 h-2 w-24 rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div
                    class="h-full max-w-full rounded-full"
                    :class="longTermMemoryEnabled && item.retrieval_count >= longTermMemoryThreshold ? 'bg-purple-500' : 'bg-blue-500'"
                    :style="`width: ${Math.round((item.decayed_score / item.score) * 100)}%`"
                  />
                </div>
              </div>
            </td>
            <td class="whitespace-nowrap px-4 py-2 text-right">
              <button
                class="rounded-lg bg-green-100 px-3 py-1 text-xs font-medium dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800"
                @click="retrieveMemory(item.storyid, $event)"
              >
                Retrieve
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  :deep(table) {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
}
</style>
