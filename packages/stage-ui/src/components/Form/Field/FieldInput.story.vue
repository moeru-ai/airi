<script setup lang="ts">
import { ref } from 'vue'

import ProviderInput from './FieldInput.vue'

const textValue = ref('')
const passwordValue = ref('secret-password')
const emailValue = ref('user@example.com')
</script>

<template>
  <Story
    title="Field Input"
    group="form"
    :layout="{ type: 'grid', width: 600 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="text-empty"
      title="Text Input (Empty)"
    >
      <div>
        <ProviderInput
          v-model="textValue"
          label="Text Input"
          description="A basic text input field"
          placeholder="Enter text..."
        />
      </div>
    </Variant>

    <Variant
      id="password"
      title="Password Input"
    >
      <div>
        <ProviderInput
          v-model="passwordValue"
          label="Password"
          description="A password input field"
          placeholder="Enter password..."
          type="password"
        />
      </div>
    </Variant>

    <Variant
      id="email"
      title="Email Input"
    >
      <div>
        <ProviderInput
          v-model="emailValue"
          label="Email Address"
          description="An email input field"
          placeholder="Enter email..."
          type="email"
        />
      </div>
    </Variant>

    <Variant
      id="required"
      title="Required Input"
    >
      <div>
        <ProviderInput
          v-model="textValue"
          label="Required Field"
          description="This field is required"
          placeholder="Enter value..."
          required
        />
      </div>
    </Variant>

    <Variant
      id="not-required"
      title="Optional Input"
    >
      <div>
        <ProviderInput
          v-model="textValue"
          label="Optional Field"
          description="This field is optional"
          placeholder="Enter value..."
          :required="false"
        />
      </div>
    </Variant>
  </Story>
</template>
