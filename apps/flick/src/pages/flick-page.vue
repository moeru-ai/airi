<script setup lang="ts">
import type { DecisionOptionId, SlotId, SpinnerLocale } from '../utils/flick-engine'

import { useStorage } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import FlickStandIn from '../components/flick-stand-in.vue'

import { useHistory } from '../composables/useHistory'
import { useRitual } from '../composables/useRitual'
import { tts } from '../utils/vidu-service'

// Vidu API key (for TTS narration — text is per-decision and dynamic)
// NOTE: VITE_VIDU_API_KEY must be set in environment. Fallback removed to prevent key leakage.
const VIDU_API_KEY = import.meta.env.VITE_VIDU_API_KEY
if (!VIDU_API_KEY) {
  throw new Error('VITE_VIDU_API_KEY environment variable is required')
}

const copy = {
  en: {
    brand: 'Flick',
    tagline: 'Settle it.',
    inputLabel: 'What are you stuck on?',
    inputPlaceholder: 'Should I buy the camera this week? / Should I text them tonight?',
    inputCta: 'Begin',
    spinCta: 'Spin to decide',
    spinningCta: 'Spinning...',
    revealEyebrow: 'Landed',
    nextActionLabel: 'Your next move',
    newRitualCta: 'Start over',
    recentTitle: 'Recent',
    recentEmpty: 'Spin a few real questions and your history shows up here.',
    standInTitle: '',
    standInCaption: '',
    directionLabels: {
      do: 'Do',
      delay: 'Delay',
      skip: 'Skip',
    },
    optionLabels: {
      do: 'Move now',
      delay: 'Pause with intent',
      skip: 'Protect your attention',
    },
    slotTitle: 'Which arm landed?',
    slotPlaceholder: 'A, B, or C',
    slotConfirm: 'Confirm',
    aboutTitle: 'About this object',
    aboutLead: 'A premium three-arm EDC spinner paired with an AI decision ritual.',
    pillars: [
      { title: 'Fidget legitimacy', body: 'Satisfying to carry, turn, and leave on the desk -- without the app.' },
      { title: 'Ritual over productivity', body: 'The app makes hesitation smaller, not you smarter.' },
      { title: 'Two lanes, one object', body: 'For EDC players and overthinkers alike.' },
    ],
    hardwareCards: [
      { title: 'Silent spin', body: 'One-handed, low-noise.' },
      { title: 'Pocket & desk', body: 'Believable in both.' },
      { title: 'Three hidden states', body: 'Finishes hint at Do / Delay / Skip.' },
      { title: 'Giftable first box', body: 'Premium unboxing.' },
    ],
  },
  zh: {
    brand: 'Flick',
    tagline: '定下来。',
    inputLabel: '你现在卡住的是什么？',
    inputPlaceholder: '这周要不要买那台二手相机？ / 今晚要不要给她发消息？',
    inputCta: '开始',
    spinCta: '转',
    spinningCta: '转动中...',
    revealEyebrow: '落点',
    nextActionLabel: '下一步',
    newRitualCta: '再来一次',
    recentTitle: '最近',
    recentEmpty: '转过几次真实问题之后，记录会出现在这里。',
    standInTitle: '',
    standInCaption: '',
    directionLabels: {
      do: '做',
      delay: '缓',
      skip: '跳',
    },
    optionLabels: {
      do: '现在动',
      delay: '有意识地缓一下',
      skip: '把注意力收回来',
    },
    slotTitle: '哪一臂停的？',
    slotPlaceholder: 'A、B 或 C',
    slotConfirm: '确定',
    aboutTitle: '关于这个物件',
    aboutLead: '三臂 EDC 转盘 + AI 决策仪式。',
    pillars: [
      { title: '把玩合法性', body: '离开 App 也值得带着、转着、放在桌上。' },
      { title: '仪式不是效率', body: '把犹豫变小，不是把你变聪明。' },
      { title: '双人群同一物件', body: 'EDC 玩家和纠结党都合适。' },
    ],
    hardwareCards: [
      { title: '安静顺滑', body: '单手可玩，不吵。' },
      { title: '桌面与口袋', body: '两种场景都成立。' },
      { title: '中表达三状态', body: '材质暗示做 / 缓 / 不做。' },
      { title: '首盒可送人', body: '高级开箱体验。' },
    ],
  },
} as const

const quickPromptCopy = {
  en: {
    label: 'Or try one of these',
    items: [
      'Should I buy the limited-run keyboard kit this month?',
      'Should I send the first message after that event?',
      'Should I ship the small landing page this weekend?',
      'Should I skip tonight\'s dinner plan and protect my energy?',
    ],
  },
  zh: {
    label: '或者试试这些',
    items: [
      '这个月要不要买那套限量键盘套件？',
      '活动结束后要不要先发第一条消息？',
      '这个周末要不要把那个小页面发出去？',
      '今晚那顿饭局要不要不去了，把精力留给自己？',
    ],
  },
} as const

// Scroll-reveal: observe section refs and add .is-visible when they enter viewport
const sectionRefs = ref<HTMLElement[]>([])
onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -64px 0px' },
  )
  // Observe all sections after next tick so refs are populated
  nextTick(() => {
    sectionRefs.value.forEach((el) => {
      if (el)
        observer.observe(el)
    })
  })
})

const currentLocale = useStorage<SpinnerLocale>('flick:v1-locale', 'en')
const colorMode = useStorage<'dark' | 'light'>('flick:color-mode', 'dark')
const text = computed(() => copy[currentLocale.value])
const quickPrompts = computed(() => quickPromptCopy[currentLocale.value])
const { history: recentHistory, addEntry } = useHistory()

const question = ref('')
const ritual = useRitual({ locale: currentLocale, question })
const {
  analysis,
  spinning,
  slotPhase,
  revealedCard,
  spinNonce,
  cardsVisible,
  targetAngle,
  draft,
  canSpin,
  recommendedCard,
  directionCards,
  startPrototype: ritualStart,
  spinRitual: ritualSpin,
  selectSlot: ritualSelect,
  resetRitual: ritualReset,
  onSpinningComplete: ritualOnComplete,
  rebuildForLocale,
} = ritual

const showAbout = ref(false)

// Vidu dynamic media state
const cardVideoUrl = ref<string | null>(null)
const expansionVideoUrl = ref<string | null>(null)
const ttsAudioUrl = ref<string | null>(null)
const isGeneratingTts = ref(false)
const ttsAudio = ref<HTMLAudioElement | null>(null)

// TTS button playing state
const isTtsPlaying = computed(() => ttsAudio.value && ttsAudio.value.paused === false)

function setLocale(locale: SpinnerLocale) {
  currentLocale.value = locale
}

function toggleColorMode() {
  colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
}

