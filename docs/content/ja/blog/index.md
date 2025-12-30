---
sidebar: false
outline: false
community: false
---

<script setup>
import { data } from '../../../.vitepress/functions/blog.data'
import BlogPosts from '../../../.vitepress/components/BlogPosts.vue'
</script>

<BlogPosts :data="data" />
