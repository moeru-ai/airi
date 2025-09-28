<script setup lang="ts">
import type { Ref } from 'vue'

// import Steps from './Steps.vue'
import { ref } from 'vue'

interface Step {
  id: number
  title: string
  description?: string
}

const stepsData: Step[] = [
  { id: 1, title: 'アカウント作成', description: 'ユーザー情報を入力します。' }, // Account Creation - Enter user information.
  { id: 2, title: 'プロフィール設定', description: '詳細なプロフィール情報を設定します。これは非常に長い説明文になる可能性があります。' }, // Profile Settings - Set detailed profile information. This could be a very long description.
  { id: 3, title: '確認', description: '入力内容を確認します。' }, // Confirmation - Confirm your input.
  { id: 4, title: '完了', description: 'プロセスが完了しました。' }, // Completion - The process is complete.
]

function createStepperState(initialStep: number = 1): { currentStep: Ref<number>, totalSteps: number, steps: Step[] } {
  return {
    currentStep: ref(initialStep),
    totalSteps: stepsData.length,
    steps: stepsData,
  }
}

const stepper3 = createStepperState()
const stepper8 = createStepperState()
const stepper16 = createStepperState()

function updateStep(state: { currentStep: Ref<number> }, stepId: number) {
  state.currentStep.value = stepId
}

function isStepActive(state: { currentStep: Ref<number> }, stepId: number): boolean {
  return state.currentStep.value === stepId
}