function useQuickPrompt(prompt: string) {
  question.value = prompt
  ritualStart()
}

function handleSelectSlot(slot: SlotId) {
  if (!analysis.value)
    return
  const card = ritualSelect(slot)
  if (card && analysis.value) {
    addEntry({
      question: analysis.value.input_summary,
      locale: currentLocale.value,
      revealed: card,
      analysis: analysis.value,
    })
    generateViduMedia(card.id)
  }
}

// ─── Vidu: load static media assets when result is revealed ─────────────────

function getCardVideoUrl(optionId: DecisionOptionId, locale: string): string {
  return `/assets/card-${optionId}-${locale}.mp4`
}

function getExpansionVideoUrl(optionId: DecisionOptionId, locale: string): string {
  return `/assets/expand-${optionId}-${locale}.mp4`
}

async function generateViduMedia(optionId: DecisionOptionId) {
  const locale: 'zh' | 'en' = currentLocale.value === 'zh' ? 'zh' : 'en'
  if (!cardVideoUrl.value)
    cardVideoUrl.value = getCardVideoUrl(optionId, locale)
  if (!expansionVideoUrl.value)
    expansionVideoUrl.value = getExpansionVideoUrl(optionId, locale)
}

async function playTtsNarration() {
  if (!analysis.value || !revealedCard.value)
    return

  stopTts()

  const locale: 'zh' | 'en' = currentLocale.value === 'zh' ? 'zh' : 'en'
  const narrationText = [
    revealedCard.value.title,
    revealedCard.value.reason_short,
    revealedCard.value.next_action,
  ].filter(Boolean).join('. ')

  if (!narrationText)
    return

  isGeneratingTts.value = true
  try {
    const result = await tts(narrationText, VIDU_API_KEY, locale)
    ttsAudioUrl.value = result.audio_url
    const audio = document.createElement('audio') as HTMLAudioElement
    audio.src = result.audio_url
    ttsAudio.value = audio
    audio.onended = () => {
      // Reset to replay state
    }
    await audio.play()
  }
  catch (e) {
    console.warn('[Vidu] TTS failed:', e)
  }
  finally {
    isGeneratingTts.value = false
  }
}

function stopTts() {
  if (ttsAudio.value) {
    ttsAudio.value.pause()
    ttsAudio.value.currentTime = 0
    ttsAudio.value = null
  }
}

// Spin ritual with coordinated animation (page handles Vidu reset, composable handles state)
function handleSpinRitual() {
  if (!analysis.value || spinning.value)
    return

  // Reset Vidu media state for new reveal
  cardVideoUrl.value = null
  expansionVideoUrl.value = null
  ttsAudioUrl.value = null
  stopTts()

  ritualSpin()
}

// Handle spinning complete from FlickStandIn
function handleSpinningComplete() {
  ritualOnComplete()
}

watch(currentLocale, (locale, previousLocale) => {
  if (locale === previousLocale || !draft.value)
    return
  rebuildForLocale()
})

watch(question, (value, previousValue) => {
  if (value === previousValue || !draft.value)
    return
  draft.value = null
  ritual.resetResultState()
})
</script>

