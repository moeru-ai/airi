import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { builder: 'mkdist', input: './src/', outDir: './dist/', pattern: '**/*.vue', loaders: ['vue'] },
    { builder: 'mkdist', input: './src/', outDir: './dist/', pattern: '**/*.ts', format: 'esm', loaders: ['js'] },
  ],
  declaration: true,
  sourcemap: true,
  clean: true,
})
