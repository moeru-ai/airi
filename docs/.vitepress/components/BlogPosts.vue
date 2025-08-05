<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { chromaticPaletteFrom } from '@proj-airi/chromatic'
import { computedAsync } from '@vueuse/core'
import { subtle } from 'uncrypto'
import { useData, withBase } from 'vitepress'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Post {
  title: string
  url: string
  urlWithoutLang: string
  lang: string
  date: {
    time: number
    string: string
  }
  excerpt: string | undefined
  frontmatter?: {
    'excerpt'?: string
    'category'?: string
    'author'?: string
    'preview-cover'?: {
      light?: string
      dark?: string
    }
  }
}

const props = defineProps<{
  data: Post[]
}>()

const { t } = useI18n()
const { isDark, lang } = useData()
const category = ref('all')
const categories = computed(() => {
  const allCategories = props.data.map(post => post.frontmatter?.category).filter(Boolean).map(post => post?.toLowerCase())
  return ['all', ...new Set(allCategories as string[])]
})

const posts = computed(() => {
  let postsData = props.data as Post[]

  if (category.value && category.value !== 'all') {
    postsData = props.data.filter(post => post.frontmatter?.category?.toLowerCase() === category.value)
  }

  const transformedPostsData = postsData
    .map((post) => {
      const overridePost = {
        ...post,
        url: withBase(post.url),
      }

      return overridePost
    })
    .filter(post => !!post.title)

  const currentLanguagePostsData = [...transformedPostsData].filter(post => post.lang === lang.value)
  const fallbackLanguagePostsData = [...transformedPostsData].filter(post => post.lang === 'en')

  const setCurrentLanguagePostsData = new Set(currentLanguagePostsData.map(post => post.urlWithoutLang))
  const diffFallbackLanguagePostsData = fallbackLanguagePostsData.filter(post => !setCurrentLanguagePostsData.has(post.urlWithoutLang))

  return [
    ...currentLanguagePostsData,
    ...diffFallbackLanguagePostsData,
  ].sort((a, b) => {
    return b.date.time - a.date.time
  })
})

async function stringToSeed(str: string) {
  const data = new TextEncoder().encode(str)
  const buffer = await subtle.digest('SHA-256', data)
  const view = new DataView(buffer)
  return view.getUint32(0, false) // false for big-endian
}

// A simple PRNG class to generate random numbers based on a seed.
// One of the linear congruential generator (LCG) implementation.
function createPRNG(seed: number) {
  const a = 1664525
  const c = 1013904223
  const m = 2 ** 32

  function nextInt() {
    seed = (a * seed + c) % m
    return seed
  }

  function nextFloat() {
    return nextInt() / m
  }

  function next(min: number, max: number) {
    return min + nextFloat() * (max - min)
  }

  function choice<T>(arr: T[]) {
    return arr[Math.floor(next(0, arr.length))]
  }

  return {
    nextInt,
    nextFloat,
    next,
    choice,
  }
}

async function createTileGenerator(title: string) {
  const prng = createPRNG(await stringToSeed(title))
  const baseHue = prng.next(220, 300)
  const palette = chromaticPaletteFrom(baseHue)
  const complementary = chromaticPaletteFrom((baseHue + 30) % 360)

  function generateWaves(options?: { dark?: boolean }) {
    let paths = ''
    const numWaves = Math.floor(prng.next(2, 5))
    for (let i = 0; i < numWaves; i++) {
      const yOffset = prng.next(20, 80)
      const amplitude = prng.next(10, 30)
      const frequency = prng.next(0.03, 0.08)
      const strokeWidth = prng.next(4, 10)

      const stroke = options?.dark
        ? prng.choice([palette.shadeBy(700), palette.shadeBy(500), complementary.shadeBy(700), complementary.shadeBy(500)])
        : prng.choice([palette.shadeBy(200), palette.shadeBy(500), complementary.shadeBy(200), complementary.shadeBy(500)])

      let pathData = `M -10 ${yOffset}`
      for (let x = -10; x <= 110; x += 5) {
        pathData += ` L ${x} ${yOffset + Math.sin(x * frequency) * amplitude}`
      }

      paths += `<path d="${pathData}" fill="none" stroke="${stroke.toHex()}" stroke-width="${strokeWidth}" />`
    }

    return paths
  }

  const generators = [
    generateWaves,
  ]

  function generate(options?: { dark?: boolean }) {
    const patternGenerator = prng.choice(generators)
    const patternElements = patternGenerator(options)
    const backgroundColor = options?.dark ? palette.shadeBy(900).toHex() : palette.shadeBy(100).toHex()

    return `
<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="object-fit: cover; width: 100%; height: 100%;">
<rect width="100" height="100" fill="${backgroundColor}" />
${patternElements}
</svg>`
  }

  return {
    generate,
  }
}

