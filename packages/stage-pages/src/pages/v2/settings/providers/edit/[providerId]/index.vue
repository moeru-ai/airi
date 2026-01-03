<script setup lang="ts">
import type { ProviderValidationStep } from '@proj-airi/stage-ui/libs'
import type { ZodType } from 'zod'
import type { $ZodType } from 'zod/v4/core'

import { merge } from '@moeru/std'
import {
  Alert,
  Callout,
  ProviderAccountIdInput,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationDetailsDialog,
} from '@proj-airi/stage-ui/components'
import { getDefinedProvider, getSchemaDefault, getValidatorsOfProvider, validateProvider } from '@proj-airi/stage-ui/libs'
import { useProviderCatalogStore } from '@proj-airi/stage-ui/stores/provider-catalog'
import { Button, FieldInput, FieldKeyValues } from '@proj-airi/ui'
import { refManualReset, useDebounceFn } from '@vueuse/core'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const route = useRoute('v2/settings/providers/edit/[providerId]')

const providerCatalogStore = useProviderCatalogStore()

const providerId = computed(() => route.params.providerId as string)
const providerConfig = computed(() => providerCatalogStore.configs[providerId.value] || {})
const providerDefinition = computed(() => getDefinedProvider(providerConfig.value.definitionId))
const providerSchema = computed(() => providerDefinition.value?.createProviderConfig({ t }) as $ZodType | undefined)
const providerSchemaDefault = computed(() => getSchemaDefault(providerSchema.value))

const providerConfigEdit = refManualReset(providerConfig)
const isEdited = computed(() => {
  const currentConfig = providerConfigEdit.value?.config || {}
  const savedConfig = providerConfig.value?.config || {}
  return JSON.stringify(currentConfig) !== JSON.stringify(savedConfig)
})
const isValidating = ref(false)
const showValidationDetails = ref(false)
const activeValidationStepId = ref<string | undefined>(undefined)
const validationSteps = ref<ProviderValidationStep[]>([])
const hasValidationFailures = computed(() => validationSteps.value.some(step => step.status === 'invalid'))

const isOllamaProvider = computed(() => providerDefinition.value?.id === 'ollama')
const shouldShowTroubleshootingOllamaConnectivity = computed(() => {
  return isOllamaProvider.value && validationSteps.value.some(step => step.id === 'openai-compatible:check-connectivity' && step.status === 'invalid')
})

function getSchemaShape(schema: $ZodType): Record<string, ZodType> {
  const anySchema = schema as unknown as { shape?: Record<string, ZodType> | (() => Record<string, ZodType>), _def?: { shape?: Record<string, ZodType> | (() => Record<string, ZodType>) } }
  if (anySchema.shape) {
    return typeof anySchema.shape === 'function' ? anySchema.shape() : anySchema.shape
  }
  if (anySchema._def?.shape) {
    return typeof anySchema._def.shape === 'function' ? anySchema._def.shape() : anySchema._def.shape
  }

  return {}
}

function getSchemaMeta(schema: ZodType): Record<string, unknown> {
  return schema.meta() || {}
}

function isOptionalSchema(schema: ZodType) {
  return schema.safeParse(undefined).success
}

const validatorEventStates = ref<Record<string, 'running' | 'success' | 'error'>>({})

const schemaFields = computed(() => {
  if (!providerSchema.value)
    return []

  const shape = getSchemaShape(providerSchema.value)
  return Object.entries(shape).map(([key, schema]) => {
    const meta = getSchemaMeta(schema)

    const section = meta.section === 'advanced' ? 'advanced' : 'basic'

    const type = typeof meta.type === 'string' ? meta.type : undefined
    const label = typeof meta.labelLocalized === 'string' ? meta.labelLocalized : ''
    const description = typeof meta.descriptionLocalized === 'string' ? meta.descriptionLocalized : schema.description
    const placeholder = typeof meta.placeholderLocalized === 'string' ? meta.placeholderLocalized : ''

    return {
      key,
      schema,
      section,
      type,
      label,
      description,
      placeholder,
      required: !isOptionalSchema(schema),
    }
  })
})

const basicFields = computed(() => schemaFields.value.filter(field => field.section === 'basic'))
const advancedFields = computed(() => schemaFields.value.filter(field => field.section === 'advanced'))

function setFieldValue(key: string, value: unknown) {
  providerCatalogStore.configs[providerId.value] = {
    ...providerCatalogStore.configs[providerId.value],
    config: {
      ...providerCatalogStore.configs[providerId.value]?.config,
      [key]: value,
    },
    id: providerId.value,
    definitionId: providerId.value,
  }
}

const headerRows = ref<Array<{ key: string, value: string }>>([{ key: '', value: '' }])
const isSyncingHeaders = ref(false)

