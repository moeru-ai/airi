import { OGImageRoute } from 'astro-og-canvas'
import { getCollection } from 'astro:content'

// eslint-disable-next-line antfu/no-top-level-await
const collectionEntries = await getCollection('docs')

const pages = Object.fromEntries(collectionEntries.map(({ id, data }) => [id, data]))

export const { getStaticPaths, GET } = OGImageRoute({
  param: 'slug',
  pages,
  getSlug: path => `${path}.webp`,
  getImageOptions: (_id, page: typeof pages[number]) => ({
    bgGradient: [[44, 42, 44]],
    title: page.title,
    description: page.description,
    logo: {
      path: './public/logo-dark.png',
      size: [128],
    },
    format: 'WEBP',
    quality: 90,
  }),
})
