<script setup lang="ts">
import type { RouterDefaultsDraft } from '../../modules/router-config-form'

import { Button, FieldInput, FieldTextArea } from '@proj-airi/ui'

import { defaultTtsVoicesJson } from '../../modules/router-config-form'

const defaults = defineModel<RouterDefaultsDraft>({ required: true })
</script>

<template>
  <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-4']">
    <div :class="['mb-4', 'flex', 'items-start', 'justify-between', 'gap-3']">
      <div>
        <h3 :class="['text-sm', 'font-semibold']">
          Defaults
        </h3>
        <p :class="['mt-1', 'text-xs', 'text-neutral-500']">
          Writes default model aliases alongside provider slices when filled.
        </p>
      </div>
    </div>

    <div :class="['grid', 'gap-4', 'md:grid-cols-2']">
      <FieldInput
        v-model="defaults.chatModel"
        description="Writes DEFAULT_CHAT_MODEL."
        input-class="font-mono text-xs"
        label="Chat model"
        placeholder="chat-default"
      />
      <FieldInput
        v-model="defaults.ttsModel"
        description="Writes DEFAULT_TTS_MODEL."
        input-class="font-mono text-xs"
        label="TTS model"
        placeholder="alibaba/cosyvoice-v2"
      />
    </div>

    <div :class="['mt-4']">
      <div :class="['mb-2', 'flex', 'items-center', 'justify-between', 'gap-3']">
        <div>
          <div :class="['text-sm', 'font-medium']">
            Recommended voices
          </div>
          <div :class="['text-xs', 'text-neutral-500']">
            JSON object written to DEFAULT_TTS_VOICES.
          </div>
        </div>
        <Button
          class="whitespace-nowrap"
          label="Example"
          size="sm"
          type="button"
          variant="secondary"
          @click="defaults.ttsVoicesJson = defaultTtsVoicesJson()"
        />
      </div>
      <FieldTextArea
        v-model="defaults.ttsVoicesJson"
        :required="false"
        :rows="6"
        textarea-class="font-mono text-xs leading-5"
        placeholder="{&#10;  &quot;alibaba/cosyvoice-v2&quot;: {&#10;    &quot;zh-CN&quot;: &quot;longxiaochun_v2&quot;&#10;  }&#10;}"
      />
    </div>
  </section>
</template>
