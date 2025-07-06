import sdk from '@stackblitz/sdk'
import { getParameters } from 'codesandbox/lib/api/define'

import { version } from '../../package.json'

export function makeCodeSandboxParams(componentName: string, sources: Record<string, string>) {
  let files = {}
  files = constructFiles(componentName, sources)
  return getParameters({ files, template: 'node' })
}

export function makeStackblitzParams(componentName: string, sources: Record<string, string>) {
  const files: Record<string, string> = {}
  Object.entries(constructFiles(componentName, sources))
    .filter(([_, v]) => Boolean(v))
    .forEach(([k, v]) => {
      if (typeof v !== 'string' && 'content' in v)
        files[`${k}`] = typeof v.content === 'object' ? JSON.stringify(v.content, null, 2) : v.content
    })
  return sdk.openProject({
    title: `${componentName} - Reka UI`,
    files,
    template: 'node',
  }, {
    newWindow: true,
    openFile: ['src/App.vue'],
  })
}

const viteConfig = {
  'vite.config.js': {
    content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})`,
    isBinary: false,
  },
  'index.html': {
    content: `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite + Vue + TS</title>
      </head>
      <body>
        <div id="app"></div>
        <script type="module" src="/src/main.ts"></script>
      </body>
    </html>
    `,
    isBinary: false,
  },
}

function constructFiles(componentName: string, sources: Record<string, string>) {
  const dependencies = {
    'vue': 'latest',
    'reka-ui': version,
    '@radix-ui/colors': 'latest',
    '@iconify/vue': 'latest',
  }

  const devDependencies = {
    'vite': 'latest',
    '@vitejs/plugin-vue': 'latest',
    'vue-tsc': 'latest',
    'tailwindcss': '^3.4.13',
    'postcss': 'latest',
    'autoprefixer': 'latest',
  }

  const componentFiles = Object.keys(sources).filter(key => key.endsWith('.vue') && key !== 'index.vue')
  const components: Record<string, any> = {}
  componentFiles.forEach((i) => {
    components[`src/${i}`] = {
      isBinary: false,
      content: sources[i],
    }
  })

  const files = {
    'package.json': {
      content: {
        name: `reka-ui-${componentName.toLowerCase().replace(/ /g, '-')}`,
        scripts: { start: 'vite' },
        dependencies,
        devDependencies,
      },
      isBinary: false,
    },
    ...viteConfig,
    'tailwind.config.js': sources['tailwind.config.js'] && {
      content: sources['tailwind.config.js'],
      isBinary: false,
    },
    'postcss.config.js': sources['tailwind.config.js'] && {
      content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}`,
      isBinary: false,
    },
    'src/main.ts': {
      content: `import { createApp } from 'vue';
import App from './App.vue';
import './global.css';

createApp(App).mount('#app')`,
      isBinary: false,
    },
    'src/App.vue': {
      isBinary: false,
      content: sources['index.vue'],
    },
    'src/styles.css': sources['styles.css'] && {
      isBinary: false,
      content: sources['styles.css'],
    },
    ...components,
    'src/global.css': {
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui;
  width: 100vw;
  height: 100vh;
  background-image: linear-gradient(to bottom right, hsl(173, 80.0%, 36.0%) 0%, hsl(151, 55.0%, 41.5%) 100%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`,
      isBinary: false,
    },
  }

  return files
}
