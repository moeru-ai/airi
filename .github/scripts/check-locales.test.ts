import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { checkLocales } from './check-locales'

const roots: string[] = []

/** Writes `{ 'en/settings.yaml': '...' }` style files into a new locales directory. */
async function locales(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'airi-locales-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

const english = [
  'onboarding:',
  '  notificationsTitle: Notifications',
  '  selectedFiles: Selected {count} files',
  'animation:',
  '  title: Animation',
  '  blink: Enable blink',
  '  toggle: Expression system',
].join('\n')

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('checkLocales', () => {
  // https://github.com/moeru-ai/airi/pull/2121
  it('reports translations that a Crowdin batch moved onto unrelated keys', async () => {
    // ROOT CAUSE:
    //
    // On 2026-07-18 a batch of zh-Hant suggestions in Crowdin landed on the wrong strings,
    // and the sync exported them unchecked.
    //
    //   animation.toggle: 已選取 {count} 個檔案
    //
    // We fixed this by checking each export. A moved translation repeats an unrelated key
    // or has placeholders that its English does not have.
    const base = await locales({
      'en/settings.yaml': english,
      'zh-Hant/settings.yaml': 'onboarding:\n  notificationsTitle: 通知\n  selectedFiles: 已選取 {count} 個檔案\n',
    })
    const root = await locales({
      'en/settings.yaml': english,
      'zh-Hant/settings.yaml': 'onboarding:\n  notificationsTitle: 通知\n  selectedFiles: 已選取 {count} 個檔案\nanimation:\n  blink: 通知\n  toggle: 已選取 {count} 個檔案\n',
    })

    const issues = await checkLocales({ root, baseRoot: base })

    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', locale: 'zh-Hant', key: 'animation.toggle' }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', locale: 'zh-Hant', key: 'animation.blink' }))
    expect(issues.filter(issue => issue.key.startsWith('onboarding.'))).toEqual([])
  })

  it('reports a key that the source locale does not have', async () => {
    const root = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n  removed: 削除済み\n',
    })

    const issues = await checkLocales({ root })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', locale: 'ja', key: 'animation.removed' })])
  })

  it('accepts a key that only the source locale has, because the apps fall back to English', async () => {
    const root = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })

    expect(await checkLocales({ root })).toEqual([])
  })

  it('reports a translation that drops a placeholder', async () => {
    const root = await locales({
      'en/settings.yaml': english,
      'zh-Hans/settings.yaml': 'onboarding:\n  selectedFiles: 已选择文件\n',
    })

    const issues = await checkLocales({ root })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', key: 'onboarding.selectedFiles' })])
  })

  it('treats a problem that the base already has as a warning', async () => {
    const files = {
      'en/settings.yaml': english,
      'zh-Hans/settings.yaml': 'onboarding:\n  selectedFiles: 已选择文件\n',
    }
    const base = await locales(files)
    const root = await locales(files)

    const issues = await checkLocales({ root, baseRoot: base })

    expect(issues).toEqual([expect.objectContaining({ level: 'warning', key: 'onboarding.selectedFiles' })])
  })

  it('reports an unchanged translation when its English gains a placeholder', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })
    const root = await locales({
      'en/settings.yaml': english.replace('title: Animation', 'title: Animation {name}'),
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })

    const issues = await checkLocales({ root, baseRoot: base })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', key: 'animation.title' })])
  })

  it('reports an unchanged translation when its English key is removed', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })
    const root = await locales({
      'en/settings.yaml': english.replace('  title: Animation\n', ''),
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })

    const issues = await checkLocales({ root, baseRoot: base })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', key: 'animation.title' })])
  })

  it('lets an English change outdate a translation, and lets the next sync clear it', async () => {
    const outdated = 'animation:\n  title: アニメーション\n'
    const before = await locales({ 'en/settings.yaml': english, 'ja/settings.yaml': outdated })
    const englishChange = await locales({
      'en/settings.yaml': english.replace('title: Animation', 'title: Animation {name}'),
      'ja/settings.yaml': outdated,
    })
    const syncExport = await locales({
      'en/settings.yaml': english.replace('title: Animation', 'title: Animation {name}'),
      'ja/settings.yaml': '{}\n',
    })

    // The pull request that edits English does not have to edit Japanese.
    const pullRequest = await checkLocales({ root: englishChange, baseRoot: before, sourceChanges: 'warning' })
    // Crowdin clears the outdated translation, and the sync may drop it from main.
    const sync = await checkLocales({ root: syncExport, baseRoot: englishChange })

    expect(pullRequest).toEqual([expect.objectContaining({ level: 'warning', key: 'animation.title' })])
    expect(sync).toEqual([])
  })

  it('reports a key that English removed as a warning when source changes are warnings', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })
    const root = await locales({
      'en/settings.yaml': english.replace('  title: Animation\n', ''),
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })

    const issues = await checkLocales({ root, baseRoot: base, sourceChanges: 'warning' })

    expect(issues).toEqual([expect.objectContaining({ level: 'warning', key: 'animation.title' })])
  })

  it('keeps reporting a changed translation as an error when source changes are warnings', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション\n',
    })
    const root = await locales({
      'en/settings.yaml': english,
      'ja/settings.yaml': 'animation:\n  title: アニメーション {count}\n',
    })

    const issues = await checkLocales({ root, baseRoot: base, sourceChanges: 'warning' })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', key: 'animation.title' })])
  })

  it('reports a translation that an export dropped while its English stayed the same', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'zh-Hans/settings.yaml': 'animation:\n  title: 动画\n  blink: Enable blink\n',
    })
    const root = await locales({
      'en/settings.yaml': english,
      'zh-Hans/settings.yaml': 'onboarding:\n  notificationsTitle: 通知\n',
    })

    const issues = await checkLocales({ root, baseRoot: base })

    // `animation.blink` held the English placeholder, so dropping it is intended.
    expect(issues).toEqual([expect.objectContaining({ level: 'error', key: 'animation.title' })])
  })

  it('accepts a dropped translation when its English changed', async () => {
    const base = await locales({
      'en/settings.yaml': english,
      'zh-Hans/settings.yaml': 'animation:\n  title: 动画\n',
    })
    const root = await locales({
      'en/settings.yaml': english.replace('title: Animation', 'title: Motion'),
      'zh-Hans/settings.yaml': 'onboarding:\n  notificationsTitle: 通知\n',
    })

    expect(await checkLocales({ root, baseRoot: base })).toEqual([])
  })

  it('reports a file that does not parse, such as one with a duplicate key', async () => {
    const root = await locales({
      'en/settings.yaml': english,
      'ko/settings.yaml': 'animation:\n  title: 애니메이션\n  title: 모션\n',
    })

    const issues = await checkLocales({ root })

    expect(issues).toEqual([expect.objectContaining({ level: 'error', locale: 'ko', file: 'settings.yaml', key: '' })])
  })
})