<template>
  <!-- Page root -->
  <div class="ps-page" :class="`ps-page--${colorMode}`" :lang="currentLocale === 'zh' ? 'zh-Hans' : 'en'">
    <!-- Ambient orbs (decorative) -->
    <div class="ambient ambient-a" :class="{ 'ambient-b--relief': slotPhase === 'revealed' }" />
    <div class="ambient ambient-b" />
    <div class="ambient ambient-c" />

    <!-- Nav: brand + locale + color mode -->
    <nav class="ps-nav">
      <div class="ps-nav-brand">
        <span class="brand-mark" />
        <strong>{{ text.brand }}</strong>
      </div>
      <span class="ps-nav-tagline">{{ text.tagline }}</span>
      <div class="ps-nav-actions">
        <button class="icon-btn" :title="colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleColorMode">
          <svg v-if="colorMode === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.5" />
            <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.752-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button class="locale-pill" :data-active="currentLocale === 'zh'" :aria-pressed="currentLocale === 'zh'" @click="setLocale('zh')">
          中文
        </button>
        <button class="locale-pill" :data-active="currentLocale === 'en'" :aria-pressed="currentLocale === 'en'" @click="setLocale('en')">
          EN
        </button>
      </div>
    </nav>

    <!-- ================================================
         MAIN: Ritual zone (full viewport merged hero + prototype)
    ================================================ -->
    <main :ref="(el) => { if (el) sectionRefs[0] = el as HTMLElement }" class="ritual-zone">
      <div class="ritual-layout">
        <h1 class="sr-only">
          {{ currentLocale === 'en' ? 'Flick Decision Ritual' : 'Flick 决策仪式' }}
        </h1>
        <!-- Left: Spinner (sticky on desktop) -->
        <div class="ritual-spinner">
          <FlickStandIn
            :selected-option="revealedCard?.id ?? null"
            :spin-nonce="spinNonce"
            :title="text.standInTitle"
            :caption="text.standInCaption"
            :spinning="spinning"
            :target-angle="targetAngle"
            @spinning-complete="handleSpinningComplete"
          />

          <!-- Direction cards panel (appears after analysis) -->
          <article v-if="analysis && slotPhase === 'idle'" class="status-card reveal" :class="{ 'is-visible': cardsVisible }">
            <span class="section-overline">{{ currentLocale === 'en' ? 'AI read' : 'AI 判读' }}</span>
            <div class="direction-cards">
              <div
                v-for="(card, index) in directionCards"
                :key="card.slot"
                class="direction-card"
                :class="{
                  'is-recommended': card.slot === recommendedCard?.slot,
                  'card-visible': cardsVisible,
                }"
                :style="{ '--card-delay': `${index * 80}ms` }"
              >
                <span class="direction-slot">{{ card.slot }}</span>
                <strong class="direction-title">{{ card.title }}</strong>
                <p class="direction-preview">
                  {{ card.reason_short }}
                </p>
                <div class="direction-confidence">
                  <span class="direction-label">{{ text.directionLabels[card.id] }}</span>
                  <span class="direction-conf">{{ Math.round(card.confidence * 100) }}%</span>
                </div>
              </div>
            </div>
            <button class="ps-btn-primary full-width" :disabled="!canSpin || spinning" @click="handleSpinRitual">
              {{ spinning ? text.spinningCta : text.spinCta }}
            </button>
          </article>

          <!-- Slot selection (after spinner lands) -->
          <article v-if="slotPhase === 'slot-selecting'" class="status-card slot-select-card reveal is-visible">
            <span class="section-overline">{{ text.slotTitle }}</span>
            <div class="slot-buttons">
              <button
                v-for="card in directionCards"
                :key="card.slot"
                class="slot-btn"
                @click="handleSelectSlot(card.slot)"
              >
                <span class="slot-btn-letter">{{ card.slot }}</span>
                <span class="slot-btn-label">{{ text.directionLabels[card.id] }}</span>
              </button>
            </div>
          </article>

          <!-- Reveal panel (after slot is selected) -->
          <article v-if="slotPhase === 'revealed' && revealedCard" class="status-card reveal-card reveal is-visible">
            <!-- Vidu: card background video -->
            <video
              v-if="cardVideoUrl"
              class="card-video-bg"
              :src="cardVideoUrl"
              autoplay
              muted
              loop
              playsinline
            />

            <span class="section-overline reveal-content" style="--reveal-delay: 0ms">{{ text.revealEyebrow }}</span>
            <div class="reveal-pill reveal-content" style="--reveal-delay: 200ms">
              <strong>{{ text.optionLabels[revealedCard.id] }}</strong>
              <span>{{ revealedCard.slot }}</span>
            </div>

            <!-- Vidu: expansion visual -->
            <div v-if="expansionVideoUrl" class="expansion-video-wrap reveal-content" style="--reveal-delay: 300ms">
              <video
                class="expansion-video"
                :src="expansionVideoUrl"
                autoplay
                muted
                loop
                playsinline
              />
            </div>

            <div class="reveal-title reveal-content" style="--reveal-delay: 320ms">
              {{ revealedCard.title }}
            </div>
            <p class="reveal-reason reveal-content" style="--reveal-delay: 400ms">
              {{ revealedCard.reason_short }}
            </p>

            <div class="next-action-card reveal-content" style="--reveal-delay: 520ms">
              <span>{{ text.nextActionLabel }}</span>
              <p>{{ revealedCard.next_action }}</p>
            </div>

            <!-- Vidu: TTS narration -->
            <button
              class="ps-btn-narrate full-width reveal-content"
              style="--reveal-delay: 700ms"
              :class="{
                'is-generating': isGeneratingTts,
                'is-playing': isTtsPlaying,
              }"
              :disabled="isGeneratingTts"
              @click="playTtsNarration"
            >
              <!-- Generating state -->
              <template v-if="isGeneratingTts">
                <span class="generating-spinner" />
                <span>Generating voice...</span>
              </template>

              <!-- Playing state -->
              <template v-else-if="isTtsPlaying">
                <div class="sound-wave">
                  <span class="sound-wave-bar" />
                  <span class="sound-wave-bar" />
                  <span class="sound-wave-bar" />
                  <span class="sound-wave-bar" />
                  <span class="sound-wave-bar" />
                </div>
                <span>Playing...</span>
              </template>

              <!-- Completed / Replay state -->
              <template v-else-if="ttsAudioUrl">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Replay narration</span>
              </template>

              <!-- Idle / Ready state -->
              <template v-else>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Narrate result</span>
              </template>
            </button>

            <button class="ps-btn-ghost full-width reveal-content" style="--reveal-delay: 800ms" @click="ritualReset">
              {{ text.newRitualCta }}
            </button>
          </article>
        </div>

        <!-- Right: Ritual flow (progressive disclosure) -->
        <div class="ritual-flow">
          <!-- Question -->
          <label class="ps-question-field reveal">
            <span>{{ text.inputLabel }}</span>
            <textarea
              id="ritual-question"
              v-model="question"
              :placeholder="text.inputPlaceholder"
              rows="3"
            />
          </label>

          <!-- Quick prompts -->
          <div class="ps-quick-prompts reveal reveal-delay-1">
            <span class="ps-overline">{{ quickPrompts.label }}</span>
            <div class="ps-quick-prompt-list">
              <button
                v-for="prompt in quickPrompts.items"
                :key="prompt"
                class="ps-quick-prompt"
                @click="useQuickPrompt(prompt)"
              >
                {{ prompt }}
              </button>
            </div>
          </div>

          <!-- Begin button -->
          <div class="ps-prototype-actions reveal reveal-delay-2">
            <button class="ps-btn-primary full-width" :disabled="!question.trim()" @click="ritualStart">
              {{ text.inputCta }}
            </button>
          </div>

          <!-- Blocked card -->
          <article v-if="draft && draft.risk_flag !== 'none'" class="blocked-card reveal">
            <span>{{ currentLocale === 'en' ? 'Not for this one' : '这个不适合' }}</span>
            <h3>{{ draft.blocked_title }}</h3>
            <p>{{ draft.blocked_body }}</p>
          </article>

          <!-- Recent history (review cards) -->
          <div v-if="recentHistory.length || (!draft && !analysis)" class="recent-section reveal">
            <span class="ps-overline">{{ text.recentTitle }}</span>
            <p v-if="!recentHistory.length" class="recent-empty">
              {{ text.recentEmpty }}
            </p>
            <div v-else class="recent-list">
              <article v-for="entry in recentHistory" :key="entry.id" class="review-card">
                <div class="review-header">
                  <span class="review-slot">{{ entry.revealed.slot }}</span>
                  <span class="review-option">{{ text.optionLabels[entry.revealed.id] }}</span>
                  <span class="review-conf">{{ Math.round(entry.revealed.confidence * 100) }}%</span>
                </div>
                <p class="review-question">
                  {{ entry.question }}
                </p>
                <p class="review-action">
                  {{ entry.revealed.next_action }}
                </p>
              </article>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- ================================================
         About section (collapsible, below the fold)
    ================================================ -->
    <section :ref="(el) => { if (el) sectionRefs[1] = el as HTMLElement }" class="about-section">
      <button class="about-toggle" :aria-expanded="showAbout" aria-controls="about-content" @click="showAbout = !showAbout">
        <span>{{ text.aboutTitle }}</span>
        <svg class="about-chevron" :class="{ 'about-chevron--open': showAbout }" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div id="about-content" class="about-collapse" :class="{ 'about-collapse--open': showAbout }">
        <div class="about-content">
          <p class="about-lead">
            {{ text.aboutLead }}
          </p>
          <div class="about-grid">
            <article v-for="pillar in text.pillars" :key="pillar.title" class="about-pillar">
              <h3>{{ pillar.title }}</h3>
              <p>{{ pillar.body }}</p>
            </article>
          </div>
          <div class="hardware-grid">
            <div v-for="card in text.hardwareCards" :key="card.title" class="hardware-card">
              <h4>{{ card.title }}</h4>
              <p>{{ card.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================================================
         Footer (minimal)
    ================================================ -->
    <footer class="ps-footer">
      <div class="ps-footer-inner">
        <div class="ps-footer-brand">
          <span class="brand-mark" />
          <span>{{ text.brand }}</span>
        </div>
        <div class="ps-footer-locale">
          <button :data-active="currentLocale === 'zh'" @click="setLocale('zh')">
            中文
          </button>
          <span>·</span>
          <button :data-active="currentLocale === 'en'" @click="setLocale('en')">
            EN
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ================================================
   ROOT + CSS VARIABLES (dark default)
================================================ */
.ps-page {
  /* Type scale (1.25 ratio): 0.7 · 0.8 · 1.0 · 1.125 · 1.35 · 1.6 */
  --text-xs: 0.7rem;
  --text-sm: 0.8rem;
  --text-base: 1rem;
  --text-md: 1.125rem;
  --text-lg: 1.35rem;
  --text-xl: 1.6rem;

  /* Font stacks */
  --font-serif: 'EB Garamond', 'Iowan Old Style', 'Palatino Linotype', 'Songti SC', serif;
  --font-sans: Manrope, 'Avenir Next', 'SF Pro Display', 'PingFang SC', sans-serif;
  --font-label: 'IBM Plex Sans', 'SF Mono', 'PingFang SC', sans-serif;

  /* ─── Motion Tokens: Duration ──────────────────────── */
  --duration-micro: 80ms;
  --duration-micro-fast: 50ms;
  --duration-short: 200ms;
  --duration-short-snap: 150ms;
  --duration-medium: 320ms;
  --duration-medium-settle: 280ms;
  --duration-long: 480ms;
  --duration-reveal: 560ms;
  --duration-spin-total: 1800ms;
  --duration-spin-decelerate: 1400ms;
  --duration-land-impact: 200ms;

  /* ─── Motion Tokens: Easing ──────────────────────── */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-cubic: cubic-bezier(0.33, 1, 0.68, 1);
  --ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-cubic: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-spin-decelerate: cubic-bezier(0.12, 0.92, 0.04, 1.02);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring-tight: cubic-bezier(0.34, 1.28, 0.64, 1);
  --ease-settle: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-settle-slow: cubic-bezier(0.25, 0.94, 0.26, 1);
  --ease-linear: linear;
}

/* ─── DARK MODE (default) ─────────────────────────── */
.ps-page--dark {
  --page-bg: #0A0D10;
  --bg-main: #0D1117;
  --surface: rgb(14 20 30 / 0.82);
  --surface-strong: rgb(10 14 22 / 0.94);
  --line: rgb(255 255 255 / 0.08);
  --line-strong: rgb(255 255 255 / 0.14);
  --text-main: rgb(237 232 225 / 0.96);
  --text-soft: rgb(190 185 178 / 0.78);
  --accent-bronze: #9C7447;
  --accent-bronze-light: #C49A6C;
  --accent-gunmetal: #5F6870;
  --accent-olive: #56604F;
  --glass-bg: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
  --glass-border: rgb(255 255 255 / 0.08);
  --glass-highlight: inset 0 1px 0 rgb(255 255 255 / 0.04);
  --nav-bg: rgb(10 13 16 / 0.72);
  --card-bg-deep: linear-gradient(180deg, rgb(9 15 24 / 0.86), rgb(9 15 24 / 0.74));
  --ambient-a: #56604F;
  --ambient-b: #9C7447;
  --ambient-c: #5F6870;
  --relief-opacity-base: 0.18;
  --relief-opacity-peak: 0.24;

  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 12%, rgb(86 76 58 / 0.15), transparent 28%),
    radial-gradient(circle at 78% 14%, rgb(95 104 112 / 0.12), transparent 26%),
    linear-gradient(180deg, #0D1117, #0A0D10 55%, #080B0F);
  color: var(--text-main);
  font-family: var(--font-sans);
  position: relative;
  overflow-x: hidden;
  isolation: isolate;
  scroll-behavior: smooth;
  font-feature-settings: 'liga' 1, 'kern' 1;
}

/* ─── LIGHT MODE ──────────────────────────────────── */
.ps-page--light {
  --page-bg: #F7F3EE;
  --bg-main: #F2EEE8;
  --surface: rgb(255 250 243 / 0.82);
  --surface-strong: rgb(248 243 236 / 0.94);
  --line: rgb(180 160 130 / 0.14);
  --line-strong: rgb(180 160 130 / 0.28);
  --text-main: rgb(38 30 22 / 0.94);
  --text-soft: rgb(90 75 58 / 0.78);
  --accent-bronze: #8A6238;
  --accent-bronze-light: #A87B4A;
  --accent-gunmetal: #6E7A82;
  --accent-olive: #5E6B52;
  --glass-bg: linear-gradient(180deg, rgb(255 250 243 / 0.7), rgb(255 250 243 / 0.4));
  --glass-border: rgb(180 160 130 / 0.22);
  --glass-highlight: inset 0 1px 0 rgb(255 255 255 / 0.8);
  --nav-bg: rgb(247 243 238 / 0.82);
  --card-bg-deep: linear-gradient(180deg, rgb(255 250 243 / 0.9), rgb(255 250 243 / 0.75));
  --ambient-a: rgb(120 100 75);
  --ambient-b: rgb(160 120 80);
  --ambient-c: rgb(100 110 95);
  --relief-opacity-base: 0.12;
  --relief-opacity-peak: 0.16;
  --landing-glow: rgba(138, 98, 56, 0.3);

  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 12%, rgb(200 175 140 / 0.1), transparent 28%),
    radial-gradient(circle at 78% 14%, rgb(160 150 130 / 0.08), transparent 26%),
    linear-gradient(180deg, #F2EEE8, #F7F3EE 55%, #F0EBE4);
  color: var(--text-main);
  font-family: var(--font-sans);
  position: relative;
  overflow-x: hidden;
  isolation: isolate;
  scroll-behavior: smooth;
  font-feature-settings: 'liga' 1, 'kern' 1;
}

/* Page background uses page-bg for direct assignment */
.ps-page {
  background: var(--bg-main);
}

.ps-page::before,
.ps-page::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}

.ps-page--dark::before {
  background:
    radial-gradient(circle at 22% 18%, rgb(156 116 71 / 0.04), transparent 24%),
    radial-gradient(circle at 80% 20%, rgb(95 104 112 / 0.04), transparent 22%),
    repeating-linear-gradient(90deg, rgb(255 255 255 / 0.015) 0 1px, transparent 1px 120px);
  opacity: 0.8;
}

.ps-page--dark::after {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.02), transparent 12%),
    linear-gradient(90deg, transparent, rgb(255 255 255 / 0.02), transparent);
  mix-blend-mode: soft-light;
}

