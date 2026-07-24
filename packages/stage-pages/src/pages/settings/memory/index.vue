<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useAlayaMemoryStore } from '@proj-airi/stage-ui/stores/modules/alaya-memory'
import { Button, FieldInput, FieldTextArea } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const alaya = useAlayaMemoryStore()
const airiCard = useAiriCardStore()
const auth = useAuthStore()

// ------------------------------------------------------------------
// Connection
// ------------------------------------------------------------------

const activeCharacterId = computed(() => airiCard.activeCardId)

// Auto-connect when active character or auth user changes
watch([activeCharacterId, () => auth.userId], ([id, uid]) => {
  if (id && uid) {
    alaya.connect({ characterId: id, userId: uid })
  }
}, { immediate: true })

// ------------------------------------------------------------------
// Search
// ------------------------------------------------------------------

const searchText = ref('')
const searchDebounce = ref<ReturnType<typeof setTimeout>>()

function onSearchInput(value: string) {
  clearTimeout(searchDebounce.value)
  searchDebounce.value = setTimeout(() => {
    if (value.trim()) {
      alaya.search(value)
    }
    else {
      alaya.clearSearch()
    }
  }, 300)
}

// ------------------------------------------------------------------
// Add memory dialog
// ------------------------------------------------------------------

const showAddDialog = ref(false)
const newMemoryContent = ref('')
const newMemoryTags = ref('')
const isSubmitting = ref(false)

async function submitMemory() {
  if (!newMemoryContent.value.trim())
    return
  isSubmitting.value = true
  try {
    await alaya.addMemory({
      characterId: activeCharacterId.value!,
      content: newMemoryContent.value.trim(),
      tags: newMemoryTags.value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    })
    newMemoryContent.value = ''
    newMemoryTags.value = ''
    showAddDialog.value = false
  }
  finally {
    isSubmitting.value = false
  }
}

// ------------------------------------------------------------------
// Delete confirmation
// ------------------------------------------------------------------

const confirmDeleteId = ref<string | null>(null)
const confirmDeleteContent = computed(() =>
  confirmDeleteId.value
    ? alaya.allMemories.find(m => m.id === confirmDeleteId.value)?.content.slice(0, 80)
    : '',
)

async function confirmDelete() {
  if (!confirmDeleteId.value)
    return
  try {
    await alaya.deleteMemory(confirmDeleteId.value)
  }
  finally {
    confirmDeleteId.value = null
  }
}

// ------------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------------

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function importanceColor(score: number): string {
  if (score >= 0.7)
    return 'text-green-500'
  if (score >= 0.4)
    return 'text-amber-500'
  return 'text-neutral-400'
}

function sourceIcon(source: string): string {
  switch (source) {
    case 'manual': return 'i-solar:pen-bold-duotone'
    case 'system': return 'i-solar:settings-bold-duotone'
    default: return 'i-solar:chat-dots-bold-duotone'
  }
}

// ------------------------------------------------------------------
// Expanded entry detail
// ------------------------------------------------------------------

