<template>
  <div v-if="isVisible" class="api-guide-modal-overlay">
    <div class="api-guide-modal">
      <div class="modal-header">
        <h2>{{ t('api.guide.title') }}</h2>
        <button @click="closeModal" class="close-button">×</button>
      </div>
      <div class="modal-content">
        <div class="guide-steps">
          <div
            v-for="(step, index) in guideSteps"
            :key="index"
            :class="['step-item', { active: currentStep === index }]"
          >
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-content">
              <h3>{{ step.title }}</h3>
              <p>{{ step.description }}</p>
              <div v-if="step.images && step.images.length > 0" class="step-images">
                <img
                  v-for="(image, imgIndex) in step.images"
                  :key="imgIndex"
                  :src="image.src"
                  :alt="image.alt"
                  class="step-image"
                />
              </div>
              <div v-if="step.links && step.links.length > 0" class="step-links">
                <a
                  v-for="(link, linkIndex) in step.links"
                  :key="linkIndex"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="step-link"
                >
                  {{ link.text }}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button
          @click="previousStep"
          :disabled="currentStep === 0"
          class="prev-button"
        >
          {{ t('api.guide.previous') }}
        </button>
        <button
          @click="nextStep"
          :disabled="currentStep === guideSteps.length - 1"
          class="next-button"
        >
          {{ t('api.guide.next') }}
        </button>
        <button
          v-if="currentStep === guideSteps.length - 1"
          @click="completeGuide"
          class="complete-button"
        >
          {{ t('api.guide.complete') }}
        </button>
        <div class="step-indicator">
          {{ currentStep + 1 }} / {{ guideSteps.length }}
        </div>
      </div>
      <div class="modal-footer-actions">
        <label class="show-again-label">
          <input
            type="checkbox"
            v-model="showAgain"
            class="show-again-checkbox"
          />
          {{ t('api.guide.showAgain') }}
        </label>
        <a
          href="/docs/api-guide"
          target="_blank"
          rel="noopener noreferrer"
          class="full-guide-link"
        >
          {{ t('api.guide.fullGuide') }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isVisible = ref(false)
const currentStep = ref(0)
const showAgain = ref(true)
const hasSeenGuide = useLocalStorage('api-guide-seen', false)

const guideSteps = [
  {
    title: t('api.guide.step1.title'),
    description: t('api.guide.step1.description'),
    links: [
      { text: t('api.guide.step1.link1'), url: 'https://platform.moonshot.cn/' },
      { text: t('api.guide.step1.link2'), url: 'https://cloud.volcengine.com/' },
    ]
  },
  {
    title: t('api.guide.step2.title'),
    description: t('api.guide.step2.description'),
    images: [
      { src: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=AI%20service%20API%20key%20creation%20interface&image_size=square', alt: t('api.guide.step2.image1') }
    ]
  },
  {
    title: t('api.guide.step3.title'),
    description: t('api.guide.step3.description'),
    images: [
      { src: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=AIRI%20API%20configuration%20interface&image_size=square', alt: t('api.guide.step3.image1') }
    ]
  },
  {
    title: t('api.guide.step4.title'),
    description: t('api.guide.step4.description'),
    links: [
      { text: t('api.guide.step4.link1'), url: '/docs/api-guide' }
    ]
  }
]

function openModal() {
  isVisible.value = true
  currentStep.value = 0
}

function closeModal() {
  isVisible.value = false
  if (!showAgain.value) {
    hasSeenGuide.value = true
  }
}

function nextStep() {
  if (currentStep.value < guideSteps.length - 1) {
    currentStep.value++
  }
}

function previousStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

function completeGuide() {
  closeModal()
  // Emit event to notify parent component
  if (defineEmits) {
    defineEmits(['guide-completed'])()
  }
}

onMounted(() => {
  // Show guide on first use
  if (!hasSeenGuide.value) {
    setTimeout(() => {
      openModal()
    }, 1000)
  }
})

defineExpose({
  openModal,
  closeModal
})
</script>

<style scoped>
.api-guide-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.api-guide-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.close-button:hover {
  background: #f8f9fa;
  color: #333;
}

.modal-content {
  padding: 20px;
}

.guide-steps {
  position: relative;
}

.step-item {
  display: none;
  position: relative;
}

.step-item.active {
  display: block;
}

.step-number {
  position: absolute;
  left: -40px;
  top: 0;
  width: 30px;
  height: 30px;
  background: #007bff;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.step-content {
  margin-left: 0;
  padding: 10px 0;
}

.step-content h3 {
  margin: 0 0 10px 0;
  font-size: 1.2rem;
  color: #333;
}

.step-content p {
  margin: 0 0 16px 0;
  color: #666;
  line-height: 1.5;
}

.step-images {
  margin: 16px 0;
}

.step-image {
  max-width: 100%;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 10px;
}

.step-links {
  margin: 16px 0;
}

.step-link {
  display: inline-block;
  margin-right: 10px;
  margin-bottom: 10px;
  padding: 6px 12px;
  background: #f8f9fa;
  color: #007bff;
  text-decoration: none;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.step-link:hover {
  background: #e9ecef;
  color: #0056b3;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prev-button {
  background: #6c757d;
  color: white;
}

.prev-button:hover:not(:disabled) {
  background: #5a6268;
}

.next-button {
  background: #007bff;
  color: white;
}

.next-button:hover:not(:disabled) {
  background: #0069d9;
}

.complete-button {
  background: #28a745;
  color: white;
}

.complete-button:hover {
  background: #218838;
}

.step-indicator {
  font-size: 0.9rem;
  color: #666;
}

.modal-footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: white;
  border-top: 1px solid #e9ecef;
}

.show-again-label {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: #666;
  cursor: pointer;
}

.show-again-checkbox {
  margin-right: 8px;
}

.full-guide-link {
  color: #007bff;
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s ease;
}

.full-guide-link:hover {
  color: #0056b3;
  text-decoration: underline;
}

@media (max-width: 768px) {
  .api-guide-modal {
    width: 95%;
    margin: 20px;
  }

  .step-number {
    left: 0;
    top: -40px;
  }

  .step-content {
    margin-top: 40px;
  }
}
</style>