function isStepCompleted(state: { currentStep: Ref<number> }, stepId: number): boolean {
  return state.currentStep.value > stepId
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

// Separate state for this specific tutorial variant
const setupGuide = {
  currentStep: ref(1),
  totalSteps: setupWorkflowSteps.length,
  steps: setupWorkflowSteps,
  skippedTTS: ref(false), // Track if TTS setup was skipped
}

function updateSetupGuideStep(stepId: number) {
  setupGuide.currentStep.value = stepId
  // Logic to skip TTS steps if user chooses
  if (stepId === 6 && setupGuide.skippedTTS.value) {
    setupGuide.currentStep.value = 10 // Skip directly to the end
  }
}

function nextSetupGuideStep() {
  const current = setupGuide.currentStep.value
  if (current === 6 && setupGuide.skippedTTS.value) {
    updateSetupGuideStep(10) // Skip TTS
  }
  else if (current < setupGuide.totalSteps) {
    updateSetupGuideStep(current + 1)
  }
}

function prevSetupGuideStep() {
  const current = setupGuide.currentStep.value
  if (current === 10 && setupGuide.skippedTTS.value) {
    updateSetupGuideStep(6) // Go back to the skip question
  }
  else if (current > 1) {
    updateSetupGuideStep(current - 1)
  }
}

function skipTTSSetup() {
  setupGuide.skippedTTS.value = true
  updateSetupGuideStep(10) // Go directly to the final step
}
</script>

<template>
  <Story title="Steps" group="misc" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <!-- Variant 3: Vertical Timeline Icons -->
    <Variant title="3. Vertical Timeline Icons">
      <div class="w-full flex p-4">
        <div class="relative flex flex-col gap-8">
          <!-- Connecting line -->
          <div class="absolute bottom-4 left-[14px] top-4 w-0.5 bg-neutral-300 -z-1 dark:bg-neutral-700" />
          <template v-for="step in stepper3.steps" :key="step.id">
            <div class="flex cursor-pointer items-start gap-4" @click="updateStep(stepper3, step.id)">
              <div
                class="size-8 flex items-center justify-center border-2 rounded-full transition-all duration-300 ease-in-out"
                :class="[
                  isStepActive(stepper3, step.id) ? 'bg-primary-100 dark:bg-primary-900 border-primary-500 scale-110' : 'border-transparent',
                  isStepCompleted(stepper3, step.id) ? 'bg-primary-500 dark:bg-primary-600 border-primary-500' : '',
                  !isStepActive(stepper3, step.id) && !isStepCompleted(stepper3, step.id) ? 'bg-neutral-200 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700' : '',
                ]"
              >
                <!-- Placeholder for Icon -->
                <div
                  v-if="isStepCompleted(stepper3, step.id)" i-solar:check-read-bold-duotone
                  class="text-white dark:text-black"
                />
                <span
                  v-else class="text-sm font-semibold"
                  :class="[isStepActive(stepper3, step.id) ? 'text-primary-700 dark:text-primary-200' : 'text-neutral-600 dark:text-neutral-300']"
                >
                  {{ step.id }}
                </span>
              </div>
              <div class="mt-1">
                <p
                  class="font-medium"
                  :class="[isStepActive(stepper3, step.id) ? 'text-primary-700 dark:text-primary-200' : 'text-neutral-800 dark:text-neutral-200']"
                >
                  {{ step.title }}
                </p>
                <p v-if="isStepActive(stepper3, step.id)" class="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {{ step.description }}
                </p>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Variant>

    <!-- Variant 8: Accordion Steps -->
    <Variant title="8. Accordion Steps">
      <div class="w-full flex flex-col gap-2 p-4">
        <template v-for="step in stepper8.steps" :key="step.id">
          <div
            class="overflow-hidden border rounded-lg transition-all duration-300 ease-in-out" :class="[
              isStepActive(stepper8, step.id) ? 'border-primary-300 dark:border-primary-700 shadow-md' : 'border-neutral-200 dark:border-neutral-800',
              isStepCompleted(stepper8, step.id) ? 'bg-neutral-50 dark:bg-neutral-900/30' : 'bg-white dark:bg-neutral-900/20',
            ]"
          >
            <div
              class="flex cursor-pointer items-center justify-between p-3"
              :class="[isStepCompleted(stepper8, step.id) ? 'opacity-70' : '']"
              @click="updateStep(stepper8, step.id)"
            >
              <div class="flex items-center gap-3">
                <div
                  class="size-5 flex items-center justify-center border rounded-full text-xs font-medium transition-all duration-300 ease-in-out"
                  :class="[
                    isStepActive(stepper8, step.id) ? 'bg-primary-100 dark:bg-primary-900 border-primary-500 text-primary-700 dark:text-primary-200' : '',
                    isStepCompleted(stepper8, step.id) ? 'bg-primary-500 dark:bg-primary-600 border-primary-500 text-white dark:text-black' : '',
                    !isStepActive(stepper8, step.id) && !isStepCompleted(stepper8, step.id) ? 'bg-neutral-200 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400' : '',
                  ]"
                >
                  <div v-if="isStepCompleted(stepper8, step.id)" i-solar:check-read-bold-duotone text-xs />
                  <span v-else>{{ step.id }}</span>
                </div>
                <span
                  class="text-sm font-medium"
                  :class="[isStepActive(stepper8, step.id) ? 'text-primary-700 dark:text-primary-200' : 'text-neutral-700 dark:text-neutral-300']"
                >
                  {{ step.title }}
                </span>
              </div>
              <div
                v-if="!isStepActive(stepper8, step.id)"
                class="i-solar:alt-arrow-down-linear text-sm text-neutral-400 transition-transform duration-300 dark:text-neutral-600"
                :class="{ 'rotate-180': isStepActive(stepper8, step.id) }"
              />
              <button
                v-else-if="stepper8.currentStep.value < stepper8.totalSteps"
                class="rounded bg-primary-500 px-2 py-0.5 text-xs text-white hover:bg-primary-600"
                @click.stop="updateStep(stepper8, step.id + 1)"
              >
                Next
              </button>
            </div>
            <!-- Expanded Content -->
            <Transition name="expand">
              <div
                v-if="isStepActive(stepper8, step.id)"
                class="border-t border-neutral-200 px-3 pb-3 pt-1 dark:border-neutral-800"
              >
                <p class="text-sm text-neutral-600 dark:text-neutral-400">
                  {{ step.description || 'No description available for this step.' }}
                </p>
                <!-- Placeholder for step content -->
                <div class="mt-4 rounded bg-neutral-100 p-4 text-center text-sm text-neutral-500 dark:bg-neutral-800">
                  Step {{ step.id }} Content Area
                </div>
              </div>
            </Transition>
          </div>
        </template>
      </div>
    </Variant>

    <!-- Variant 16: Stacked Cards -->
    <Variant title="16. Stacked Cards">
      <div class="h-48 w-full flex perspective-1000 items-center justify-center p-6">
        <div class="relative h-28 w-48">
          <!-- Calculate relative position and apply dynamic styles for stacking -->
          <template v-for="step in stepper16.steps" :key="step.id">
            <div
              :style="(() => {
                const totalSteps = stepper16.totalSteps;
                const currentStepValue = stepper16.currentStep.value;
                // Calculate how many steps 'behind' the active card this one is (0 = active)
                const relativePosition = (step.id - currentStepValue + totalSteps) % totalSteps;
                const isActive = relativePosition === 0;

                // Define style properties based on relative position
                const zIndex = totalSteps - relativePosition;
                const scale = 1 - relativePosition * 0.04; // Decrease scale slightly for cards further back
                const translateX = relativePosition * 12; // Offset X based on position
                const translateY = relativePosition * 6; // Offset Y less than X
                const rotateZ = relativePosition * 2; // Rotate slightly based on position
                const opacity = 1 - relativePosition * 0.1; // Decrease opacity for cards further back
                const filter = isActive ? 'none' : `blur(${relativePosition * 0.5}px)`; // Blur background cards

                return {
                  zIndex,
                  transform: `translateX(${translateX}px) translateY(${translateY}px) rotateZ(${rotateZ}deg) scale(${scale})`,
                  opacity,
                  filter,
                };
              })()"
              class="absolute h-full w-full flex flex-col preserve-3d cursor-pointer justify-between border border-2 rounded-lg p-3 shadow-lg transition-all duration-500 ease-out"
              :class="[
                // Simplified classes: Active vs Inactive styling
                (stepper16.currentStep.value === step.id)
                  ? 'bg-primary-50 dark:bg-primary-900/50 border-primary-300 dark:border-primary-700'
                  : 'bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800',
              ]"
              @click="() => {
                if (stepper16.currentStep.value === step.id) {
                  // Clicked the active card: cycle it to the back by advancing the step
                  const nextStepId = (stepper16.currentStep.value % stepper16.totalSteps) + 1;
                  updateStep(stepper16, nextStepId);
                }
                else {
                  // Clicked an inactive card: bring it to the front
                  updateStep(stepper16, step.id);
                }
              }"
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-sm font-medium"
                  :class="(stepper16.currentStep.value === step.id) ? 'text-primary-700 dark:text-primary-200' : 'text-neutral-600 dark:text-neutral-300'"
                >{{
                  step.title }}</span>
                <span
                  class="rounded px-1.5 py-0.5 text-xs"
                  :class="(stepper16.currentStep.value === step.id) ? 'bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-200' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'"
                >
                  {{ step.id }} / {{ stepper16.totalSteps }}
                </span>
              </div>
              <!-- Show description only for the active card -->
              <p
                v-if="stepper16.currentStep.value === step.id"
                class="line-clamp-2 text-xs text-neutral-500 dark:text-neutral-400"
              >
                {{ step.description }}
              </p>
              <!-- Placeholder for inactive cards to maintain height -->
              <div v-else class="h-6" />
            </div>
          </template>
        </div>
      </div>
    </Variant>

    <!-- Tutorial Variant E: Multi-Page Workflow Guide -->
    <Variant title="E. Tutorial: Setup Workflow">
      <div class="w-full p-4">
        <div class="dark:from-neutral-850 flex flex-col overflow-hidden rounded-xl from-white to-neutral-100 bg-gradient-to-b shadow-md dark:to-neutral-900">
          <!-- Header -->
          <div class="bg-white/70 p-4 backdrop-blur-sm dark:bg-neutral-950/60">
            <h4 class="text-base text-neutral-800 font-semibold dark:text-neutral-100">
              StageWeb Setup Guide
            </h4>
          </div>

          <!-- Current Step Content -->
          <div class="p-4 space-y-3">
            <p class="text-sm text-primary-600 font-medium dark:text-primary-300">
              Step {{ setupGuide.currentStep.value }}: {{ setupGuide.steps[setupGuide.currentStep.value - 1]?.title }}
            </p>
            <p class="text-sm text-neutral-600 dark:text-neutral-300">
              {{ setupGuide.steps[setupGuide.currentStep.value - 1]?.description }}
            </p>
            <!-- Special actions for step 6 (TTS decision) -->
            <div v-if="setupGuide.currentStep.value === 6" class="flex gap-2 pt-2">
              <button
                class="rounded bg-primary-500 px-3 py-1 text-xs text-white hover:bg-primary-600"
                @click="nextSetupGuideStep"
              >
                Yes, setup TTS
              </button>
              <button
                class="rounded bg-neutral-200 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-700 hover:bg-neutral-300 dark:text-neutral-200 dark:hover:bg-neutral-600"
                @click="skipTTSSetup"
              >
                Skip TTS
              </button>
            </div>
          </div>

          <!-- Navigation Footer -->
          <div class="flex items-center justify-between bg-white/70 px-4 py-3 backdrop-blur-sm dark:bg-neutral-950/60">
            <!-- Progress Dots -->
            <div class="flex gap-1.5">
              <template v-for="step in setupGuide.steps" :key="`dot-${step.id}`">
                <div
                  class="size-2 cursor-pointer rounded-full transition-colors duration-200"
                  :class="[
                    step.id === setupGuide.currentStep.value ? 'bg-primary-500 scale-110' : 'bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400',
                    step.id < setupGuide.currentStep.value ? 'bg-primary-300 dark:bg-primary-700' : '',
                    (step.id >= 7 && step.id <= 9 && setupGuide.skippedTTS.value) ? 'bg-neutral-200 dark:bg-neutral-700 opacity-50' : '', // Visually indicate skipped steps
                  ]"
                  :title="`Step ${step.id}: ${step.title}`"
                  @click="updateSetupGuideStep(step.id)"
                />
              </template>
            </div>

            <!-- Back/Next Buttons (Hide on step 6) -->
            <div v-if="setupGuide.currentStep.value !== 6" class="flex gap-2">
              <button
                :disabled="setupGuide.currentStep.value <= 1"
                class="rounded bg-neutral-200 px-3 py-1 text-xs text-neutral-700 disabled:cursor-not-allowed dark:bg-neutral-700 hover:bg-neutral-300 dark:text-neutral-200 disabled:opacity-50 dark:hover:bg-neutral-600"
                @click="prevSetupGuideStep"
              >
                Back
              </button>
              <button
                :disabled="setupGuide.currentStep.value >= setupGuide.totalSteps"
                class="rounded bg-primary-500 px-3 py-1 text-xs text-white disabled:cursor-not-allowed hover:bg-primary-600 disabled:opacity-50"
                @click="nextSetupGuideStep"
              >
                {{ setupGuide.currentStep.value >= setupGuide.totalSteps ? 'Finish' : 'Next' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
/* For Variant 8 Accordion */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease-in-out;
  max-height: 200px;
  /* Adjust as needed */
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

/* For Variant 9 Character Card */
.perspective-1000 {
  perspective: 1000px;
}

.preserve-3d {
  transform-style: preserve-3d;
}

.rotate-y-0 {
  transform: rotateY(0deg);
}

.rotate-y-10 {
  transform: rotateY(10deg);
}

.-rotate-y-10 {
  transform: rotateY(-10deg);
}

/* For Variant 10 Interlocking Shapes */
/* Use CSS for clip-path as UnoCSS might not directly support complex polygons */
.clip-path-chevron-right {
  clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%);
}

.clip-path-chevron-left {
  clip-path: polygon(10px 0%, 100% 0%, 100% 100%, 10px 100%, 0% 50%);
}

/* For Variant 12 Chevron Arrow Bar */
.clip-path-arrow {
  /* Creates an arrow shape pointing right */
  clip-path: polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 10px 50%);
}