.ps-page--light::before {
  background:
    radial-gradient(circle at 22% 18%, rgb(180 155 110 / 0.06), transparent 24%),
    radial-gradient(circle at 80% 20%, rgb(140 150 135 / 0.05), transparent 22%),
    repeating-linear-gradient(90deg, rgb(180 160 130 / 0.03) 0 1px, transparent 1px 120px);
  opacity: 0.6;
}

.ps-page--light::after {
  background:
    linear-gradient(180deg, rgb(255 250 243 / 0.08), transparent 12%),
    linear-gradient(90deg, transparent, rgb(255 250 243 / 0.04), transparent);
  mix-blend-mode: multiply;
}

/* ================================================
   AMBIENT ORBS + RELIEF ANIMATIONS
================================================ */
.ambient {
  position: fixed;
  inset: auto;
  width: 26rem;
  height: 26rem;
  filter: blur(80px);
  opacity: 0.18;
  pointer-events: none;
}

.ambient-a { top: 10%; left: -8rem; background: var(--ambient-a, #56604F); }
.ambient-b { top: 36%; right: -10rem; background: var(--ambient-b, #9C7447); }
.ambient-c { bottom: -10rem; left: 30%; background: var(--ambient-c, #5F6870); }

/* Relief: Ambient orb gentle drift */
.ambient-b {
  animation: relief-orb-drift 8s ease-in-out infinite;
  animation-delay: 1.5s;
}

.ambient-b--relief {
  animation: relief-orb-drift 8s ease-in-out infinite;
  animation-delay: 0s;
}

@keyframes relief-orb-drift {
  0%, 100% {
    transform: translate(0, 0) scale(1);
    opacity: var(--relief-opacity-base);
  }
  50% {
    transform: translate(4px, -6px) scale(1.05);
    opacity: var(--relief-opacity-peak);
  }
}

/* ================================================
   BRAND MARK (shared)
================================================ */
.brand-mark {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--accent-bronze);
  box-shadow: 0 0 0 6px rgb(255 255 255 / 0.05);
  flex-shrink: 0;
}

/* ================================================
   APPLE-STYLE SCROLL REVEAL ANIMATION
================================================ */
.reveal {
  opacity: 0;
  transform: translateY(1.5rem);
  transition:
    opacity 0.78s var(--ease-out-expo),
    transform 0.78s var(--ease-out-expo);
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.reveal-delay-1 { transition-delay: 0.08s; }
.reveal-delay-2 { transition-delay: 0.16s; }
.reveal-delay-3 { transition-delay: 0.24s; }
.reveal-delay-4 { transition-delay: 0.5s; }
.reveal-delay-5 { transition-delay: 0.65s; }

/* ================================================
   NAV (simplified: brand + tagline + locale)
================================================ */
.ps-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1.4rem;
  backdrop-filter: blur(24px) saturate(1.6);
  background: var(--nav-bg);
  border-bottom: 1px solid var(--glass-border);
}

.ps-nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  color: inherit;
  text-decoration: none;
  font-family: var(--font-serif);
  font-size: var(--text-md);
  letter-spacing: 0.01em;
}

.ps-nav-tagline {
  color: var(--text-soft);
  font-size: var(--text-sm);
  letter-spacing: 0.02em;
}

.ps-nav-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

/* ================================================
   RITUAL ZONE (full viewport)
================================================ */
.ritual-zone {
  min-height: 100svh;
  display: flex;
  align-items: start;
  padding: clamp(2rem, 4vw, 4.5rem) clamp(1rem, 2vw, 1.4rem) 5rem;
}

.ritual-layout {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  display: grid;
  grid-template-columns: 5fr 7fr;
  gap: clamp(2rem, 4vw, 4rem);
  align-items: start;
}

/* Left column: spinner + analysis/reveal panels */
.ritual-spinner {
  position: sticky;
  top: 5rem;
  display: grid;
  gap: 1.25rem;
}

/* Right column: sequential form flow — varied rhythm */
.ritual-flow {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Phase 1: Setup (question + prompts + begin) — tight grouping */
.ps-question-field {
  display: grid;
  gap: 0.55rem;
  margin-bottom: 1.25rem;
}

.ps-quick-prompts {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.ps-prototype-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-bottom: 0;
}

/* History — separated from setup */
.recent-section {
  margin-top: 2.5rem;
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
}
.ps-overline {
  display: block;
  font-size: var(--text-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(208 220 234 / 0.6);
  margin-bottom: 0.75rem;
  font-family: var(--font-label);
}

.section-overline {
  font-size: var(--text-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(208 220 234 / 0.65);
  font-family: var(--font-label);
}

/* ================================================
   QUESTION FIELD
================================================ */

.ps-question-field span {
  font-weight: 700;
  font-size: var(--text-lg);
  font-family: var(--font-serif);
}

.ps-question-field textarea {
  width: 100%;
  resize: vertical;
  min-height: 7rem;
  border-radius: 1.25rem;
  border: 1px solid rgb(255 255 255 / 0.08);
  background: linear-gradient(180deg, rgb(10 13 16 / 0.84), rgb(10 13 16 / 0.72));
  color: var(--text-main);
  padding: 1rem 1.1rem;
  font: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.ps-question-field textarea::placeholder {
  color: rgb(214 224 235 / 0.4);
}

.ps-question-field textarea:focus {
  outline: none;
  border-color: var(--accent-bronze);
  box-shadow: 0 0 0 3px rgb(156 116 71 / 0.12);
}

/* ================================================
   QUICK PROMPTS
================================================ */

.ps-quick-prompt-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.ps-quick-prompt {
  border-radius: 1.1rem;
  border: 1px solid rgb(255 255 255 / 0.07);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.04), rgb(255 255 255 / 0.02));
  color: var(--text-soft);
  padding: 0.85rem 1rem;
  text-align: left;
  font: inherit;
  font-size: var(--text-sm);
  line-height: 1.4;
  cursor: pointer;
  box-shadow: var(--glass-highlight);
  transition: color 0.24s ease, border-color 0.24s ease, transform 0.24s ease;
}

.ps-quick-prompt:hover {
  color: var(--text-main);
  border-color: rgb(255 255 255 / 0.16);
  transform: translateY(-2px);
}

/* ================================================
   PROTOTYPE ACTIONS
================================================ */

/* ================================================
   BLOCKED CARD
================================================ */
.blocked-card {
  padding: 1.25rem;
  border-radius: 1.35rem;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
}

.blocked-card p,
.status-card > p,
.next-action-card p {
  color: var(--text-soft);
  line-height: 1.6;
  margin: 0;
}

.blocked-card h3,
.status-card h3 {
  font-size: var(--text-md);
  margin: 0 0 0.35rem;
  font-family: var(--font-serif);
  font-weight: 600;
}

.blocked-card span {
  display: block;
  font-size: var(--text-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(207 217 228 / 0.7);
  margin-bottom: 0.5rem;
}

.blocked-card h3 {
  font-size: var(--text-md);
  margin: 0 0 0.4rem;
  font-family: var(--font-serif);
}

/* ================================================
   STATUS CARD (analysis + reveal)
================================================ */
.status-card {
  padding: 1.5rem;
  border-radius: 1.45rem;
  border: 1px solid var(--line);
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  box-shadow: var(--glass-highlight);
  display: grid;
  gap: 1rem;
  position: relative;
}

.status-card h3 {
  font-size: var(--text-md);
  margin: 0;
  font-family: var(--font-serif);
}

/* ================================================
   DIRECTION CARDS (AI-generated 3 options)
================================================ */
.direction-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.direction-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
  border-radius: 1.2rem;
  border: 1px solid rgb(255 255 255 / 0.07);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.04), rgb(255 255 255 / 0.02));
  text-align: left;
  /* Entrance animation: staggered rise from bottom */
  opacity: 0;
  transform: translateY(80px) scale(0.94);
  transition:
    opacity var(--duration-medium) var(--ease-out-expo),
    transform var(--duration-medium) var(--ease-out-expo);
  transition-delay: var(--card-delay, 0ms);
  will-change: transform, opacity;
}

.direction-card.card-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  /* Subtle spring settle after arrival */
  animation: card-arrive 400ms var(--ease-spring) forwards;
  animation-delay: var(--card-delay, 0ms);
}

@keyframes card-arrive {
  0% {
    opacity: 0;
    transform: translateY(80px) scale(0.94);
  }
  60% {
    opacity: 0.9;
    transform: translateY(-5px) scale(1.01);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.direction-card.is-recommended {
  border-color: rgb(156 116 71 / 0.5);
  background: linear-gradient(180deg, rgb(156 116 71 / 0.08), rgb(156 116 71 / 0.04));
}

.direction-slot {
  font-family: var(--font-label);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  color: var(--accent-bronze);
  text-transform: uppercase;
}

.direction-title {
  font-family: var(--font-serif);
  font-size: var(--text-base);
  color: var(--text-main);
  line-height: 1.3;
}

.direction-preview {
  font-size: var(--text-xs);
  color: var(--text-soft);
  line-height: 1.5;
  margin: 0;
}

.direction-confidence {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}

.direction-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-soft);
}

.direction-conf {
  font-size: var(--text-xs);
  font-family: var(--font-label);
  color: var(--accent-bronze);
}

/* ================================================
   SLOT SELECTION
================================================ */
.slot-select-card {
  text-align: center;
}

.slot-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.slot-btn {
  display: grid;
  gap: 0.3rem;
  padding: 1.25rem 0.5rem;
  border-radius: 1.2rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
  color: var(--text-main);
  cursor: pointer;
  font: inherit;
  transition: border-color 0.24s ease, background 0.24s ease, transform 0.24s ease;
}

.slot-btn:hover {
  border-color: var(--accent-bronze);
  background: linear-gradient(180deg, rgb(156 116 71 / 0.12), rgb(156 116 71 / 0.06));
  transform: translateY(-2px);
}

.slot-btn-letter {
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--accent-bronze);
}

.slot-btn-label {
  font-size: var(--text-xs);
  color: var(--text-soft);
}

/* ================================================
   REVEAL CARD CONTENT
================================================ */
.reveal-title {
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-main);
  line-height: 1.3;
}

.reveal-reason {
  color: var(--text-soft);
  font-size: var(--text-sm);
  line-height: 1.6;
  margin: 0;
}

/* ================================================
   NEXT ACTION + REVEAL PILL
================================================ */
.next-action-card {
  padding: 1rem;
  border-radius: 1rem;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.02));
  border: 1px solid rgb(255 255 255 / 0.06);
  border-left: 2px solid var(--accent-bronze);
  border-radius: 0.5rem;
}

