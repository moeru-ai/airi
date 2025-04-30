import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { builder: 'copy', input: './src', outDir: './dist' },
  ],
  declaration: false,
  sourcemap: false,
  clean: true,
})
