<script setup>
import { data } from '../../.vitepress/theme/blog.data'
import { ref, computed } from 'vue'

const category = ref('All')
const posts = computed(() => {
  if (category.value && category.value !== 'All') {
    return data.filter(post => post.frontmatter.category === category.value)
  }

  return data
})
</script>

<div>
  <div mb-2>Category</div>
  <div flex items-center gap-1>
    <label
      px-2 py-1 rounded-xl min-w-20 text-center text-sm
      :class="[ category === 'All' ? 'bg-primary/20 text-neutral-800 dark:text-neutral-100' : 'bg-black/5 dark:bg-white/5 text-neutral-800 dark:text-neutral-100' ]"
      transition-colors duration-200 ease-in-out
    >
      <input type="radio" value="All" name="category" v-model="category" appearance-none />
      <span>All</span>
    </label>
    <label
      px-2 py-1 rounded-xl min-w-20 text-center text-sm
      :class="[ category === 'DevLog' ? 'bg-primary/20 text-neutral-800 dark:text-neutral-100' : 'bg-black/5 dark:bg-white/5 text-neutral-800 dark:text-neutral-100' ]"
      transition-colors duration-200 ease-in-out
    >
      <input type="radio" value="DevLog" name="category" v-model="category" appearance-none />
      <span>DevLog</span>
    </label>
  </div>
</div>

<div>
  <div v-for="post in posts" :key="post.title" class="post">
    <a :href="post.url" class="decoration-neutral-300/50 decoration-dashed dark:decoration-neutral-700/50"><h2>{{ post.title }}</h2></a>
    <p v-html="post.excerpt"></p>
    <a :href="post.url" class="text-neutral-600 dark:text-neutral-400 decoration-neutral-300/50 decoration-dashed dark:decoration-neutral-700/50">Read more</a>
  </div>
</div>
