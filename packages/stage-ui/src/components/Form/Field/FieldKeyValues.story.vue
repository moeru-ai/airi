<script setup lang="ts">
import { FieldKeyValues } from '@proj-airi/ui'
import { ref, watch } from 'vue'

const emptyHeaders = ref<{ key: string, value: string }[]>([
  { key: '', value: '' },
])
const singleHeader = ref<{ key: string, value: string }[]>([
  { key: 'Content-Type', value: 'application/json' },
])
const multipleHeaders = ref<{ key: string, value: string }[]>([
  { key: 'Authorization', value: 'Bearer token123' },
  { key: 'Accept', value: 'application/json' },
  { key: 'X-API-Key', value: 'abc123xyz456' },
])

function addKeyValue(headers: { key: string, value: string }[], key: string, value: string) {
  if (!headers)
    return

  headers.push({ key, value })
}

function removeKeyValue(index: number, headers: { key: string, value: string }[]) {
  if (!headers)
    return

  if (headers.length === 1) {
    headers[0].key = ''
    headers[0].value = ''
  }
  else {
    headers.splice(index, 1)
  }
}

watch(emptyHeaders, (headers) => {
  if (headers.length > 0 && (headers[headers.length - 1].key !== '' || headers[headers.length - 1].value !== '')) {
    emptyHeaders.value.push({ key: '', value: '' })
  }
}, {
  deep: true,
  immediate: true,
})

watch(singleHeader, (headers) => {
  if (headers.length > 0 && (headers[headers.length - 1].key !== '' || headers[headers.length - 1].value !== '')) {
    singleHeader.value.push({ key: '', value: '' })
  }
}, {
  deep: true,
  immediate: true,
})

watch(multipleHeaders, (headers) => {
  if (headers.length > 0 && (headers[headers.length - 1].key !== '' || headers[headers.length - 1].value !== '')) {
    multipleHeaders.value.push({ key: '', value: '' })
  }
}, {
  deep: true,
  immediate: true,
})
</script>

<template>
  <Story
    title="Field Key Values"
    group="form"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="empty"
      title="Empty"
    >
      <div>
        <FieldKeyValues
          v-model="emptyHeaders"
          label="HTTP Headers"
          description="Add custom HTTP headers"
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(emptyHeaders, key, value)"
          @remove="(index) => removeKeyValue(index, emptyHeaders)"
        />
      </div>
    </Variant>

    <Variant
      id="single-header"
      title="Single Header"
    >
      <div>
        <FieldKeyValues
          v-model="singleHeader"
          label="HTTP Headers"
          description="Add custom HTTP headers"
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(singleHeader, key, value)"
          @remove="(index) => removeKeyValue(index, singleHeader)"
        />
      </div>
    </Variant>

    <Variant
      id="multiple-headers"
      title="Multiple Headers"
    >
      <div>
        <FieldKeyValues
          v-model="multipleHeaders"
          label="HTTP Headers"
          description="Add custom HTTP headers"
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(multipleHeaders, key, value)"
          @remove="(index) => removeKeyValue(index, multipleHeaders)"
        />
      </div>
    </Variant>

    <Variant
      id="with-provider"
      title="With Provider Name"
    >
      <div>
        <FieldKeyValues
          v-model="emptyHeaders"
          label="API Headers"
          description="Add custom headers for this API"
          name="OpenAI"
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(emptyHeaders, key, value)"
          @remove="(index) => removeKeyValue(index, emptyHeaders)"
        />
      </div>
    </Variant>

    <Variant
      id="required"
      title="Required Field"
    >
      <div>
        <FieldKeyValues
          v-model="emptyHeaders"
          label="Required Headers"
          description="These headers are required"
          required
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(emptyHeaders, key, value)"
          @remove="(index) => removeKeyValue(index, emptyHeaders)"
        />
      </div>
    </Variant>

    <Variant
      id="optional"
      title="Optional Field"
    >
      <div>
        <FieldKeyValues
          v-model="emptyHeaders"
          label="Optional Headers"
          description="These headers are optional"
          :required="false"
          key-placeholder="Key"
          value-placeholder="Value"
          @add="(key, value) => addKeyValue(emptyHeaders, key, value)"
          @remove="(index) => removeKeyValue(index, emptyHeaders)"
        />
      </div>
    </Variant>
  </Story>
</template>