const svgArts = computedAsync(async () => {
  return Promise.all(posts.value.map(async (post) => {
    const generator = await createTileGenerator(post.title)

    return {
      light: generator.generate({ dark: false }),
      dark: generator.generate({ dark: true }),
    }
  }))
})
</script>

<template>
  <div class="w-full">
    <div>
      <h1 class="text-foreground text-4xl font-extrabold tracking-tight font-sans-rounded sm:text-5xl">
        {{ t('docs.theme.blog.title') }}
      </h1>
      <p class="text-muted-foreground mt-4 text-xl">
        {{ t('docs.theme.blog.subtitle') }}
      </p>
    </div>

    <div class="mb-16">
      <div class="flex flex-wrap items-center gap-2 font-sans-rounded">
        <label
          v-for="item in categories"
          :key="item"
          class="cursor-pointer text-base font-semibold transition-colors duration-200 ease-in-out"
          :class="[category === item ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900/50 dark:text-slate-100/50']"
        >
          <input
            v-model="category"
            type="radio"
            :value="item"
            name="category"
            class="sr-only"
          >
          <span>{{ t(`docs.theme.blog.categories.${item}`) }}</span>
        </label>
      </div>
    </div>

    <div class="grid mx-auto gap-8 lg:grid-cols-2">
      <a
        v-for="(post, index) of posts"
        :key="post.url"
        :href="post.url"
        class="block flex flex-col overflow-hidden border-transparent rounded-xl border-solid bg-white/50 decoration-none shadow-sm outline-2 outline-transparent outline-offset-0 outline transition-all transition-all duration-200 duration-300 ease-in-out dark:bg-black/20 dark:shadow-slate-600/5 hover:shadow-md hover:outline-primary/5 hover:outline-offset-2 [&_.post-card-title]:hover:text-primary dark:hover:outline-primary/25"
      >
        <div class="rounded-t-xl">
          <ClientOnly>
            <div v-if="!post.frontmatter?.['preview-cover']?.[isDark ? 'dark' : 'light']" class="mb-6 h-20 md:h-60">
              <div class="blur-lg" h="full" w-full v-html="isDark ? svgArts?.[index].dark : svgArts?.[index].light" />
            </div>
            <div v-else class="relative mb-0 h-44 w-full md:h-68">
              <div class="preview-card-art-image-overlay" />
              <img
                :src="post.frontmatter?.['preview-cover']?.[isDark ? 'dark' : 'light']"
                alt="Post Cover"
                class="preview-card-art-image h-full w-full object-cover"
              >
            </div>
          </ClientOnly>
        </div>
        <div class="relative z-1 flex-grow px-3 pb-3 pt-6 md:pt-6">
          <div class="post-card-title text-card-foreground z-1 text-xl font-semibold transition-colors duration-200 md:text-2xl md:font-bold">
            {{ post.title }}
          </div>
          <div class="text-muted-foreground mb-4 flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <Icon icon="lucide:calendar" />
              <span>{{ post.date.string }}</span>
            </div>
            <div v-if="post.frontmatter?.category" class="flex items-center gap-2">
              <Icon icon="lucide:tag" />
              <span class="font-medium">{{ post.frontmatter.category }}</span>
            </div>
          </div>
          <p v-if="post.excerpt || post?.frontmatter?.excerpt" class="text-muted-foreground fade-out-text mt-3 h-[calc(75%-48px)] leading-relaxed" v-html="post.excerpt || post?.frontmatter?.excerpt" />
        </div>
        <div class="mt-auto p-6 pt-0">
          <a :href="post.url" class="inline-flex items-center text-primary font-semibold hover:underline">
            {{ t('docs.theme.blog.card.post.read-more.title') }}
            <Icon icon="lucide:arrow-right" class="ml-2" />
          </a>
        </div>
      </a>
    </div>
    <div v-if="posts.length === 0" class="py-16 text-center">
      <p class="text-muted-foreground text-lg">
        {{ t('docs.theme.blog.no-posts') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.fade-out-text {
  -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
  max-height: 10lh; /* Adjust this value to control the number of visible lines */
  overflow: hidden;
}

/**
https://stackoverflow.com/questions/67853607/how-do-i-graduallyfeather-gradient-transition-blur-in-css
https://www.reddit.com/r/css/comments/t3am53/pure_css_gradientprogressive_blur_i_used/
https://codepen.io/Francesco_Maretti/pen/yLPRvXp
*/
.preview-card-art-image-overlay {
  height: 50%;
  width: 100%;
  position: absolute;
  bottom: 0;
  z-index: 1;
  transform: translateY(50%);
  backdrop-filter: blur(40px);
  -webkit-mask-image: linear-gradient(to bottom, #ffffff00 0%, #ffffff 50%, #ffffff00 100%);
  mask-image: linear-gradient(to bottom, #ffffff00 0%, #ffffff 50%, #ffffff00 100%);
}
</style>
