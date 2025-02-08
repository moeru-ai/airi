import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import catppuccin from 'starlight-theme-catppuccin'

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'Project Airi',
      social: {
        github: 'https://github.com/moeru-ai/airi',
      },
      sidebar: [
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
      ],
      plugins: [
        catppuccin(),
      ],
    }),
  ],
})