function normalizeHeaderRows(headers: Record<string, string>) {
  const rows = Object.entries(headers || {}).map(([key, value]) => ({ key, value }))
  if (rows.length === 0) {
    rows.push({ key: '', value: '' })
  }
  else if (rows[rows.length - 1].key !== '' || rows[rows.length - 1].value !== '') {
    rows.push({ key: '', value: '' })
  }
  return rows
}

watch(providerConfigEdit, (config) => {
  if (!('headers' in config))
    return

  isSyncingHeaders.value = true
  headerRows.value = normalizeHeaderRows((config.headers as Record<string, string>) || {})
  isSyncingHeaders.value = false
}, { deep: true, immediate: true })

watch(headerRows, (rows) => {
  if (isSyncingHeaders.value)
    return
  const lastRow = rows[rows.length - 1]
  if (!lastRow || lastRow.key.trim().length > 0 || lastRow.value.trim().length > 0) {
    headerRows.value = [...rows, { key: '', value: '' }]
    return
  }
  const headers = rows
    .filter(entry => entry.key.trim().length > 0)
    .reduce((acc, entry) => {
      acc[entry.key] = entry.value
      return acc
    }, {} as Record<string, string>)
  setFieldValue('headers', headers)
}, { deep: true })

function removeHeaderRow(index: number) {
  const rows = [...headerRows.value]
  if (rows.length === 1) {
    headerRows.value = [{ key: '', value: '' }]
    return
  }
  rows.splice(index, 1)
  headerRows.value = rows.length > 0 ? rows : [{ key: '', value: '' }]
}

async function runValidation() {
  if (!providerDefinition.value)
    return

  const validationPlan = getValidationPlan()
  if (!validationPlan)
    return
  if (providerConfig.value?.validated || providerConfig.value?.validationBypassed)
    return
  if (!validationPlan.shouldValidate)
    return

  isValidating.value = true
  validatorEventStates.value = {}
  const results = await validateProvider(validationPlan, { t }, {
    onValidatorStart: ({ step }) => {
      validatorEventStates.value = { ...validatorEventStates.value, [step.id]: 'running' }
      syncValidationSteps()
    },
    onValidatorSuccess: ({ step }) => {
      validatorEventStates.value = { ...validatorEventStates.value, [step.id]: 'success' }
      syncValidationSteps()
    },
    onValidatorError: ({ step }) => {
      validatorEventStates.value = { ...validatorEventStates.value, [step.id]: 'error' }
      syncValidationSteps()
    },
  })
  if (isEdited.value && results.every(step => step.status !== 'invalid')) {
    commitEditedConfig({ validated: true, validationBypassed: false })
  }
  isValidating.value = false
}

const debouncedValidation = useDebounceFn(runValidation, 1500)
let didInitValidation = false

watch([providerConfigEdit, providerDefinition], () => {
  if (!providerConfig.value || !providerConfigEdit.value) {
    return
  }

  getValidationPlan()

  if (providerConfig.value?.validated || providerConfig.value?.validationBypassed)
    return

  if (!didInitValidation) {
    didInitValidation = true
    return
  }
  debouncedValidation()
}, { deep: true, immediate: true })

onMounted(() => {
  if (!providerConfig.value.validated) {
    providerConfigEdit.value.config = merge(providerSchemaDefault.value, providerConfigEdit.value?.config || {})
  }
})

function getValidationPlan() {
  if (!providerDefinition.value)
    return undefined

  const validationPlan = getValidatorsOfProvider({
    definition: providerDefinition.value,
    config: (providerConfigEdit.value?.config || {}) as Record<string, unknown>,
    schemaDefaults: providerSchemaDefault.value as Record<string, unknown>,
    contextOptions: { t },
  })
  if (!validationPlan)
    return undefined

  validationSteps.value = validationPlan.steps
  return validationPlan
}

function syncValidationSteps() {
  validationSteps.value = [...validationSteps.value]
}

function commitEditedConfig(options: { validated: boolean, validationBypassed: boolean }) {
  if (!providerConfigEdit.value)
    return

  providerCatalogStore.commitProviderConfig(providerId.value, { ...providerConfigEdit.value.config }, options)
}

function handleSaveAnyway() {
  if (!isEdited.value)
    return

  commitEditedConfig({ validated: false, validationBypassed: true })
}

function handleDeleteProvider() {
  const id = providerId.value
  router.push('/v2/settings/providers')
  setTimeout(() => providerCatalogStore.removeProvider(id), 100)
}
</script>