.reveal-pill strong {
  font-size: var(--text-lg);
  font-family: var(--font-serif);
  display: block;
  margin-bottom: 0.25rem;
}

.next-action-card span {
  display: block;
  font-size: var(--text-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(207 217 228 / 0.7);
  margin-bottom: 0.4rem;
}

.next-action-card p {
  font-size: var(--text-base);
  margin: 0;
}

/* ─── Reveal Card ────────────────────────────────────── */
.reveal-card {
  background:
    radial-gradient(circle at 25% 10%, rgb(156 116 71 / 0.12), transparent 25%),
    radial-gradient(circle at 100% 100%, rgb(86 96 79 / 0.06), transparent 30%),
    linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
  overflow: hidden;
  position: relative;
}

.card-video-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
  /* Video fade in */
  transition: opacity 400ms var(--ease-settle);
  transition-delay: 100ms;
}

.card-video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: var(--text-xs);
  color: rgb(208 220 234 / 0.5);
  background: rgb(10 13 16 / 0.6);
  border-radius: inherit;
  z-index: 0;
}

.expansion-video-wrap {
  position: relative;
  border-radius: 1rem;
  overflow: hidden;
  background: rgb(10 13 16 / 0.6);
}

.expansion-video {
  width: 100%;
  display: block;
  border-radius: 1rem;
}

