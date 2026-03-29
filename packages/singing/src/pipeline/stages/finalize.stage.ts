import type { StageResult } from '../../contracts/stage-result'
import type { ValidationGateResult } from '../../evaluation/evaluation.types'
import type { CoverManifest } from '../../types/manifest'
import type { PipelineContext } from '../context'

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES } from '../../manifests/artifact-layout'
import { serializeCoverManifest } from '../../manifests/cover-manifest'
import { hashFile } from '../../utils/hash'

/**
 * Stage: Finalize
 * - Write manifest.json with full audit trail
 * - Compute checksums for all artifacts
 */
export async function finalizeStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const timingRecord: Partial<Record<PipelineStage, number>> = {}
  for (const [stage, ms] of ctx.timing.entries()) {
    timingRecord[stage] = ms
  }

  const artifactHashes: Record<string, string> = {}
  for (const [path, artifact] of ctx.artifacts.entries()) {
    try {
      const fullPath = join(ctx.jobDir, path)
      const hash = await hashFile(fullPath)
      artifactHashes[path] = hash
      artifact.hash = hash
    }
    catch {
      /* artifact may not exist on disk if it was a pass-through reference */
    }
  }

  const req = ctx.task.request

  const gateResult = ctx.metadata.get('gate_result') as ValidationGateResult | undefined
  const predictedParams = ctx.metadata.get('predicted_params') as Record<string, unknown> | undefined
  const autoCal = ctx.metadata.get('auto_calibrated') as boolean | undefined

  let evaluation: CoverManifest['evaluation']
  if (gateResult) {
    const conv = req.converter
    evaluation = {
      singer_similarity: gateResult.singer_similarity ?? 0,
      f0_corr: gateResult.f0_corr ?? 0,
      source_leakage: gateResult.source_leakage ?? 0,
      tearing_risk: gateResult.tearing_risk ?? 0,
      passed: gateResult.passed,
      failed_metrics: gateResult.failed_metrics ?? [],
      auto_calibrated: autoCal ?? false,
      params_used: {
        pitch_shift: (predictedParams?.pitch_shift as number) ?? ('f0UpKey' in conv ? (conv.f0UpKey ?? 0) : 0),
        index_rate: (predictedParams?.index_rate as number) ?? ('indexRate' in conv ? (conv.indexRate ?? 0.75) : 0.75),
        protect: (predictedParams?.protect as number) ?? ('protect' in conv ? (conv.protect ?? 0.33) : 0.33),
        rms_mix_rate: (predictedParams?.rms_mix_rate as number) ?? ('rmsMixRate' in conv ? (conv.rmsMixRate ?? 0.25) : 0.25),
      },
    }
  }

  const manifest: CoverManifest = {
    version: 1,
    jobId: ctx.task.id,
    createdAt: ctx.task.createdAt.toISOString(),
    completedAt: new Date().toISOString(),
    input: {
      originalFileName: req.originalFileName ?? req.inputUri.split('/').pop() ?? 'unknown',
      sampleRate: 44100,
      durationSeconds: (ctx.metadata.get('sourceDurationSeconds') as number) ?? 0,
    },
    separator: {
      backend: req.separator.backend,
      model: req.separator.model ?? 'default',
    },
    pitch: {
      backend: req.pitch.backend,
    },
    converter: {
      backend: req.converter.backend as any,
      model: ('voiceId' in req.converter ? req.converter.voiceId : req.converter.checkpoint) ?? 'default',
      params: { ...req.converter },
    },
    mix: {
      vocalGainDb: req.mix?.vocalGainDb ?? 0,
      instGainDb: req.mix?.instGainDb ?? -8,
      ducking: req.mix?.ducking ?? true,
      targetLufs: req.mix?.targetLufs ?? -14,
      truePeakDb: req.mix?.truePeakDb ?? -1.5,
    },
    timing: timingRecord,
    artifactHashes: Object.keys(artifactHashes).length > 0 ? artifactHashes : undefined,
    outputSampleRate: 44100,
    evaluation,
  }

  const manifestPath = join(ctx.jobDir, ARTIFACT_NAMES.manifest)
  await writeFile(manifestPath, serializeCoverManifest(manifest), 'utf-8')

  return {
    stage: PipelineStage.Finalize,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: ARTIFACT_NAMES.manifest, mimeType: 'application/json' },
    ],
  }
}
