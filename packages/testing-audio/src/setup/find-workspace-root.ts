import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface WorkspaceManifest {
  workspaces?: unknown
}

/**
 * Finds the monorepo root that contains `startDir`.
 *
 * The pnpm -> Bun migration removed `pnpm-workspace.yaml`, which
 * `@pnpm/find-workspace-dir` treated as its only root marker. This walks up to
 * the nearest ancestor whose manifest declares `workspaces` instead, so the
 * search keeps working with the Bun workspace definition.
 *
 * @param startDir - Directory that the upward search starts from. Pass the
 * caller's `import.meta.dirname` to anchor the search at the calling module.
 * @returns The absolute workspace root, or `undefined` when no ancestor manifest declares workspaces.
 */
export function findWorkspaceRoot(startDir: string): string | undefined {
  let current = startDir

  while (true) {
    const manifestPath = join(current, 'package.json')
    if (existsSync(manifestPath)) {
      let manifest: WorkspaceManifest | undefined
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as WorkspaceManifest
      }
      catch {
        // A malformed ancestor manifest is not a workspace root; keep walking up.
        manifest = undefined
      }

      if (manifest && manifest.workspaces !== undefined)
        return current
    }

    const parent = dirname(current)
    if (parent === current)
      return undefined

    current = parent
  }
}
