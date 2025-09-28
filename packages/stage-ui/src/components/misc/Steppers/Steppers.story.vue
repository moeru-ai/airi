<script setup lang="ts">
import { ref } from 'vue'

import Steppers from './Steppers.vue' // Import the new component

interface Step {
  id: number
  title: string
  description?: string
}

const setupWorkflowSteps: Step[] = [
  { id: 1, title: 'Welcome to StageWeb!', description: 'Let\'s get you set up. First, we need to configure at least one AI provider. Click "Next" to go to Provider Settings.' },
  { id: 2, title: 'Configure Provider', description: 'You are now in Provider Settings. Click on a provider (e.g., OpenAI, Ollama) to add your credentials (like API Key or Base URL).' },
  { id: 3, title: 'Set Up Consciousness', description: 'Great! Now head over to the "Consciousness" module in the settings.' },
  { id: 4, title: 'Select Consciousness Provider', description: 'In the Consciousness module, select the provider you just configured from the list.' },
  { id: 5, title: 'Select Consciousness Model', description: 'Now, choose a specific model from the list that this provider offers.' },
  { id: 6, title: 'Configure Text-to-Speech (TTS)?', description: 'Do you want to enable speech output? If yes, we need to configure a Speech Provider next. If not, you can skip to the end.' },
  { id: 7, title: 'Configure Speech Provider', description: '(Optional) Go back to Provider Settings and configure a provider that supports Speech (like ElevenLabs or Microsoft Speech).' },
  { id: 8, title: 'Set Up Speech Module', description: '(Optional) Navigate to the "Speech" module in settings.' },
  { id: 9, title: 'Select Speech Provider & Voice', description: '(Optional) Select your configured Speech provider and choose a voice you like.' },
  { id: 10, title: 'Setup Complete!', description: 'Excellent! Your core setup is complete. You can now return to the main page and start interacting.' },
]

const currentStepIndex = ref(0)

function handleFinish() {
  currentStepIndex.value = 0
}
</script>

<template>
  <Story title="Steppers" group="misc" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant title="Default Stepper">
      <Steppers
        v-model="currentStepIndex"
        :steps="setupWorkflowSteps"
        step-key="id"
        @finish="handleFinish"
      >
        <template #header>
          <p class="text-xs text-neutral-500/50 dark:text-neutral-400">
            First time? Follow this guide ({{ currentStepIndex + 1 }} / {{ setupWorkflowSteps.length }})
          </p>
        </template>
      </Steppers>
    </Variant>
  </Story>
</template>