.video-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.5rem;
  font-size: var(--text-xs);
  color: rgb(208 220 234 / 0.5);
}

.video-loading-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-bronze);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* ─── Reveal Content Staggered Animation ─────────────── */
.reveal-content {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity var(--duration-medium) var(--ease-out-expo),
    transform var(--duration-medium) var(--ease-out-expo);
  transition-delay: var(--reveal-delay, 0ms);
}

.reveal-card.is-visible .reveal-content {
  opacity: 1;
  transform: translateY(0);
}

/* ─── Reveal Pill ────────────────────────────────────── */
.reveal-pill {
  opacity: 0;
  transform: translateY(-12px) scale(0.95);
  transition:
    opacity 280ms var(--ease-out-expo),
    transform 280ms var(--ease-spring);
  transition-delay: var(--reveal-delay, 200ms);
}

.reveal-card.is-visible .reveal-pill {
  opacity: 1;
  transform: translateY(0) scale(1);
  animation: pill-land 600ms var(--ease-spring) forwards;
  animation-delay: 200ms;
}

@keyframes pill-land {
  0% { transform: translateY(-12px) scale(0.95); }
  50% { transform: translateY(2px) scale(1.01); }
  100% { transform: translateY(0) scale(1); }
}

/* Bronze border pulse on pill */
@keyframes bronze-pulse {
  0% { box-shadow: 0 0 0 0 rgba(156, 116, 71, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(156, 116, 71, 0); }
  100% { box-shadow: 0 0 0 0 rgba(156, 116, 71, 0); }
}

.reveal-pill {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.06);
  border: 1px solid rgb(255 255 255 / 0.08);
  font-size: var(--text-sm);
}

.reveal-pill span {
  color: var(--text-soft);
}

/* ─── Next Action Card ───────────────────────────────── */
.next-action-card {
  opacity: 0;
  transform: translateX(-20px);
  transition:
    opacity 300ms var(--ease-settle),
    transform 300ms var(--ease-settle);
  transition-delay: var(--reveal-delay, 520ms);
}