const expandedId = ref<string | null>(null)

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div flex="~ col gap-4" pb-12>
    <!-- Not connected state -->
    <div v-if="!activeCharacterId" flex="~ col" items-center justify-center gap-3 py-20>
      <div i-solar:leaf-bold-duotone text="5 neutral-400/40" />
      <p text="sm neutral-500">
        {{ t('settings.pages.memory.noCharacter') }}
      </p>
    </div>

    <template v-else>
      <!-- Toolbar -->
      <div flex="~" items-center justify-between gap-3>
        <!-- Search -->
        <div relative flex-1>
          <div i-solar:magnifer-bold-duotone absolute left-3 top="1/2" translate-y="-1/2" text="neutral-400" />
          <input
            :value="searchText"
            :placeholder="t('settings.pages.memory.searchPlaceholder')"
            class="w-full border border-neutral-200/60 rounded-xl border-solid bg-neutral-50/80 py-2.5 pl-10 pr-4 text-sm outline-none backdrop-blur-md transition dark:border-neutral-700/40 focus:border-primary-400/50 dark:bg-neutral-800/60 dark:focus:border-primary-600/50"
            @input="(e) => {
              searchText = (e.target as HTMLInputElement).value
              onSearchInput(searchText)
            }"
          >
        </div>

        <Button
          :label="t('settings.pages.memory.addMemory')"
          icon="i-solar:add-circle-bold-duotone"
          size="sm"
          @click="showAddDialog = true"
        />
        <Button
          variant="ghost"
          icon="i-solar:refresh-bold-duotone"
          size="sm"
          :loading="alaya.isLoading"
          @click="alaya.refresh()"
        />
      </div>

      <!-- Stats bar -->
      <div
        v-if="alaya.snapshot && alaya.totalCount > 0"
        flex="~" items-center gap-4
        text="xs neutral-500" px-1
      >
        <span>{{ alaya.totalCount }} {{ t('settings.pages.memory.totalMemories') }}</span>
        <span v-if="alaya.snapshot.oldestEntryAt">
          {{ t('settings.pages.memory.from') }} {{ formatDate(alaya.snapshot.oldestEntryAt) }}
        </span>
        <div flex-1 />
        <Button
          variant="ghost"
          size="sm"
          :label="t('settings.pages.memory.runHousekeeping')"
          @click="alaya.runHousekeeping()"
        />
      </div>

      <!-- Error banner -->
      <div
        v-if="alaya.error"
        bg="red-500/10" border="1 solid red-500/20"
        flex="~" items-center gap-2 rounded-xl p-3 text="sm red-500"
      >
        <div i-solar:danger-triangle-bold-duotone />
        {{ alaya.error }}
      </div>

      <!-- Loading -->
      <div v-if="alaya.isLoading && alaya.isEmpty" flex="~" items-center justify-center py-16>
        <div i-svg-spinners:ring-resize text="2xl neutral-400" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="alaya.isEmpty"
        flex="~ col" items-center justify-center gap-3 py-16
      >
        <div i-solar:leaf-bold-duotone text="5 neutral-400/20" />
        <p text="sm neutral-500">
          {{ t('settings.pages.memory.empty') }}
        </p>
        <Button
          variant="secondary"
          size="sm"
          :label="t('settings.pages.memory.addFirstMemory')"
          icon="i-solar:add-circle-bold-duotone"
          @click="showAddDialog = true"
        />
      </div>

      <!-- Memory list -->
      <div v-else flex="~ col gap-2">
        <div
          v-for="result in alaya.displayedMemories"
          :key="result.entry.id"
          flex="~ col"
          bg="white/60 dark:neutral-800/60"
          border="1 solid neutral-200/30 dark:neutral-700/30"

          transition="all duration-200"
          hover="bg-white/80 dark:neutral-800/80 border-neutral-300/40 dark:neutral-600/40"
          cursor-pointer rounded-xl p-4 backdrop-blur-md
          @click="toggleExpand(result.entry.id)"
        >
          <!-- Row -->
          <div flex="~" items-start gap-3>
            <!-- Source icon -->
            <div
              mt-0.5 flex-shrink-0
              :class="[sourceIcon(result.entry.source), 'text-lg', result.entry.source === 'manual' ? 'text-primary-400' : 'text-neutral-400']"
            />

            <!-- Content -->
            <div min-w-0 flex-1>
              <p text="sm" line-clamp-2 :class="{ 'font-medium': result.entry.importance >= 0.7 }">
                {{ result.entry.summary || result.entry.content }}
              </p>

              <!-- Tags & meta -->
              <div flex="~ wrap" mt-2 items-center gap-2 text="xs neutral-400">
                <span>{{ formatDate(result.entry.createdAt) }}</span>
                <span>·</span>
                <span :class="importanceColor(result.entry.importance)">
                  {{ (result.entry.importance * 100).toFixed(0) }}%
                </span>
                <span
                  v-for="tag in result.entry.tags"
                  :key="tag"
                  bg="primary-500/10 dark:primary-500/15"
                  rounded-full px-2 py-0.5 text="xs primary-600 dark:primary-400"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div flex="~" flex-shrink-0 items-center gap-1 @click.stop>
              <Button
                variant="ghost"
                size="sm"
                icon="i-solar:trash-bin-trash-bold-duotone"
                @click="confirmDeleteId = result.entry.id"
              />
            </div>
          </div>

          <!-- Expanded detail -->
          <div
            v-if="expandedId === result.entry.id"
            mt-3 pt-3
            border-t="1 solid neutral-200/30 dark:neutral-700/30"
            flex="~ col gap-2"
          >
            <p text="sm neutral-600 dark:neutral-300" whitespace-pre-wrap>
              {{ result.entry.content || result.entry.summary }}
            </p>
            <div v-if="result.entry.accessCount > 0" text="xs neutral-400">
              {{ t('settings.pages.memory.accessed') }} {{ result.entry.accessCount }} {{ t('settings.pages.memory.times') }}
              · {{ t('settings.pages.memory.lastAccess') }} {{ formatDate(result.entry.lastAccessedAt) }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- =============================================================== -->
  <!-- Add Memory Dialog -->
  <!-- =============================================================== -->
  <Teleport to="body">
    <div
      v-if="showAddDialog"
      fixed inset-0 z-50
      flex items-center justify-center
      bg="black/40" backdrop-blur-sm
      @click.self="showAddDialog = false"
    >
      <div
        bg="white dark:neutral-900"
        border="1 solid neutral-200/30 dark:neutral-700/40"
        rounded-2xl p-6 w="[min(480px,90vw)]"
        shadow-2xl
        flex="~ col gap-4"
      >
        <h2 text="lg font-semibold">
          {{ t('settings.pages.memory.addMemory') }}
        </h2>

        <FieldTextArea
          v-model="newMemoryContent"
          :label="t('settings.pages.memory.memoryContent')"
          :placeholder="t('settings.pages.memory.contentPlaceholder')"
          :rows="4"
        />

        <FieldInput
          v-model="newMemoryTags"
          :label="t('settings.pages.memory.tags')"
          :placeholder="t('settings.pages.memory.tagsPlaceholder')"
        />

        <div flex="~" items-center justify-end gap-2>
          <Button
            variant="secondary"
            :label="t('settings.pages.memory.cancel')"
            @click="showAddDialog = false"
          />
          <Button
            :label="t('settings.pages.memory.save')"
            :loading="isSubmitting"
            :disabled="!newMemoryContent.trim()"
            @click="submitMemory()"
          />
        </div>
      </div>
    </div>
  </Teleport>

  <!-- =============================================================== -->
  <!-- Delete Confirmation Dialog -->
  <!-- =============================================================== -->
  <Teleport to="body">
    <div
      v-if="confirmDeleteId"
      fixed inset-0 z-50
      flex items-center justify-center
      bg="black/40" backdrop-blur-sm
      @click.self="confirmDeleteId = null"
    >
      <div
        bg="white dark:neutral-900"
        border="1 solid neutral-200/30 dark:neutral-700/40"
        rounded-2xl p-6 w="[min(400px,90vw)]"
        shadow-2xl
        flex="~ col gap-4"
      >
        <h2 text="lg font-semibold">
          {{ t('settings.pages.memory.deleteConfirm') }}
        </h2>
        <p text="sm neutral-500" line-clamp-3>
          {{ confirmDeleteContent }}
        </p>

        <div flex="~" items-center justify-end gap-2>
          <Button
            variant="secondary"
            :label="t('settings.pages.memory.cancel')"
            @click="confirmDeleteId = null"
          />
          <Button
            variant="danger"
            :label="t('settings.pages.memory.delete')"
            @click="confirmDelete()"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
