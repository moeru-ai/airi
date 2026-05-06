import type { Artifact, CoverArtifacts } from '../../types/artifact'

import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'
import { hashFile } from '../../utils/hash'

/**
 * Collects and validates all artifacts produced by the pipeline stages.
 */
export async function collectArtifacts(
  jobDir: string,
): Promise<Partial<CoverArtifacts>> {
  const result: Partial<CoverArtifacts> = {}

  const checks: Array<{ key: keyof CoverArtifacts, dir: string, file: string, mime: string }> = [
    { key: 'source', dir: STAGE_DIRS.prep, file: ARTIFACT_NAMES.source, mime: 'audio/wav' },
    { key: 'vocals', dir: STAGE_DIRS.separate, file: ARTIFACT_NAMES.vocals, mime: 'audio/wav' },
    { key: 'instrumental', dir: STAGE_DIRS.separate, file: ARTIFACT_NAMES.instrumental, mime: 'audio/wav' },
    { key: 'f0', dir: STAGE_DIRS.pitch, file: ARTIFACT_NAMES.f0, mime: 'application/octet-stream' },
    { key: 'convertedVocals', dir: STAGE_DIRS.convert, file: ARTIFACT_NAMES.convertedVocals, mime: 'audio/wav' },
    { key: 'finalCover', dir: STAGE_DIRS.mix, file: ARTIFACT_NAMES.finalCover, mime: 'audio/wav' },
    { key: 'manifest', dir: '', file: ARTIFACT_NAMES.manifest, mime: 'application/json' },
  ]

  for (const check of checks) {
    const fullPath = check.dir
      ? join(jobDir, check.dir, check.file)
      : join(jobDir, check.file)

    try {
      const s = await stat(fullPath)
      const hash = await hashFile(fullPath)
      const artifact: Artifact = {
        path: check.dir ? `${check.dir}/${check.file}` : check.file,
        mimeType: check.mime,
        size: s.size,
        hash,
      }
      result[check.key] = artifact
    }
    catch {
      /* artifact not found — skip */
    }
  }

  return result
}