.next-action-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-bronze);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 300ms var(--ease-spring);
  transition-delay: var(--reveal-delay, 520ms);
}

.reveal-card.is-visible .next-action-card {
  opacity: 1;
  transform: translateX(0);
}

.reveal-card.is-visible .next-action-card::before {
  transform: scaleY(1);
}

/* ─── Relief Micro-Animation for Content ─────────────── */
.reveal-card.is-visible .reveal-title {
  animation: content-relief-settle 1.5s var(--ease-settle) forwards;
  animation-delay: 1s;
}

.reveal-card.is-visible .reveal-reason {
  animation: content-relief-settle 1.5s var(--ease-settle) forwards;
  animation-delay: 1.15s;
}

@keyframes content-relief-settle {
  0% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-2px);
  }
  100% {
    transform: translateY(0);
  }
}

/* ================================================
   TTS NARRATE BUTTON
================================================ */
.ps-btn-narrate {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 999px;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  font-size: var(--text-sm);
  border: 1px solid rgb(156 116 71 / 0.4);
  background: rgb(156 116 71 / 0.08);
  color: var(--accent-bronze-light);
  cursor: pointer;
  font: inherit;
  /* Entrance animation */
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity var(--duration-medium) var(--ease-out-expo),
    transform var(--duration-medium) var(--ease-spring),
    border-color 0.24s ease,
    background 0.24s ease;
  transition-delay: var(--reveal-delay, 700ms);
}

.reveal-card.is-visible .ps-btn-narrate {
  opacity: 1;
  transform: scale(1);
}

/* Idle state: subtle pulse */
.ps-btn-narrate:not(:disabled):not(.is-generating):not(.is-playing) {
  animation: narrate-idle-pulse 2.5s ease-in-out infinite;
  animation-delay: 900ms;
}

@keyframes narrate-idle-pulse {
  0%, 100% {
    border-color: rgba(156, 116, 71, 0.4);
    box-shadow: 0 0 0 0 rgba(156, 116, 71, 0);
  }
  50% {
    border-color: rgba(156, 116, 71, 0.6);
    box-shadow: 0 0 0 4px rgba(156, 116, 71, 0.12);
  }
}

/* Generating state */
.ps-btn-narrate.is-generating {
  animation: none;
  opacity: 0.7;
}

.generating-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: var(--accent-bronze);
  border-radius: 50%;
  animation: spin-generating 0.8s linear infinite;
}

@keyframes spin-generating {
  to { transform: rotate(360deg); }
}

/* Playing state */
.ps-btn-narrate.is-playing {
  animation: none;
  border-color: rgba(156, 116 71 / 0.7);
  background: rgba(156, 116 71 / 0.12);
}

/* Sound wave visualization */
.sound-wave {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
}

.sound-wave-bar {
  width: 3px;
  background: var(--accent-bronze);
  border-radius: 2px;
  animation: wave-bar 0.6s ease-in-out infinite;
}

.sound-wave-bar:nth-child(1) {
  animation-delay: 0ms;
  height: 6px;
}
.sound-wave-bar:nth-child(2) {
  animation-delay: 80ms;
  height: 12px;
}
.sound-wave-bar:nth-child(3) {
  animation-delay: 160ms;
  height: 8px;
}
.sound-wave-bar:nth-child(4) {
  animation-delay: 240ms;
  height: 14px;
}
.sound-wave-bar:nth-child(5) {
  animation-delay: 320ms;
  height: 10px;
}

@keyframes wave-bar {
  0%, 100% {
    transform: scaleY(0.4);
    opacity: 0.6;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* Hover */
.ps-btn-narrate:hover:not(:disabled) {
  transform: scale(1.03);
  border-color: rgba(156, 116, 71, 0.8);
  background: rgba(156, 116, 71, 0.16);
  transition: all 200ms var(--ease-out-expo);
}

/* Active press */
.ps-btn-narrate:active:not(:disabled) {
  transform: scale(0.97);
  transition: transform 50ms ease;
}

.ps-btn-narrate:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ================================================
   RECENT HISTORY (review cards)
================================================ */

.recent-empty {
  color: var(--text-soft);
  font-size: var(--text-sm);
  line-height: 1.6;
  margin: 0;
}

.recent-list {
  display: grid;
  gap: 0.75rem;
}

.review-card {
  padding: 1rem 1.1rem;
  border-radius: 1.2rem;
  border: 1px solid var(--line);
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  display: grid;
  gap: 0.4rem;
}

.review-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.review-slot {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--accent-bronze);
  min-width: 1.2rem;
}

.review-option {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-main);
  flex: 1;
}

.review-conf {
  font-size: var(--text-xs);
  font-family: var(--font-label);
  color: var(--accent-bronze);
  opacity: 0.8;
}

.review-question {
  font-size: var(--text-xs);
  color: var(--text-soft);
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-action {
  font-size: var(--text-xs);
  color: var(--text-soft);
  line-height: 1.5;
  margin: 0;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ================================================
   ABOUT SECTION (collapsible)
================================================ */
.about-section {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.4rem 2rem;
}

.about-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 1.25rem 0;
  background: none;
  border: none;
  border-top: 1px solid var(--glass-border);
  color: var(--text-main);
  font: inherit;
  font-size: var(--text-md);
  font-family: var(--font-serif);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease;
}

.about-toggle:hover {
  color: var(--accent-bronze-light);
}

.about-chevron {
  flex-shrink: 0;
  transition: transform 0.28s ease;
}

.about-chevron--open {
  transform: rotate(180deg);
}

.about-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.38s var(--ease-settle);
}

.about-collapse--open {
  grid-template-rows: 1fr;
}

.about-content {
  overflow: hidden;
  padding-bottom: 1rem;
}

.about-lead {
  font-size: var(--text-md);
  color: var(--text-soft);
  line-height: 1.6;
  margin: 0 0 2rem;
  max-width: 38rem;
}

.about-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}

.about-grid article:last-child {
  grid-column: 1 / -1;
}

.about-pillar {
  padding: 1.5rem 1.25rem;
  border-radius: 1.35rem;
  border: 1px solid var(--glass-border);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.02));
  box-shadow: var(--glass-highlight);
}

.about-pillar h3 {
  font-size: var(--text-md);
  margin: 0 0 0.5rem;
  font-family: var(--font-serif);
  font-weight: 600;
}

.about-pillar p {
  font-size: var(--text-sm);
  color: var(--text-soft);
  line-height: 1.6;
  margin: 0;
}

.hardware-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1rem;
}

.hardware-card {
  padding: 1.1rem 1rem;
  border-radius: 1.1rem;
  border: 1px solid rgb(255 255 255 / 0.06);
  background: rgb(255 255 255 / 0.025);
}

