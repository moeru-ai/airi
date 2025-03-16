<script setup lang="ts">
import { ref } from 'vue'

import Input from './Input.vue'

const textValue = ref('')
const filledTextValue = ref('Sample text')
const passwordValue = ref('secret-password')
const emailValue = ref('user@example.com')
const numberValue = ref('42')
const urlValue = ref('https://example.com')
</script>

<template>
  <Story
    title="Input"
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
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="textValue"
          placeholder="Enter text..."
        />
      </div>
    </Variant>

    <Variant
      id="text-filled"
      title="Text Input (Filled)"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="filledTextValue"
          placeholder="Enter text..."
        />
      </div>
    </Variant>

    <Variant
      id="password"
      title="Password Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="passwordValue"
          type="password"
          placeholder="Enter password..."
        />
      </div>
    </Variant>

    <Variant
      id="email"
      title="Email Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="emailValue"
          type="email"
          placeholder="Enter email..."
        />
      </div>
    </Variant>

    <Variant
      id="number"
      title="Number Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="numberValue"
          type="number"
          placeholder="Enter number..."
        />
      </div>
    </Variant>

    <Variant
      id="url"
      title="URL Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="urlValue"
          type="url"
          placeholder="Enter URL..."
        />
      </div>
    </Variant>

    <Variant
      id="disabled"
      title="Disabled Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="filledTextValue"
          placeholder="This input is disabled"
          disabled
        />
      </div>
    </Variant>

    <Variant
      id="readonly"
      title="Readonly Input"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="filledTextValue"
          placeholder="This input is readonly"
          readonly
        />
      </div>
    </Variant>

    <Variant
      id="with-classes"
      title="With Custom Classes"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="textValue"
          placeholder="Custom styled input"
          class="border-primary-500 dark:border-primary-400"
        />
      </div>
    </Variant>

    <Variant
      id="with-autofocus"
      title="With Autofocus"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <Input
          v-model="textValue"
          placeholder="This input has autofocus"
          autofocus
        />
      </div>
    </Variant>
  </Story>
</template>