<template>
  <div v-if="!providerConfigEdit" class="h-full w-full">
    <div :class="['flex', 'flex-col', 'items-center', 'gap-2', 'py-10', 'text-neutral-500', 'h-full', 'w-full']">
      <div :class="['i-ph:warning-circle-light', 'text-3xl']" />
      <div>{{ t('settings.pages.providers.catalog.edit.config-id-not-found') }}</div>
    </div>
  </div>
  <div v-else-if="!providerDefinition" class="h-full w-full">
    <div :class="['flex', 'flex-col', 'items-center', 'gap-2', 'py-10', 'text-neutral-500', 'h-full', 'w-full']">
      <div :class="['i-ph:warning-circle-light', 'text-3xl']" />
      <div>{{ t('settings.pages.providers.catalog.edit.definition-id-not-found') }}</div>
    </div>
  </div>
  <ProviderSettingsLayout
    v-else
    :provider-name="providerDefinition?.nameLocalize({ t }) || providerDefinition?.name || ''"
    :provider-icon="providerDefinition?.icon"
    :provider-icon-color="providerDefinition?.iconColor"
    :on-back="() => router.back()"
  >
    <div :class="['flex', 'flex-col', 'gap-4']">
      <div :class="['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <div v-if="providerDefinition?.icon || providerDefinition?.iconColor" :class="['relative', 'h-8', 'w-8']">
              <div :class="[providerDefinition?.iconColor || providerDefinition?.icon, 'absolute', 'left-50%', 'top-50%', '-translate-x-1/2', '-translate-y-1/2', 'text-2xl']" />
            </div>
            <h2 :class="['text-lg', 'text-neutral-900', 'font-semibold', 'dark:text-neutral-100']">
              {{ providerDefinition?.nameLocalize({ t }) || providerDefinition?.name || providerId }}
            </h2>
          </div>
          <div :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ providerDefinition?.descriptionLocalize({ t }) || providerDefinition?.description }}
          </div>
        </div>
        <div :class="['flex', 'items-center', 'gap-2']">
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child :aria-label="t('settings.pages.providers.catalog.edit.actions.more-options')">
              <Button size="sm" variant="secondary">
                <div :class="['i-solar:menu-dots-bold']" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                :class="[
                  'bg-white', 'dark:bg-neutral-800/90',
                  'shadow-md', 'dark:shadow-lg',
                  'will-change-[opacity,transform] min-w-40 rounded-xl p-1 outline-none',
                  'data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade',
                ]"
                :side-offset="8"
                align="end"
              >
                <DropdownMenuItem
                  :class="[
                    'relative', 'flex', 'cursor-pointer', 'select-none', 'items-center',
                    'rounded-lg', 'px-3', 'py-2', 'text-sm', 'leading-none', 'outline-none',
                    'data-[disabled]:pointer-events-none',
                    'data-[highlighted]:bg-red-100/30', 'data-[highlighted]:text-red-700',
                    'dark:data-[highlighted]:bg-red-500/20', 'dark:data-[highlighted]:text-red-200',
                    'transition-colors', 'duration-250', 'ease-in-out',
                  ]"
                  @click="handleDeleteProvider"
                >
                  <div :class="['i-solar:trash-bin-minimalistic-bold-duotone']" />
                  <div>{{ t('settings.pages.providers.catalog.edit.actions.delete') }}</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </div>
      </div>

      <ProviderSettingsContainer>
        <div v-if="!providerDefinition" :class="['flex', 'flex-col', 'items-center', 'gap-2', 'py-10', 'text-neutral-500']">
          <div :class="['i-ph:warning-circle-light', 'text-3xl']" />
          <div>{{ t('settings.pages.providers.catalog.edit.definition-id-not-found') }}</div>
        </div>

        <template v-else>
          <ProviderBasicSettings
            :title="t('settings.pages.providers.common.section.basic.title')"
            :description="t('settings.pages.providers.common.section.basic.description')"
          >
            <div :class="['flex', 'flex-col', 'gap-4']">
              <div v-for="field in basicFields" :key="field.key">
                <ProviderApiKeyInput
                  v-if="field.key === 'apiKey'"
                  v-model="providerConfigEdit.config[field.key]"
                  :provider-name="providerDefinition?.nameLocalize({ t }) || providerDefinition?.name || ''"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                />
                <ProviderBaseUrlInput
                  v-else-if="field.key === 'baseUrl'"
                  v-model="providerConfigEdit.config[field.key]"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                />
                <ProviderAccountIdInput
                  v-else-if="field.key === 'accountId'"
                  v-model="providerConfigEdit.config[field.key]"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                />
                <FieldInput
                  v-else
                  v-model="providerConfigEdit.config[field.key]"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                  :type="field.type || 'text'"
                />
              </div>
            </div>
          </ProviderBasicSettings>

          <ProviderAdvancedSettings
            v-if="advancedFields.length > 0"
            :title="t('settings.pages.providers.common.section.advanced.title')"
          >
            <div :class="['flex', 'flex-col', 'gap-4']">
              <div v-for="field in advancedFields" :key="field.key">
                <FieldKeyValues
                  v-if="field.type === 'key-values'"
                  v-model="headerRows"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                  :key-placeholder="t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.key.placeholder')"
                  :value-placeholder="t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.value.placeholder')"
                  @remove="removeHeaderRow"
                />
                <ProviderBaseUrlInput
                  v-else-if="field.key === 'baseUrl'"
                  v-model="providerConfigEdit.config[field.key]"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                />
                <FieldInput
                  v-else
                  v-model="providerConfigEdit.config[field.key]"
                  :label="field.label"
                  :description="field.description"
                  :placeholder="field.placeholder"
                  :required="field.required"
                  :type="field.type || 'text'"
                />
              </div>
            </div>
          </ProviderAdvancedSettings>

          <div :class="['flex', 'flex-col', 'gap-3']">
            <Callout
              v-if="shouldShowTroubleshootingOllamaConnectivity && providerDefinition.business?.({ t }).troubleshooting?.validators?.openaiCompatibleCheckConnectivity"
              :label="providerDefinition.business?.({ t }).troubleshooting?.validators?.openaiCompatibleCheckConnectivity?.label"
            >
              <div v-html="providerDefinition.business?.({ t }).troubleshooting?.validators?.openaiCompatibleCheckConnectivity?.content" />
            </Callout>

            <div :class="['flex', 'items-center', 'justify-between']">
              <div :class="['text-xs', 'text-neutral-400']">
                {{ t('settings.pages.providers.catalog.edit.validators.title') }}
              </div>
              <Button size="sm" variant="secondary" :loading="isValidating" :disabled="isValidating" @click="runValidation">
                {{ t('settings.pages.providers.catalog.edit.validators.actions.validate') }}
              </Button>
            </div>

            <ProviderValidationDetailsDialog v-model="showValidationDetails" :steps="validationSteps" :step-id="activeValidationStepId" />

            <div v-if="validationSteps.length > 0" :class="['grid', 'gap-3', 'grid-cols-1', 'sm:grid-cols-2', 'xl:grid-cols-3']">
              <div v-for="step in validationSteps" :key="step.id" class="h-full">
                <div
                  :class="[
                    'p-3', 'h-full',
                    'flex', 'flex-col', 'gap-2',
                    'bg-white', 'dark:bg-neutral-900',
                    'rounded-lg',
                  ]"
                >
                  <div :class="['flex', 'items-start', 'justify-between', 'gap-2']">
                    <div :class="['text-sm', 'text-neutral-700', 'dark:text-neutral-200']">
                      {{ step.label }}
                    </div>
                    <div :class="['flex', 'flex-col', 'items-end', 'gap-2']">
                      <Button
                        size="sm"
                        variant="ghost"
                        :title="
                          step.status === 'valid' ? t('settings.pages.providers.catalog.edit.validators.status.valid')
                          : step.status === 'invalid' ? t('settings.pages.providers.catalog.edit.validators.status.invalid')
                            : step.status === 'validating' ? t('settings.pages.providers.catalog.edit.validators.status.validating')
                              : ''
                        "
                        @click="() => { activeValidationStepId = step.id; showValidationDetails = true }"
                      >
                        <div
                          :class="[
                            'text-lg', 'min-w-8',
                            step.status === 'valid' ? 'i-solar:check-circle-line-duotone text-emerald-600 dark:text-emerald-500' : '',
                            step.status === 'invalid' ? 'i-solar:close-circle-line-duotone text-red-600 dark:text-red-500' : '',
                            step.status === 'validating' ? 'i-solar:clock-circle-line-duotone text-amber-600 dark:text-amber-400' : '',
                            step.status === 'idle' ? 'i-solar:minus-circle-line-duotone text-neutral-300 dark:text-neutral-600' : '',
                          ]"
                        />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else :class="['text-sm', 'text-neutral-500']">
              {{ t('settings.pages.providers.catalog.edit.validators.empty') }}
            </div>

            <div :class="['flex', 'flex-col', 'gap-3']">
              <Alert v-if="hasValidationFailures" type="warning">
                <template #title>
                  {{ t('settings.pages.providers.catalog.edit.validation.failed.title') }}
                </template>
                <template #content>
                  <div :class="['flex', 'flex-col', 'gap-2', 'sm:flex-row', 'sm:items-center', 'sm:justify-between']">
                    <span :class="['text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
                      {{ t('settings.pages.providers.catalog.edit.validation.failed.description') }}
                    </span>
                    <Button size="sm" variant="caution" @click="handleSaveAnyway">
                      {{ t('settings.pages.providers.catalog.edit.validation.failed.action') }}
                    </Button>
                  </div>
                </template>
              </Alert>
            </div>
          </div>
        </template>
      </ProviderSettingsContainer>
    </div>
  </ProviderSettingsLayout>
</template>