/* For Variant 17 SVG path marker */
/* Keyframe animation for the marker (alternative to smil) */
@keyframes moveMarker {
  from {
    motion-offset: 0%;
  }

  to {
    motion-offset: 100%;
  }
}

.animated-marker {
  motion-path: path('M 20 32 C 60 10, 100 10, 128 32 S 196 54, 236 32');
  animation: moveMarker 2s linear infinite;
  /* Example infinite animation */
  /* For actual step positioning, inline style or JS is better */
  offset-path: path('M 20 32 C 60 10, 100 10, 128 32 S 196 54, 236 32');
  /* offset-distance needs to be set dynamically based on current step */
  transition: offset-distance 0.5s ease-out;
}

/* Ensure sufficient contrast in forced-colors mode */
@media (forced-colors: active) {
  .bg-primary-50,
  .bg-primary-100,
  .bg-neutral-50,
  .bg-neutral-100,
  .bg-neutral-200,
  .bg-neutral-300,
  .bg-white {
    forced-color-adjust: none;
    background-color: ButtonFace;
    color: ButtonText;
  }

  .dark\:bg-primary-900\/20,
  .dark\:bg-primary-900,
  .dark\:bg-neutral-900\/20,
  .dark\:bg-neutral-900,
  .dark\:bg-neutral-950,
  .dark\:bg-neutral-800,
  .dark\:bg-neutral-700 {
    forced-color-adjust: none;
    background-color: ButtonFace;
    color: ButtonText;
  }

  .border-primary-100,
  .border-primary-300,
  .border-primary-500,
  .border-neutral-100,
  .border-neutral-200,
  .border-neutral-300 {
    forced-color-adjust: none;
    border-color: ButtonText;
  }

  .dark\:border-primary-900,
  .dark\:border-primary-700,
  .dark\:border-primary-400,
  .dark\:border-neutral-900,
  .dark\:border-neutral-800,
  .dark\:border-neutral-700 {
    forced-color-adjust: none;
    border-color: ButtonText;
  }

  .text-primary-500,
  .text-primary-600,
  .text-primary-700,
  .text-neutral-500,
  .text-neutral-600,
  .text-neutral-700,
  .text-neutral-800,
  .text-white {
    forced-color-adjust: none;
    color: ButtonText;
  }

  .dark\:text-primary-400,
  .dark\:text-primary-300,
  .dark\:text-primary-200,
  .dark\:text-neutral-400,
  .dark\:text-neutral-300,
  .dark\:text-neutral-200,
  .dark\:text-black {
    forced-color-adjust: none;
    color: ButtonText;
  }

  .bg-primary-500,
  .bg-primary-400,
  .bg-primary-300,
  .bg-green-400,
  .bg-teal-500 {
    forced-color-adjust: none;
    background-color: Highlight;
    color: HighlightText;
  }

  .dark\:bg-primary-900,
  .dark\:bg-primary-700,
  .dark\:bg-primary-600,
  .dark\:bg-green-600,
  .dark\:bg-teal-700 {
    forced-color-adjust: none;
    background-color: Highlight;
    color: HighlightText;
  }
}
</style>
