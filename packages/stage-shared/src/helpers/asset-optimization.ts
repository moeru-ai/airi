/**
 * Utility functions for optimizing image and asset loading
 */

// Type definitions
export interface ImagePreloadOptions {
  crossOrigin?: 'anonymous' | 'use-credentials'
  referrerPolicy?: ReferrerPolicy
  fetchPriority?: 'high' | 'low' | 'auto'
}

export interface ResponsiveImageConfig {
  src: string
  srcSet?: string
  sizes?: string
  fallback?: string
}

export async function preloadImage(src: string, options: ImagePreloadOptions = {}): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    if (options.crossOrigin)
      img.crossOrigin = options.crossOrigin
    if (options.referrerPolicy)
      img.referrerPolicy = options.referrerPolicy

    img.onload = () => resolve(img)
    img.onerror = reject

    if (options.fetchPriority) {
      (img as any).fetchPriority = options.fetchPriority
    }

    img.src = src
  })
}

/**
 * Preload multiple images with concurrency control
 */
export async function preloadImages(
  sources: string[],
  options: ImagePreloadOptions & { concurrency?: number } = {},
): Promise<HTMLImageElement[]> {
  const concurrency = options.concurrency || 6
  const results: HTMLImageElement[] = []

  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(src => preloadImage(src, options)),
    )
    results.push(...batchResults)
  }

  return results
}

/**
 * Creates an optimized responsive image srcSet
 */
export function createResponsiveImageSrcSet(baseSrc: string, sizes: number[]): string {
  return sizes
    .map(size => `${baseSrc}?size=${size} ${size}w`)
    .join(', ')
}

/**
 * Lazy-loads images with Intersection Observer
 */
export function createLazyImageLoader() {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement
        const src = img.dataset.src
        const srcSet = img.dataset.srcset

        if (src) {
          img.src = src
          delete img.dataset.src
        }
        if (srcSet) {
          img.srcset = srcSet
          delete img.dataset.srcset
        }

        img.classList.remove('lazy')
        img.classList.add('loaded')

        imageObserver.unobserve(img)
      }
    })
  })

  const observe = (img: HTMLImageElement) => {
    imageObserver.observe(img)
  }

  const disconnect = () => {
    imageObserver.disconnect()
  }

  return { observe, disconnect }
}

/**
 * Compresses image in browser for upload optimization
 */
export async function compressImage(
  file: File,
  options: {
    quality?: number
    maxWidth?: number
    maxHeight?: number
  } = {},
): Promise<Blob> {
  const { quality = 0.8, maxWidth = 1920, maxHeight = 1080 } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = width * ratio
        height = height * ratio
      }

      // Create canvas and draw image
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob)
            resolve(blob)
          else reject(new Error('Could not compress image'))
        },
        'image/jpeg',
        quality,
      )

      URL.revokeObjectURL(img.src)
    }

    img.onerror = reject
  })
}

/**
 * Implements image caching with fallback
 */
export class ImageCache {
  private cache = new Map<string, HTMLImageElement>()
  private maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  async get(src: string): Promise<HTMLImageElement> {
    if (this.cache.has(src)) {
      return this.cache.get(src)!
    }

    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    const img = await preloadImage(src)
    this.cache.set(src, img)
    return img
  }

  has(src: string): boolean {
    return this.cache.has(src)
  }

  delete(src: string): boolean {
    return this.cache.delete(src)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/**
 * Optimizes video loading with preload strategies
 */
export function optimizeVideoLoading(
  video: HTMLVideoElement,
  options: {
    preload?: 'none' | 'metadata' | 'auto'
    lazyLoad?: boolean
  } = {},
): () => void {
  const { preload = 'metadata', lazyLoad = true } = options

  video.preload = preload

  if (lazyLoad) {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        // Start loading the video
        if (video.dataset.src) {
          video.src = video.dataset.src
          delete video.dataset.src
        }
        observer.unobserve(video)
      }
    })

    observer.observe(video)

    return () => observer.disconnect()
  }

  return () => {} // No-op cleanup function
}

/**
 * Implements resource hints for better performance
 */
export function addResourceHints(
  resources: Array<{ href: string, as: string, type?: string, crossorigin?: boolean }>,
) {
  resources.forEach((resource) => {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.href = resource.href
    link.as = resource.as

    if (resource.type)
      link.type = resource.type
    if (resource.crossorigin)
      link.crossOrigin = 'anonymous'

    document.head.appendChild(link)
  })
}

/**
 * Detects optimal image format support
 */
export function getOptimalImageFormat(): 'avif' | 'webp' | 'jpeg' {
  const canvas = document.createElement('canvas')

  // Check for AVIF support
  if (canvas.toDataURL('image/avif').startsWith('data:image/avif')) {
    return 'avif'
  }

  // Check for WebP support
  if (canvas.toDataURL('image/webp').startsWith('data:image/webp')) {
    return 'webp'
  }

  // Fallback to JPEG
  return 'jpeg'
}

/**
 * Generates optimized image URL with format selection
 */
export function generateOptimizedImageUrl(base: string, format?: 'avif' | 'webp' | 'jpeg'): string {
  const optimalFormat = format || getOptimalImageFormat()

  // If the base URL already has an extension, replace it
  const pathWithoutExt = base.replace(/\.[^/.]+$/, '')
  return `${pathWithoutExt}.${optimalFormat}`
}
