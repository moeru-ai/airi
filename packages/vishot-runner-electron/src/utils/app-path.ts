import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ElectronAppInfo {
  repoRoot: string
  mainEntrypoint: string
}

export async function resolveElectronAppInfo(): Promise<ElectronAppInfo> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const repoRoot = resolve(packageRoot, '..', '..')
  const stageTamagotchiRoot = resolve(repoRoot, 'apps', 'stage-tamagotchi')
  const mainEntrypoint = resolve(stageTamagotchiRoot, 'out', 'main', 'index.js')

  await access(mainEntrypoint).catch(() => {
    throw new Error(`Built Electron entrypoint not found at ${mainEntrypoint}. Run "pnpm -F @proj-airi/stage-tamagotchi build" first.`)
  })

  return {
    repoRoot,
    mainEntrypoint,
  }
}
