<route lang="yaml">
meta:
  layout: settings
  title: 隐私保护
  icon: i-lucide-shield
</route>

<script setup lang="ts">
import { useVisionStore } from '@proj-airi/stage-ui/stores'
import { Button } from '@proj-airi/ui/components'
/**
 * 隐私保护设置页面
 * 配置敏感信息检测和脱敏规则
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const visionStore = useVisionStore()

// 隐私配置
const privacyConfig = ref({
  enabled: true,
  protectedTypes: ['email', 'phone', 'creditCard', 'password', 'apiKey', 'token', 'ssn'],
  customSensitiveWords: [] as string[],
  maskMode: 'mask' as 'mask' | 'remove' | 'hash',
  maskKeepPrefix: 2,
  maskKeepSuffix: 2,
  maskChar: '*',
})

// 敏感信息类型选项
const sensitiveTypeOptions = [
  { value: 'email', label: '邮箱地址', description: 'example@email.com' },
  { value: 'phone', label: '手机号码', description: '138****8888' },
  { value: 'creditCard', label: '信用卡号', description: '**** **** **** 1234' },
  { value: 'ssn', label: '身份证号', description: '3****************1' },
  { value: 'password', label: '密码', description: '********' },
  { value: 'apiKey', label: 'API 密钥', description: 'sk-****abcd' },
  { value: 'token', label: '访问令牌', description: 'eyJ****' },
  { value: 'ipAddress', label: 'IP 地址', description: '192.168.*.*' },
  { value: 'url', label: 'URL 链接', description: 'https://***' },
  { value: 'name', label: '姓名', description: '张**' },
  { value: 'address', label: '地址', description: '北京市****' },
]

// 脱敏模式选项
const maskModeOptions = [
  { value: 'mask', label: '掩码模式', description: '保留部分字符，其余用 * 代替' },
  { value: 'remove', label: '移除模式', description: '完全移除敏感信息' },
  { value: 'hash', label: '哈希模式', description: '替换为哈希值标识' },
]

// 新自定义敏感词
const newCustomWord = ref('')

// 测试文本
const testText = ref('')
const testResult = ref<{ sanitized: string, detected: any[] } | null>(null)

// 加载配置
onMounted(async () => {
  await visionStore.init()
  if (visionStore.config.privacy) {
    privacyConfig.value = { ...privacyConfig.value, ...visionStore.config.privacy }
  }
})

// 切换敏感信息类型
function toggleSensitiveType(type: string) {
  const index = privacyConfig.value.protectedTypes.indexOf(type)
  if (index > -1) {
    privacyConfig.value.protectedTypes.splice(index, 1)
  }
  else {
    privacyConfig.value.protectedTypes.push(type)
  }
}

// 添加自定义敏感词
function addCustomWord() {
  const word = newCustomWord.value.trim()
  if (word && !privacyConfig.value.customSensitiveWords.includes(word)) {
    privacyConfig.value.customSensitiveWords.push(word)
    newCustomWord.value = ''
  }
}

// 移除自定义敏感词
function removeCustomWord(word: string) {
  const index = privacyConfig.value.customSensitiveWords.indexOf(word)
  if (index > -1) {
    privacyConfig.value.customSensitiveWords.splice(index, 1)
  }
}

// 保存配置
async function saveConfig() {
  await visionStore.updateConfig({
    privacy: privacyConfig.value,
  })
}

// 测试隐私保护
async function testPrivacy() {
  if (!testText.value.trim())
    return

  // 这里应该调用主进程的隐私保护服务
  // 暂时模拟结果
  testResult.value = {
    sanitized: testText.value
      .replace(/\b[\w.%+-]+@[A-Z0-9.-]+\.[A-Z|]{2,}\b/gi, (match) => {
        const atIndex = match.indexOf('@')
        return `${match.slice(0, 2)}***@***${match.slice(match.lastIndexOf('.'))}`
      })
      .replace(/1[3-9]\d{9}/g, match => `${match.slice(0, 3)}****${match.slice(-4)}`),
    detected: [
      { type: 'email', value: 'test@example.com' },
      { type: 'phone', value: '13812345678' },
    ],
  }
}

// 重置为默认
function resetToDefault() {
  privacyConfig.value = {
    enabled: true,
    protectedTypes: ['email', 'phone', 'creditCard', 'password', 'apiKey', 'token', 'ssn'],
    customSensitiveWords: [],
    maskMode: 'mask',
    maskKeepPrefix: 2,
    maskKeepSuffix: 2,
    maskChar: '*',
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center gap-4">
      <div class="h-10 w-10 flex items-center justify-center rounded-xl bg-green-500/10">
        <div class="i-lucide-shield h-5 w-5 text-green-500" />
      </div>
      <div>
        <h1 class="text-xl font-semibold">
          {{ t('settings.privacy.title', '隐私保护') }}
        </h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ t('settings.privacy.subtitle', '配置敏感信息检测和脱敏规则') }}
        </p>
      </div>
    </div>

    <!-- 启用隐私保护 -->
    <div class="border border-neutral-200 rounded-2xl p-6 space-y-4 dark:border-neutral-800">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-medium">
            {{ t('settings.privacy.enable', '启用隐私保护') }}
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t('settings.privacy.enable_desc', '自动检测并脱敏敏感信息') }}
          </p>
        </div>
        <button
          class="relative h-6 w-11 rounded-full transition-colors"
          :class="privacyConfig.enabled ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-700'"
          @click="privacyConfig.enabled = !privacyConfig.enabled"
        >
          <span
            class="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform"
            :class="privacyConfig.enabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <!-- 敏感信息类型 -->
    <div class="border border-neutral-200 rounded-2xl p-6 space-y-4 dark:border-neutral-800">
      <h3 class="font-medium">
        {{ t('settings.privacy.sensitive_types', '保护的敏感信息类型') }}
      </h3>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.privacy.sensitive_types_desc', '选择需要检测和保护的敏感信息类型') }}
      </p>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          v-for="option in sensitiveTypeOptions"
          :key="option.value"
          class="flex cursor-pointer items-start gap-3 border rounded-xl p-3 transition-colors"
          :class="privacyConfig.protectedTypes.includes(option.value)
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'"
        >
          <input
            type="checkbox"
            :checked="privacyConfig.protectedTypes.includes(option.value)"
            class="mt-0.5 h-4 w-4 border-neutral-300 rounded text-green-500 focus:ring-green-500"
            @change="toggleSensitiveType(option.value)"
          >
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ option.label }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ option.description }}
            </div>
          </div>
        </label>
      </div>
    </div>

    <!-- 脱敏模式 -->
    <div class="border border-neutral-200 rounded-2xl p-6 space-y-4 dark:border-neutral-800">
      <h3 class="font-medium">
        {{ t('settings.privacy.mask_mode', '脱敏模式') }}
      </h3>

      <div class="space-y-3">
        <label
          v-for="option in maskModeOptions"
          :key="option.value"
          class="flex cursor-pointer items-start gap-3 border rounded-xl p-3 transition-colors"
          :class="privacyConfig.maskMode === option.value
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'"
        >
          <input
            v-model="privacyConfig.maskMode"
            type="radio"
            :value="option.value"
            class="mt-0.5 h-4 w-4 border-neutral-300 text-green-500 focus:ring-green-500"
          >
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ option.label }}
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ option.description }}
            </div>
          </div>
        </label>
      </div>

      <!-- 掩码设置（仅在掩码模式下显示） -->
      <div v-if="privacyConfig.maskMode === 'mask'" class="border-t border-neutral-200 pt-4 space-y-4 dark:border-neutral-800">
        <h4 class="text-sm font-medium">
          {{ t('settings.privacy.mask_settings', '掩码设置') }}
        </h4>

        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.privacy.keep_prefix', '保留前缀') }}
            </label>
            <input
              v-model.number="privacyConfig.maskKeepPrefix"
              type="number"
              min="0"
              max="10"
              class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
          </div>

          <div class="space-y-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.privacy.keep_suffix', '保留后缀') }}
            </label>
            <input
              v-model.number="privacyConfig.maskKeepSuffix"
              type="number"
              min="0"
              max="10"
              class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
          </div>

          <div class="space-y-2">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.privacy.mask_char', '掩码字符') }}
            </label>
            <input
              v-model="privacyConfig.maskChar"
              type="text"
              maxlength="1"
              class="w-full border border-neutral-200 rounded-lg bg-white px-3 py-2 text-center text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义敏感词 -->
    <div class="border border-neutral-200 rounded-2xl p-6 space-y-4 dark:border-neutral-800">
      <h3 class="font-medium">
        {{ t('settings.privacy.custom_words', '自定义敏感词') }}
      </h3>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.privacy.custom_words_desc', '添加额外的敏感词，检测到后会进行脱敏处理') }}
      </p>

      <!-- 添加新词 -->
      <div class="flex gap-2">
        <input
          v-model="newCustomWord"
          type="text"
          :placeholder="t('settings.privacy.add_word_placeholder', '输入敏感词...')"
          class="flex-1 border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          @keyup.enter="addCustomWord"
        >
        <Button
          variant="secondary"
          size="sm"
          :disabled="!newCustomWord.trim()"
          @click="addCustomWord"
        >
          <div class="i-lucide-plus mr-1 h-4 w-4" />
          {{ t('common.add', '添加') }}
        </Button>
      </div>

      <!-- 敏感词列表 -->
      <div v-if="privacyConfig.customSensitiveWords.length > 0" class="flex flex-wrap gap-2">
        <span
          v-for="word in privacyConfig.customSensitiveWords"
          :key="word"
          class="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-sm dark:bg-neutral-800"
        >
          {{ word }}
          <button
            class="text-neutral-400 transition-colors hover:text-red-500"
            @click="removeCustomWord(word)"
          >
            <div class="i-lucide-x h-3 w-3" />
          </button>
        </span>
      </div>

      <div v-else class="text-sm text-neutral-400 italic">
        {{ t('settings.privacy.no_custom_words', '暂无自定义敏感词') }}
      </div>
    </div>

    <!-- 测试工具 -->
    <div class="border border-neutral-200 rounded-2xl p-6 space-y-4 dark:border-neutral-800">
      <h3 class="font-medium">
        {{ t('settings.privacy.test_tool', '隐私保护测试') }}
      </h3>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ t('settings.privacy.test_tool_desc', '输入文本测试隐私保护效果') }}
      </p>

      <div class="space-y-3">
        <textarea
          v-model="testText"
          rows="3"
          :placeholder="t('settings.privacy.test_placeholder', '输入包含敏感信息的文本...')"
          class="w-full resize-none border border-neutral-200 rounded-lg bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
        />

        <Button
          variant="secondary"
          size="sm"
          :disabled="!testText.trim()"
          @click="testPrivacy"
        >
          <div class="i-lucide-play mr-1 h-4 w-4" />
          {{ t('settings.privacy.test', '测试') }}
        </Button>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="border-t border-neutral-200 pt-4 space-y-3 dark:border-neutral-800">
        <div>
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.privacy.test_result', '脱敏结果') }}
          </label>
          <div class="mt-1 rounded-lg bg-neutral-50 p-3 text-sm font-mono dark:bg-neutral-900">
            {{ testResult.sanitized }}
          </div>
        </div>

        <div v-if="testResult.detected.length > 0">
          <label class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.privacy.detected_items', '检测到的敏感信息') }}
          </label>
          <div class="mt-1 flex flex-wrap gap-2">
            <span
              v-for="(item, index) in testResult.detected"
              :key="index"
              class="rounded-lg bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600 dark:text-yellow-400"
            >
              {{ item.type }}: {{ item.value }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center justify-end gap-3 pt-4">
      <Button variant="ghost" @click="resetToDefault">
        {{ t('common.reset', '重置') }}
      </Button>
      <Button variant="primary" @click="saveConfig">
        <div class="i-lucide-save mr-2 h-4 w-4" />
        {{ t('common.save', '保存') }}
      </Button>
    </div>
  </div>
</template>
