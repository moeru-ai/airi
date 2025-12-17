<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import type { JournalEntry, JournalMood } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Props & Emits
// ─────────────────────────────────────────────────────────────────────────────

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// ─────────────────────────────────────────────────────────────────────────────
// Composables
// ─────────────────────────────────────────────────────────────────────────────

const { t, locale } = useI18n()
const memoryStore = useMemoryStore()
const { entries, totalEntries } = storeToRefs(memoryStore)

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const generating = ref(false)
const searchQuery = ref('')
const showDeleteConfirm = ref<string | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// Computed
// ─────────────────────────────────────────────────────────────────────────────

const todayEntry = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return memoryStore.getEntryByDate(today)
})

const filteredEntries = computed(() => {
  if (!searchQuery.value.trim()) {
    return entries.value
  }
  return memoryStore.searchEntries(searchQuery.value)
})

const renderedEntries = computed(() => {
  return filteredEntries.value.map(e => ({
    ...e,
    isTechnical: e.type === 'technical',
    moodEmoji: memoryStore.getMoodEmoji(e.mood),
  }))
})

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

async function handleGenerate() {
  if (generating.value) return
  generating.value = true
  try {
    await memoryStore.summarizeSession(undefined, locale.value)
  } finally {
    generating.value = false
  }
}

function handleDelete(id: string) {
  memoryStore.deleteEntry(id)
  showDeleteConfirm.value = null
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(locale.value, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRelativeDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return t('journal.today') || 'Today'
  if (days === 1) return t('journal.yesterday') || 'Yesterday'
  if (days < 7) return `${days} ${t('journal.days_ago') || 'days ago'}`
  return formatDate(ts)
}

// Reset search when closing
watch(() => props.open, (open) => {
  if (!open) {
    searchQuery.value = ''
    showDeleteConfirm.value = null
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div 
          class="absolute inset-0 bg-neutral-900/60 backdrop-blur-md"
          @click="emit('close')"
        />

        <!-- Modal Content -->
        <div 
          class="relative w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-3xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl shadow-2xl border border-white/30 dark:border-white/10"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-5 border-b border-neutral-200/50 dark:border-neutral-800/50 bg-gradient-to-r from-primary-50/50 to-transparent dark:from-primary-900/20">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
                <div class="i-solar:notebook-bookmark-bold-duotone text-2xl text-primary-500" />
              </div>
              <div>
                <h2 class="text-xl font-bold text-neutral-800 dark:text-neutral-100">
                  {{ t('journal.title') }}
                </h2>
                <p class="text-xs text-neutral-500 dark:text-neutral-400">
                  {{ totalEntries }} {{ totalEntries === 1 ? 'memory' : 'memories' }}
                </p>
              </div>
            </div>
            <button 
              class="p-2.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
              @click="emit('close')"
            >
              <div class="i-solar:close-circle-bold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-xl" />
            </button>
          </div>

          <!-- Search Bar -->
          <div v-if="totalEntries > 0" class="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800/50">
            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 i-solar:magnifier-linear text-neutral-400" />
              <input 
                v-model="searchQuery"
                type="text"
                :placeholder="t('journal.search') || 'Search memories...'"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
              />
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <!-- Generate Button (if no entry today) -->
            <div 
              v-if="!todayEntry" 
              class="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 bg-gradient-to-br from-neutral-50/80 to-neutral-100/50 dark:from-neutral-800/30 dark:to-neutral-800/10"
            >
              <div class="i-solar:pen-new-square-bold-duotone text-4xl text-primary-400 mb-4" />
              <p class="text-neutral-600 dark:text-neutral-400 mb-4 text-center text-sm max-w-xs">
                {{ t('journal.has_written') }}
              </p>
              <button
                class="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl transition-all shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                :disabled="generating"
                @click="handleGenerate"
              >
                <div v-if="generating" class="i-svg-spinners:90-ring-with-bg" />
                <div v-else class="i-solar:magic-stick-3-bold" />
                <span class="font-medium">{{ generating ? t('journal.generating') : t('journal.write_today') }}</span>
              </button>
            </div>

            <!-- Empty State -->
            <div v-if="renderedEntries.length === 0 && searchQuery" class="text-center py-12 text-neutral-400">
              <div class="i-solar:magnifier-zoom-out-bold-duotone text-5xl mb-3 mx-auto opacity-50" />
              <p>{{ t('journal.no_results') || 'No matching memories found' }}</p>
            </div>

            <div v-else-if="entries.length === 0" class="text-center py-12 text-neutral-400">
              <div class="i-solar:sleeping-square-bold-duotone text-5xl mb-3 mx-auto opacity-50" />
              <p>{{ t('journal.no_memories') }}</p>
            </div>

            <!-- Entries List -->
            <TransitionGroup name="list" tag="div" class="space-y-4">
              <div 
                v-for="entry in renderedEntries" 
                :key="entry.id" 
                class="group relative pl-5 border-l-3 transition-all duration-300"
                :class="[
                  entry.isTechnical 
                    ? 'border-blue-400 hover:border-blue-500 dark:border-blue-500' 
                    : 'border-primary-300 hover:border-primary-400 dark:border-primary-600'
                ]"
              >
                <!-- Timeline Dot -->
                <div 
                  class="absolute -left-[7px] top-0 w-3 h-3 rounded-full ring-2 ring-white dark:ring-neutral-900 transition-all duration-300" 
                  :class="[
                    entry.isTechnical 
                      ? 'bg-blue-500' 
                      : 'bg-primary-400 group-hover:bg-primary-500'
                  ]"
                />
                
                <!-- Entry Header -->
                <div class="mb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {{ formatRelativeDate(entry.timestamp) }}
                    </span>
                    <span 
                      v-if="entry.isTechnical" 
                      class="px-2 py-0.5 rounded-md text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold uppercase tracking-wider"
                    >
                      DEV LOG
                    </span>
                    <div 
                      v-for="tag in entry.tags?.slice(0, 2)" 
                      :key="tag"
                      class="px-2 py-0.5 rounded-md text-[10px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    >
                      #{{ tag }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span 
                      class="text-xl transition-transform group-hover:scale-110" 
                      :title="entry.mood"
                    >
                      {{ entry.moodEmoji }}
                    </span>
                    <!-- Delete Button -->
                    <button
                      v-if="showDeleteConfirm !== entry.id"
                      class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-400 hover:text-red-500 transition-all"
                      @click="showDeleteConfirm = entry.id"
                    >
                      <div class="i-solar:trash-bin-trash-linear text-sm" />
                    </button>
                    <div v-else class="flex items-center gap-1 text-xs">
                      <button 
                        class="px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                        @click="handleDelete(entry.id)"
                      >
                        {{ t('journal.delete') || 'Delete' }}
                      </button>
                      <button 
                        class="px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                        @click="showDeleteConfirm = null"
                      >
                        {{ t('journal.cancel') || 'Cancel' }}
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Entry Content -->
                <div 
                  class="bg-white dark:bg-neutral-800/80 p-4 rounded-xl shadow-sm border text-sm whitespace-pre-line leading-relaxed text-neutral-700 dark:text-neutral-300 transition-all duration-300"
                  :class="[
                    entry.isTechnical 
                      ? 'border-blue-100 dark:border-blue-900/30 font-mono text-xs' 
                      : 'border-neutral-100 dark:border-neutral-700/50'
                  ]"
                >
                  {{ entry.content }}
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.list-move {
  transition: transform 0.3s ease;
}

.border-l-3 {
  border-left-width: 3px;
}
</style>
