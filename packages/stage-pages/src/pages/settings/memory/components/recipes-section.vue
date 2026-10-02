<script setup lang="ts">
import { useRecipesStore } from '@proj-airi/stage-ui/stores/recipes'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsAdvanced from '../../../../components/settings-advanced.vue'

const { t } = useI18n()
const recipesStore = useRecipesStore()
const { recipes } = storeToRefs(recipesStore)

const name = ref('')
const description = ref('')
const instructions = ref('')
const keywords = ref('')

function addRecipe() {
  if (!name.value.trim() || !instructions.value.trim())
    return
  const words = keywords.value.split(/[,，]/).map(word => word.trim()).filter(Boolean)
  recipesStore.add({
    name: name.value.trim(),
    description: description.value.trim(),
    style: { kind: 'instructions', instructions: instructions.value.trim() },
    triggers: words.length ? [{ kind: 'keyword', keywords: words }] : [],
    enabled: true,
  })
  name.value = ''
  description.value = ''
  instructions.value = ''
  keywords.value = ''
}
</script>

<template>
  <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
    <div :class="['flex flex-col', 'gap-1']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.memory.recipes.title') }}
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.memory.recipes.description') }}
      </p>
    </div>
    <ul v-if="recipes.length" :class="['flex flex-col', 'gap-3']">
      <li v-for="recipe in recipes" :key="recipe.id" :class="['flex flex-col', 'gap-2', 'rounded-md', 'border border-neutral-200 dark:border-neutral-700', 'p-3']">
        <FieldCheckbox
          :model-value="recipe.enabled"
          :disabled="!recipe.approved"
          :label="recipe.name"
          :description="recipe.description"
          @update:model-value="value => recipesStore.setEnabled(recipe.id, value)"
        />
        <div :class="['flex flex-wrap items-center', 'gap-2', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
          <span>{{ t(`settings.pages.memory.recipes.sources.${recipe.source}`) }}</span>
          <span v-if="!recipe.approved">{{ t('settings.pages.memory.recipes.pending') }}</span>
          <Button v-if="!recipe.approved" size="sm" variant="primary" :label="t('settings.pages.memory.recipes.approve')" @click="recipesStore.approve(recipe.id)" />
          <Button v-if="recipe.source !== 'builtin'" size="sm" :label="t('settings.pages.memory.recipes.remove')" @click="recipesStore.remove(recipe.id)" />
        </div>
      </li>
    </ul>
    <p v-else :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.memory.recipes.empty') }}
    </p>
    <SettingsAdvanced :title="t('settings.pages.memory.recipes.add.title')">
      <FieldInput v-model="name" :label="t('settings.pages.memory.recipes.add.name')" />
      <FieldInput v-model="description" :label="t('settings.pages.memory.recipes.add.description')" />
      <FieldInput v-model="instructions" :single-line="false" :label="t('settings.pages.memory.recipes.add.instructions')" />
      <FieldInput
        v-model="keywords"
        :label="t('settings.pages.memory.recipes.add.keywords.label')"
        :description="t('settings.pages.memory.recipes.add.keywords.description')"
      />
      <div>
        <Button size="sm" variant="primary" :label="t('settings.pages.memory.recipes.add.submit')" :disabled="!name.trim() || !instructions.trim()" @click="addRecipe" />
      </div>
    </SettingsAdvanced>
  </section>
</template>
