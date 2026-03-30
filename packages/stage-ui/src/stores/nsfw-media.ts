import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'

export interface NsfwImageJob {
  id: string
  userId: string
  characterId: string
  route: 'normal' | 'nsfw'
  status: 'queued' | 'submitting' | 'running' | 'done' | 'failed'
  prompt: string
  negativePrompt: string
  sceneType?: string | null
  tags: string[]
  params: Record<string, unknown>
  resultMediaId?: string | null
  errorMessage?: string | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}

export interface NsfwGalleryItem {
  id: string
  userId: string
  characterId: string
  imageJobId?: string | null
  mediaId?: string | null
  title?: string | null
  prompt: string
  negativePrompt: string
  sceneType?: string | null
  tags: string[]
  createdAt: string | number | Date
  updatedAt: string | number | Date
}

export const useNsfwMediaStore = defineStore('nsfw-media', () => {
  const jobs = ref<NsfwImageJob[]>([])
  const galleryItems = ref<NsfwGalleryItem[]>([])
  const loadingJobs = ref(false)
  const loadingGallery = ref(false)

  const sortedJobs = computed(() => [...jobs.value].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)))
  const sortedGalleryItems = computed(() => [...galleryItems.value].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)))

  async function fetchJobs() {
    loadingJobs.value = true
    try {
      const res = await client.api.v1.nsfw.jobs.$get()
      if (!res.ok)
        throw new Error('Failed to fetch NSFW jobs')
      const data = await res.json()
      jobs.value = data.jobs as NsfwImageJob[]
      return jobs.value
    }
    finally {
      loadingJobs.value = false
    }
  }

  async function createJob(input: {
    characterId: string
    route: 'normal' | 'nsfw'
    prompt: string
    negativePrompt: string
    sceneType?: string
    tags: string[]
    params?: Record<string, unknown>
  }) {
    const res = await client.api.v1.nsfw.jobs.$post({
      json: input,
    })
    if (!res.ok)
      throw new Error('Failed to create NSFW image job')

    const job = await res.json() as NsfwImageJob
    jobs.value = [job, ...jobs.value]
    return job
  }

  async function fetchGallery() {
    loadingGallery.value = true
    try {
      const res = await client.api.v1.nsfw.gallery.$get()
      if (!res.ok)
        throw new Error('Failed to fetch NSFW gallery')
      const data = await res.json()
      galleryItems.value = data.items as NsfwGalleryItem[]
      return galleryItems.value
    }
    finally {
      loadingGallery.value = false
    }
  }

  async function createGalleryItem(input: {
    characterId: string
    imageJobId?: string
    mediaId?: string
    title?: string
    prompt: string
    negativePrompt: string
    sceneType?: string
    tags: string[]
  }) {
    const res = await client.api.v1.nsfw.gallery.$post({
      json: input,
    })
    if (!res.ok)
      throw new Error('Failed to create NSFW gallery item')

    const item = await res.json() as NsfwGalleryItem
    galleryItems.value = [item, ...galleryItems.value]
    return item
  }

  return {
    jobs,
    galleryItems,
    loadingJobs,
    loadingGallery,
    sortedJobs,
    sortedGalleryItems,
    fetchJobs,
    createJob,
    fetchGallery,
    createGalleryItem,
  }
})
