import { describe, expect, it } from 'vitest'

import { renderGitcodeReadme } from './render-gitcode-readme'

const repository = { owner: 'example', repo: 'project', source: 'example/upstream' }
const release = {
  tag_name: 'v1.2.3',
  prerelease: false,
  assets: [{ name: 'AIRI-1.2.3-windows-x64-setup.exe' }, { name: 'AIRI-1.2.3-darwin-arm64.dmg' }],
}
const source = `<picture><img width="250" src="./assets/banner.avif" /></picture>
<a href="./wechat.md">Community</a>
<p float="left" align="center">
<!-- readme-section:release-binary-windows -->
<a href="https://github.com/example/upstream/releases/download/v0.1.0/old.exe"><img width="33%" src="./assets/windows.avif" /></a>
<!-- readme-section:release-binary-macos -->
<a href="https://github.com/example/upstream/releases/download/v0.1.0/old.dmg">macOS</a>
<a href="https://github.com/example/upstream/releases/latest">Linux</a>
</p>
## 项目状态
![Analytics](https://repobeats.axiom.co/example.svg)

## 鸣谢
Community contributors
`

describe('renderGitcodeReadme', () => {
  it('uses the selected stable release instead of stale upstream buttons', () => {
    const readme = renderGitcodeReadme(source, release, repository)

    expect(readme).toContain('当前正式版')
    expect(readme).toContain('https://gitcode.com/example/project/releases/download/v1.2.3/AIRI-1.2.3-windows-x64-setup.exe')
    expect(readme).toContain('https://gitcode.com/example/project/releases/download/v1.2.3/AIRI-1.2.3-darwin-arm64.dmg')
    expect(readme).toContain('https://gitcode.com/example/project/releases/tag/v1.2.3')
    expect(readme).not.toContain('releases/download/v0.1.0')
    expect(readme).not.toContain('github.com/example/upstream/releases/latest')
  })

  it('retains centered banner layout and relocates documentation assets', () => {
    const readme = renderGitcodeReadme(source, release, repository)

    expect(readme).toContain('<p align="center">\n<picture>')
    expect(readme).toContain('width="500"')
    expect(readme).toContain('width="32%"')
    expect(readme).toContain('./docs/assets/banner.avif')
    expect(readme).toContain('./docs/wechat.md')
    expect(readme).not.toContain('repobeats.axiom.co')
    expect(readme).toContain('## 鸣谢\nCommunity contributors')
  })

  it('links missing platform installers to the release page', () => {
    const readme = renderGitcodeReadme(source, { ...release, assets: [] }, repository)

    expect(readme).not.toContain('old.exe')
    expect(readme).not.toContain('old.dmg')
    expect(readme.match(/href="https:\/\/gitcode.com\/example\/project\/releases\/tag\/v1.2.3"/g)).toHaveLength(4)
  })

  it('fails instead of silently retaining stale links after a section changes', () => {
    expect(() => renderGitcodeReadme(source.replace('readme-section:release-binary-windows', 'another-section'), release, repository)).toThrow('Missing README release section: windows')
  })
})
