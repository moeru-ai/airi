import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { builder: 'mkdist', input: './src/components/', outDir: './dist/components', pattern: '**/*.vue', loaders: ['vue'] },
    { builder: 'mkdist', input: './src/components/', outDir: './dist/components', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/stores/', outDir: './dist/stores', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/constants/', outDir: './dist/constants', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/composables/', outDir: './dist/composables', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/utils/', outDir: './dist/utils', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/libs/', outDir: './dist/libs', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
    { builder: 'mkdist', input: './src/types/', outDir: './dist/types', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
  ],
  declaration: true,
  sourcemap: true,
  clean: true,
})
