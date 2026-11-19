import process from 'node:process'

import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

interface Release {
  tag_name: string
  prerelease: boolean
  assets: { name: string }[]
}

interface Repository {
  owner: string
  repo: string
  source: string
}

/** Builds the Chinese mirror homepage without changing upstream documentation. */
export function renderGitcodeReadme(source: string, release: Release, repository: Repository): string {
  const base = `https://gitcode.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`
  const page = `${base}/releases/tag/${encodeURIComponent(release.tag_name)}`
  let content = source
    .replaceAll('./assets/', './docs/assets/')
    .replaceAll('./wechat.md', './docs/wechat.md')
    .replaceAll('../.github/', './.github/')
    .replaceAll('width="33%"', 'width="32%"')
    .replace(/^<picture>[\s\S]*?<\/picture>/, banner => `<p align="center">\n${banner.replace('width="250"', 'width="500"')}\n</p>`)

  for (const [platform, suffix] of [['windows', '-windows-x64-setup.exe'], ['macos', '-darwin-arm64.dmg']] as const) {
    const marker = `<!-- readme-section:release-binary-${platform} -->`
    const section = new RegExp(`(${marker}\\s*<a href=")[^"]+`)
    const asset = release.assets.find(item => item.name.endsWith(suffix))
    const target = asset ? `${base}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}` : page
    if (!section.test(content))
      throw new Error(`Missing README release section: ${platform}`)
    content = content.replace(section, `$1${target}`)
  }

  content = content.replaceAll(`https://github.com/${repository.source}/releases/latest`, page)
  const status = release.prerelease ? '当前预发布版' : '当前正式版'
  const label = release.tag_name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  content = content.replace('<p float="left" align="center">', `<p align="center">${status}：<a href="${page}">${label}</a>。</p>\n\n<p float="left" align="center">`)

  // NOTICE:
  // GitCode does not reliably render the optional Repobeats image.
  // The upstream homepage embeds a third-party analytics SVG.
  // Source: docs/README.zh-CN.md, project status section.
  // Removal condition: the SVG renders reliably on GitCode.
  const start = content.indexOf('\n## 项目状态\n')
  if (start !== -1) {
    const next = content.indexOf('\n## ', start + 1)
    const section = content.slice(start, next === -1 ? undefined : next)
    if (section.includes('repobeats.axiom.co'))
      content = content.slice(0, start) + (next === -1 ? '' : content.slice(next))
  }
  return content
}

/**
 * Generates README.md inside the disposable mirror checkout.
 *
 * Call stack:
 * main -> {@link renderGitcodeReadme} -> writeFile
 */
async function main(): Promise<void> {
  const [sourcePath, releasePath, outputPath, owner, repo, sourceRepository] = process.argv.slice(2)
  if (!sourcePath || !releasePath || !outputPath || !owner || !repo || !sourceRepository)
    throw new Error('Expected source, release, output, owner, repository, and upstream repository arguments')
  const release: Release = JSON.parse(await readFile(releasePath, 'utf8'))
  await writeFile(outputPath, renderGitcodeReadme(await readFile(sourcePath, 'utf8'), release, { owner, repo, source: sourceRepository }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
