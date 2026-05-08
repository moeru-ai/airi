import type { StageResult } from '../../contracts/stage-result'
import type { PipelineContext } from '../context'

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { runFfmpeg } from '../../adapters/ffmpeg/ffmpeg-runner'
import { buildLoudnormFilter, buildLoudnormFilterTwoPass } from '../../adapters/ffmpeg/filters/normalize'
import { buildSidechainFilter } from '../../adapters/ffmpeg/filters/sidechain'
import { PipelineStage } from '../../constants/pipeline-stage'
import { ARTIFACT_NAMES, STAGE_DIRS } from '../../manifests/artifact-layout'

type MixTrackRole = 'converted_lead' | 'backing' | 'instrumental' | 'extra'
const MEAN_VOLUME_DB_REGEX = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i

export interface MixTrack {
  role: MixTrackRole
  path: string
  gain: number
  label: string
}

interface MixTrackCandidate {
  role: MixTrackRole
  path: string
  defaultGain: number
  label: string
}

/**
 * Discover all available audio stems from the job directory and build
 * the MixTrack array dynamically. No hardcoded track count.
 *
 * Backing vocal gain is intentionally conservative because even a good
 * karaoke/lead separator can leave harmony leakage that competes with the
 * converted lead in choruses.
 */
function discoverTracks(jobDir: string, gainOverrides?: Record<string, number>): MixTrack[] {
  const candidates: MixTrackCandidate[] = [
    {
      role: 'converted_lead',
      path: join(jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals),
      defaultGain: 1.0,
      label: 'Converted Vocals',
    },
    {
      role: 'backing',
      path: join(jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.backingVocals),
      defaultGain: 0.38,
      label: 'Backing Vocals',
    },
    {
      role: 'instrumental',
      path: join(jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.instrumental),
      defaultGain: 1.0,
      label: 'Instrumental',
    },
  ]

  return candidates
    .filter(c => existsSync(c.path))
    .map(c => ({
      role: c.role,
      path: c.path,
      gain: gainOverrides?.[c.role] ?? c.defaultGain,
      label: c.label,
    }))
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

async function analyzeTrackMeanVolumeDb(
  path: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const result = await runFfmpeg([
    '-i',
    path,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ], { signal })

  if (result.exitCode !== 0)
    return null

  const match = result.stderr.match(MEAN_VOLUME_DB_REGEX)
  if (!match)
    return null

  const meanVolume = Number(match[1])
  return Number.isFinite(meanVolume) ? meanVolume : null
}

async function estimateLeadMakeupGainDb(
  convertedLeadPath: string,
  sourceLeadPath: string,
  signal?: AbortSignal,
): Promise<number> {
  const [convertedMeanDb, sourceMeanDb] = await Promise.all([
    analyzeTrackMeanVolumeDb(convertedLeadPath, signal),
    analyzeTrackMeanVolumeDb(sourceLeadPath, signal),
  ])

  if (convertedMeanDb === null || sourceMeanDb === null)
    return 0

  // When the converted lead lands well below the source lead, add makeup gain
  // before the final mix so the singer stays forward instead of being buried.
  return clamp(sourceMeanDb - convertedMeanDb, 0, 4)
}

/**
 * Build an FFmpeg filter_complex string for N input tracks.
 *
 * When ducking is enabled AND a converted_lead track exists, applies
 * sidechain compression on every non-vocal stem (instrumental, backing)
 * so the converted voice stays forward in the mix.
 *
 * The vocal signal is split once; copies feed each sidechain compressor
 * and the final amix. This works for 2-track, 3-track, and N-track layouts.
 */
function buildDynamicFilterComplex(
  tracks: MixTrack[],
  loudnormStr: string,
  useDucking: boolean,
  vocalGainDb: number,
  instGainDb: number,
): string {
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'
  const n = tracks.length
  const vocalIdx = tracks.findIndex(t => t.role === 'converted_lead')
  const nonVocalTracks = tracks.filter((_, i) => i !== vocalIdx)
  const canDuck = useDucking && vocalIdx >= 0 && nonVocalTracks.length > 0

  if (!canDuck) {
    const parts: string[] = []
    const labels: string[] = []

    for (let i = 0; i < n; i++) {
      const t = tracks[i]
      const label = `a${i}`
      parts.push(`[${i}:a]${fmt},volume=${t.gain}[${label}]`)
      labels.push(`[${label}]`)
    }

    return `${parts.join(';')};${labels.join('')}amix=inputs=${n}:duration=longest:normalize=0,${loudnormStr}`
  }

  // Ducking path: sidechain compress every non-vocal stem using the vocal as key.
  // The vocal is split into (1 + nonVocalTracks.length) copies:
  //   - one copy per non-vocal stem for sidechain key
  //   - one final copy for the amix
  const sidechain = buildSidechainFilter({
    threshold: 0.025,
    ratio: tracks.length >= 3 ? 6 : 4,
    attack: 0.01,
    release: tracks.length >= 3 ? 0.35 : 0.5,
  })
  const vocalVol = vocalGainDb === 0 ? '' : `,volume=${vocalGainDb}dB`
  const splitCount = nonVocalTracks.length + 1
  const splitLabels = Array.from({ length: splitCount }, (_, i) => `voc${i}`)
  const splitOut = splitLabels.map(l => `[${l}]`).join('')

  const parts: string[] = []
  parts.push(`[${vocalIdx}:a]${fmt}${vocalVol},asplit=${splitCount}${splitOut}`)

  const mixLabels: string[] = []
  const vocalMixLabel = splitLabels.at(-1)

  for (let si = 0; si < nonVocalTracks.length; si++) {
    const stem = nonVocalTracks[si]
    const stemIdx = tracks.indexOf(stem)
    const stemGainDb = stem.role === 'instrumental' ? instGainDb : 0
    const stemVol = stemGainDb === 0
      ? `,volume=${stem.gain}`
      : `,volume=${stemGainDb}dB,volume=${stem.gain}`
    const stemLabel = `s${si}`
    const duckedLabel = `d${si}`
    const scKeyLabel = splitLabels[si]

    parts.push(`[${stemIdx}:a]${fmt}${stemVol}[${stemLabel}]`)
    parts.push(`[${stemLabel}][${scKeyLabel}]${sidechain}[${duckedLabel}]`)
    mixLabels.push(`[${duckedLabel}]`)
  }

  mixLabels.unshift(`[${vocalMixLabel}]`)

  return `${parts.join(';')};${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,${loudnormStr}`
}

/**
 * Stage: Remix (Dynamic N-Track Mixing Engine)
 *
 * Automatically discovers all available stem artifacts, builds a dynamic
 * FFmpeg filter_complex for N inputs, and produces the final cover mix.
 * Supports 2-track (no lead isolation), 3-track (with lead isolation),
 * and future N-stem scenarios without code changes.
 */
export async function remixStage(
  ctx: PipelineContext,
): Promise<StageResult> {
  const stageDir = join(ctx.jobDir, STAGE_DIRS.mix)
  await mkdir(stageDir, { recursive: true })

  const outputPath = join(stageDir, ARTIFACT_NAMES.finalCover)
  const mix = ctx.task.request.mix
  const tracks = discoverTracks(ctx.jobDir, mix?.trackGains)

  if (tracks.length < 2) {
    return {
      stage: PipelineStage.Remix,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `Remix requires at least 2 tracks, found ${tracks.length}: ${tracks.map(t => t.label).join(', ')}`,
    }
  }

  const loudnormOptions = {
    targetLufs: mix?.targetLufs,
    truePeakDb: mix?.truePeakDb,
  }
  const useDucking = mix?.ducking ?? true
  const isMultiStem = tracks.length >= 3
  const sourceLeadPath = existsSync(join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals))
    ? join(ctx.jobDir, STAGE_DIRS.isolate, ARTIFACT_NAMES.leadVocals)
    : join(ctx.jobDir, STAGE_DIRS.separate, ARTIFACT_NAMES.vocals)
  const convertedLeadPath = join(ctx.jobDir, STAGE_DIRS.convert, ARTIFACT_NAMES.convertedVocals)
  const autoLeadMakeupGainDb = existsSync(convertedLeadPath) && existsSync(sourceLeadPath)
    ? await estimateLeadMakeupGainDb(convertedLeadPath, sourceLeadPath, ctx.signal)
    : 0

  const vocalGainDb = mix?.vocalGainDb ?? clamp((isMultiStem ? 2.0 : 0.5) + autoLeadMakeupGainDb, 0, 5)
  const instGainDb = mix?.instGainDb ?? (isMultiStem ? -5 : -2.5)

  const inputArgs = tracks.flatMap(t => ['-i', t.path])

  // Two-pass loudnorm: Pass 1 -- analyze
  const pass1LoudnormStr = `${buildLoudnormFilter(loudnormOptions)}:print_format=json`
  const pass1Filter = buildDynamicFilterComplex(tracks, pass1LoudnormStr, useDucking, vocalGainDb, instGainDb)
  const pass1Args = [...inputArgs, '-filter_complex', pass1Filter, '-f', 'null', '-']
  const pass1Result = await runFfmpeg(pass1Args, { signal: ctx.signal })

  let loudnormStr: string
  if (pass1Result.exitCode === 0) {
    const { parseLoudnormStats } = await import('../../adapters/ffmpeg/filters/normalize')
    const stats = parseLoudnormStats(pass1Result.stderr)
    loudnormStr = stats
      ? buildLoudnormFilterTwoPass(loudnormOptions, stats)
      : buildLoudnormFilter(loudnormOptions)
  }
  else {
    loudnormStr = buildLoudnormFilter(loudnormOptions)
  }

  // Pass 2 -- apply with measured stats, output as PCM_16
  const filterComplex = buildDynamicFilterComplex(tracks, loudnormStr, useDucking, vocalGainDb, instGainDb)
  const args = [
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-ar',
    '44100',
    '-acodec',
    'pcm_s16le',
    '-y',
    outputPath,
  ]

  const result = await runFfmpeg(args, { signal: ctx.signal })
  if (result.exitCode !== 0) {
    return {
      stage: PipelineStage.Remix,
      success: false,
      durationMs: 0,
      artifacts: [],
      error: `FFmpeg remix failed (exit ${result.exitCode}): ${result.stderr.slice(-2000)}`,
    }
  }

  ctx.metadata.set('mix_tracks', tracks.map(t => ({
    role: t.role,
    gain: t.gain,
    label: t.label,
  })))
  ctx.metadata.set('mix_auto_lead_makeup_gain_db', autoLeadMakeupGainDb)

  return {
    stage: PipelineStage.Remix,
    success: true,
    durationMs: 0,
    artifacts: [
      { path: `${STAGE_DIRS.mix}/${ARTIFACT_NAMES.finalCover}`, mimeType: 'audio/wav' },
    ],
  }
}

export { buildDynamicFilterComplex, discoverTracks }