.hardware-card h4 {
  font-size: var(--text-base);
  margin: 0 0 0.3rem;
  font-family: var(--font-serif);
  font-weight: 600;
}

.hardware-card p {
  font-size: var(--text-sm);
  color: var(--text-soft);
  line-height: 1.4;
  margin: 0;
}

/* ================================================
   BUTTONS (shared)
================================================ */
.ps-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.95rem 2rem;
  font-weight: 700;
  font-size: var(--text-base);
  border: none;
  color: var(--btn-text, #0A0D10);
  background: linear-gradient(180deg, var(--accent-bronze-light), var(--accent-bronze));
  box-shadow: 0 18px 42px var(--btn-shadow, rgb(9 16 28 / 0.35)), inset 0 1px 0 var(--btn-highlight, rgb(255 255 255 / 0.32));
  cursor: pointer;
  transition: transform 0.24s ease, box-shadow 0.24s ease;
}

.ps-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 24px 50px var(--btn-shadow-hover, rgb(9 16 28 / 0.42)), inset 0 1px 0 var(--btn-highlight, rgb(255 255 255 / 0.32));
}

.ps-btn-primary:disabled {
  filter: grayscale(0.24);
  opacity: 0.65;
  cursor: not-allowed;
}

/* Dark mode button */
.ps-page--dark {
  --btn-text: #0A0D10;
  --btn-shadow: rgb(9 16 28 / 0.35);
  --btn-shadow-hover: rgb(9 16 28 / 0.42);
  --btn-highlight: rgb(255 255 255 / 0.32);
}

/* Light mode button — warm-toned shadows */
.ps-page--light {
  --btn-text: #F7F3EE;
  --btn-shadow: rgb(160 130 90 / 0.2);
  --btn-shadow-hover: rgb(160 130 90 / 0.28);
  --btn-highlight: rgb(255 250 240 / 0.5);
}

.ps-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.95rem 2rem;
  font-weight: 600;
  font-size: var(--text-base);
  border: 1px solid rgb(255 255 255 / 0.15);
  background: rgb(255 255 255 / 0.04);
  color: var(--text-soft);
  text-decoration: none;
  backdrop-filter: blur(12px);
  cursor: pointer;
  font: inherit;
  /* Entrance animation */
  opacity: 0;
  transition:
    color 0.24s ease,
    border-color 0.24s ease,
    background 0.24s ease,
    opacity 200ms ease;
  transition-delay: var(--reveal-delay, 800ms);
}

.reveal-card.is-visible .ps-btn-ghost {
  opacity: 1;
}

.ps-btn-ghost:hover {
  color: var(--text-main);
  border-color: rgb(255 255 255 / 0.25);
  background: rgb(255 255 255 / 0.07);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--text-soft);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.icon-btn:hover {
  color: var(--accent-bronze);
  border-color: var(--accent-bronze);
  background: var(--surface);
}

.locale-pill {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-soft);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.locale-pill[data-active='true'] {
  color: var(--bg-main);
  background: var(--accent-bronze);
  border-color: transparent;
}

/* ================================================
   FOCUS VISIBLE (accessibility)
================================================ */
.ps-quick-prompt:focus-visible,
.ps-btn-primary:focus-visible,
.ps-btn-ghost:focus-visible,
.ps-btn-narrate:focus-visible,
.locale-pill:focus-visible,
.about-toggle:focus-visible,
.slot-btn:focus-visible,
.icon-btn:focus-visible {
  outline: 2px solid var(--accent-bronze);
  outline-offset: 2px;
}

.ps-question-field textarea:focus-visible {
  outline: none;
}

.full-width {
  width: 100%;
}

/* ================================================
   FOOTER
================================================ */
.ps-footer {
  padding: 3rem 1.4rem;
  border-top: 1px solid var(--glass-border);
}

.ps-footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.ps-footer-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: var(--text-sm);
  color: var(--text-soft);
}

.ps-footer-locale {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--text-sm);
  color: rgb(214 224 235 / 0.5);
}

.ps-footer-locale button {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
  padding: 0;
  transition: color 0.2s ease;
}

.ps-footer-locale button:hover,
.ps-footer-locale button[data-active='true'] {
  color: var(--text-main);
}

.ps-footer-locale button[data-active='true'] {
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* ================================================
   RESPONSIVE
================================================ */
@media (max-width: 1024px) {
  .ritual-layout {
    grid-template-columns: 1fr;
    gap: 2.5rem;
  }

  .ritual-spinner {
    position: static;
  }

  .about-grid {
    grid-template-columns: 1fr;
  }

  .hardware-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .ps-nav {
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }

  .ps-nav-tagline {
    display: none;
  }

  .ritual-zone {
    padding: 2rem 1rem 3rem;
  }

  .ps-quick-prompt-list {
    grid-template-columns: 1fr;
  }

  .hardware-grid {
    grid-template-columns: 1fr;
  }

  .ps-btn-primary,
  .ps-btn-ghost {
    width: 100%;
    justify-content: center;
  }

  .ps-footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .ambient {
    display: none;
  }
}

/* ================================================
   REDUCED MOTION
================================================ */
@media (prefers-reduced-motion: reduce) {
  /* ── Disable all transitions/animations ───────────── */
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* ── Spin: instant state change ────────────────────── */
  .spinner-body {
    transition: none !important;
  }

  /* ── Cards: no entrance animation ──────────────────── */
  .direction-card {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
  }

  /* ── Reveal: no expansion animation ───────────────── */
  .reveal-card {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
  }

  .reveal-content {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }

  .reveal-pill {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
  }

  .next-action-card {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }

  /* ── Relief micro-animations: disabled ─────────────── */
  .ambient-b,
  .frame-aura {
    animation: none !important;
  }

  /* ── TTS button pulse: disabled ───────────────────── */
  .ps-btn-narrate {
    animation: none !important;
  }

  /* ── Scroll reveal: instant ─────────────────────────── */
  .reveal {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }

  /* ── About collapse: instant ──────────────────────── */
  .about-collapse {
    transition: none !important;
  }

  .about-chevron {
    transition: none !important;
  }

  /* ── Button hovers: no transform ────────────────────── */
  .ps-btn-primary:hover,
  .ps-btn-ghost:hover,
  .ps-quick-prompt:hover,
  .slot-btn:hover {
    transform: none !important;
  }

  .ps-btn-narrate:hover {
    transform: none !important;
  }

  /* ── Idle float: disabled ──────────────────────────── */
  .spinner-float {
    animation: none !important;
  }

  /* ── Pointer relief pulse: disabled ───────────────── */
  .pointer {
    animation: none !important;
  }
}

/* ================================================
   SCREEN READER ONLY (accessibility)
================================================ */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
