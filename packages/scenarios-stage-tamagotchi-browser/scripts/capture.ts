import path from 'node:path'

import { cwd } from 'node:process'

import { captureBrowserRoots } from '@proj-airi/vishot-runner-browser'

const sceneAppRoot = path.resolve(cwd())
const outputDir = path.resolve(sceneAppRoot, 'artifacts', 'final')

await captureBrowserRoots({
  sceneAppRoot,
  routePath: '/',
  outputDir,
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
  },
})
