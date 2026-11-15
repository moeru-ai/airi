import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const publisher = fileURLToPath(new URL('./publish-gitcode-release.sh', import.meta.url))
const helper = fileURLToPath(new URL('./sync-gitcode-repository.sh', import.meta.url))
const directories: string[] = []
const chinese = `<picture><img width="250" src="./assets/banner.avif" /></picture>
<p float="left" align="center">
<!-- readme-section:release-binary-windows -->
<a href="https://github.com/example/upstream/releases/download/v0.1.0/old.exe">Windows</a>
<!-- readme-section:release-binary-macos -->
<a href="https://github.com/example/upstream/releases/download/v0.1.0/old.dmg">macOS</a>
<a href="https://github.com/example/upstream/releases/latest">Linux</a>
</p>
`

/** Runs Git against disposable local repositories with a reserved fixture identity. */
async function git(directory: string, ...args: string[]) {
  const result = await execute('git', ['-C', directory, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Example',
      GIT_AUTHOR_EMAIL: 'user@example.com',
      GIT_COMMITTER_NAME: 'Example',
      GIT_COMMITTER_EMAIL: 'user@example.com',
    },
  })
  return result.stdout.trim()
}

/** Builds divergent mirror history and fake HTTP tools while keeping Git operations real. */
async function repositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'gitcode-repository-test-'))
  directories.push(root)
  const source = join(root, 'source')
  const mirror = join(root, 'mirror.git')
  const writer = join(root, 'writer')
  const bin = join(root, 'bin')
  await mkdir(source)
  await mkdir(bin)
  await mkdir(join(source, 'docs'))
  await git(source, 'init', '-b', 'main')
  await writeFile(join(source, 'README.md'), 'Upstream homepage\n')
  await writeFile(join(source, 'docs', 'README.zh-CN.md'), chinese)
  await writeFile(join(source, 'code.txt'), 'old\n')
  await git(source, 'add', '.')
  await git(source, 'commit', '-m', 'test: create upstream')
  await execute('git', ['clone', '--bare', source, mirror])
  await execute('git', ['clone', mirror, writer])
  await writeFile(join(writer, 'README.md'), 'Existing Chinese mirror homepage\n')
  await writeFile(join(writer, 'mirror-note.txt'), 'Keep this mirror content\n')
  await git(writer, 'add', '.')
  await git(writer, 'commit', '-m', 'test: customize mirror')
  await git(writer, 'push', 'origin', 'main')
  const previous = await git(writer, 'rev-parse', 'HEAD')
  await execute('git', ['--git-dir', mirror, 'update-ref', 'refs/tags/v1.2.3', previous])

  await writeFile(join(source, 'code.txt'), 'release\n')
  await git(source, 'add', '.')
  await git(source, 'commit', '-m', 'test: release code')
  await git(source, 'tag', '-a', 'v1.2.3', '-m', 'Release 1.2.3')
  const tag = await git(source, 'rev-parse', 'refs/tags/v1.2.3')
  await writeFile(join(source, 'code.txt'), 'latest\n')
  await git(source, 'add', '.')
  await git(source, 'commit', '-m', 'test: latest code')

  const release = {
    tag_name: 'v1.2.3',
    prerelease: false,
    draft: false,
    assets: [
      { name: 'AIRI-1.2.3-windows-x64-setup.exe', size: 5, digest: `sha256:${'a'.repeat(64)}` },
      { name: 'latest-x64.yml', size: 7, digest: `sha256:${'b'.repeat(64)}` },
    ],
  }
  await writeFile(join(root, 'release.json'), JSON.stringify(release))
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env node
process.stdout.write(require('node:fs').readFileSync(process.env.FIXTURE_RELEASE))
`, { mode: 0o755 })
  await writeFile(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const config = fs.readFileSync(args[args.indexOf('--config')+1], 'utf8')
const release = JSON.parse(fs.readFileSync(process.env.FIXTURE_RELEASE, 'utf8'))
if (process.env.FIXTURE_INCOMPLETE) release.assets = []
if (process.env.FIXTURE_MISSING_FEED) release.assets = release.assets.filter(asset => !asset.name.startsWith('latest-'))
process.stdout.write(config.includes('/api/v5/user"') ? JSON.stringify({login:'example'}) : JSON.stringify(release))
`, { mode: 0o755 })
  return { root, source, mirror, writer, bin, previous, tag }
}

/** Exercises production shell functions with local Git remotes and fake API responses. */
async function synchronize(fixture: Awaited<ReturnType<typeof repositoryFixture>>, run: string, extraEnv: Record<string, string> = {}) {
  const directory = join(fixture.root, run)
  await mkdir(directory)
  return execute('bash', ['-c', 'source "$1"; source "$2"; mkdir -p "$WORK_DIR"; trap cleanup_gitcode_credentials EXIT; prepare_gitcode_repository; printf "protocol=https\\nhost=gitcode.com\\n\\n" | mirror_git credential fill > /dev/null; sync_gitcode_tag; sync_gitcode_repository', 'test', publisher, helper], {
    env: {
      ...process.env,
      PATH: `${fixture.bin}${delimiter}${process.env.PATH}`,
      RUNNER_TEMP: directory,
      GITCODE_RELEASE_TAG: 'v1.2.3',
      GITCODE_TOKEN: 'fixture-token',
      GITCODE_OWNER: 'example',
      GITCODE_REPO: 'project',
      GITHUB_REPOSITORY: 'example/upstream',
      GITCODE_REPOSITORY_URL: fixture.mirror,
      GITHUB_REPOSITORY_URL: fixture.source,
      FIXTURE_RELEASE: join(fixture.root, 'release.json'),
      ...extraEnv,
    },
    maxBuffer: 1024 * 1024,
  })
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('gitCode repository synchronization', () => {
  it('repairs annotated tags, updates source, preserves mirror history, and reruns without another commit', async () => {
    const fixture = await repositoryFixture()
    await synchronize(fixture, 'first')
    const head = (await execute('git', ['--git-dir', fixture.mirror, 'rev-parse', 'refs/heads/main'])).stdout.trim()
    const mirroredTag = (await execute('git', ['--git-dir', fixture.mirror, 'rev-parse', 'refs/tags/v1.2.3'])).stdout.trim()
    const readme = (await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:README.md'])).stdout

    expect(mirroredTag).toBe(fixture.tag)
    expect((await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:code.txt'])).stdout).toBe('latest\n')
    expect((await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:mirror-note.txt'])).stdout).toBe('Keep this mirror content\n')
    expect(readme).toContain('当前正式版')
    expect(readme).toContain('./docs/assets/banner.avif')
    expect(readme).toContain('gitcode.com/example/project/releases/download/v1.2.3/')
    await execute('git', ['--git-dir', fixture.mirror, 'merge-base', '--is-ancestor', fixture.previous, head])
    await synchronize(fixture, 'second')

    expect((await execute('git', ['--git-dir', fixture.mirror, 'rev-parse', 'refs/heads/main'])).stdout.trim()).toBe(head)
    const config = await readFile(join(fixture.root, 'first', 'gitcode-release-v1.2.3', 'repository', '.git', 'config'), 'utf8')
    expect(config).not.toContain('fixture-token')
    await expect(readFile(join(fixture.root, 'first', 'gitcode-release-v1.2.3', 'git-askpass.sh'))).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30000)

  it('does not publish a homepage for incomplete stable assets', async () => {
    const fixture = await repositoryFixture()

    await expect(synchronize(fixture, 'incomplete', { FIXTURE_INCOMPLETE: '1' })).rejects.toThrow()
    expect((await execute('git', ['--git-dir', fixture.mirror, 'rev-parse', 'refs/heads/main'])).stdout.trim()).toBe(fixture.previous)
  }, 30000)

  it('requires the stable updater feeds as well as the installers', async () => {
    const fixture = await repositoryFixture()

    await expect(synchronize(fixture, 'missing-feed', { FIXTURE_MISSING_FEED: '1' })).rejects.toThrow()
    expect((await execute('git', ['--git-dir', fixture.mirror, 'rev-parse', 'refs/heads/main'])).stdout.trim()).toBe(fixture.previous)
  }, 30000)

  it('keeps stable homepage links when a newer prerelease is synchronized', async () => {
    const fixture = await repositoryFixture()
    await git(fixture.source, 'tag', '-a', 'v1.3.0', '-m', 'Next prerelease')
    await synchronize(fixture, 'prerelease', { GITCODE_RELEASE_TAG: 'v1.3.0' })
    const readme = (await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:README.md'])).stdout

    expect(readme).toContain('releases/download/v1.2.3/')
    expect(readme).not.toContain('v1.3.0')
  }, 30000)

  it('retries a rejected main push and retains the competing mirror commit', async () => {
    const fixture = await repositoryFixture()
    const realGit = (await execute('which', ['git'])).stdout.trim()
    await writeFile(join(fixture.bin, 'git'), `#!/usr/bin/env node
const fs = require('node:fs')
const child = require('node:child_process')
const args = process.argv.slice(2)
const marker = process.env.FIXTURE_RACE_MARKER
if (args.includes('push') && args.includes('HEAD:refs/heads/main') && !fs.existsSync(marker)) {
  fs.writeFileSync(marker, 'started')
  fs.writeFileSync(process.env.FIXTURE_WRITER + '/concurrent.txt', 'Concurrent mirror change\\n')
  const options = {cwd:process.env.FIXTURE_WRITER,env:{...process.env,GIT_AUTHOR_NAME:'Example',GIT_AUTHOR_EMAIL:'user@example.com',GIT_COMMITTER_NAME:'Example',GIT_COMMITTER_EMAIL:'user@example.com'}}
  child.execFileSync(process.env.FIXTURE_REAL_GIT, ['add', 'concurrent.txt'], options)
  child.execFileSync(process.env.FIXTURE_REAL_GIT, ['commit', '-m', 'test: competing mirror update'], options)
  child.execFileSync(process.env.FIXTURE_REAL_GIT, ['push', 'origin', 'main'], options)
}
const result = child.spawnSync(process.env.FIXTURE_REAL_GIT, args, {stdio:'inherit'})
process.exitCode = result.status ?? 1
`, { mode: 0o755 })
    const result = await synchronize(fixture, 'concurrent', {
      FIXTURE_RACE_MARKER: join(fixture.root, 'race-marker'),
      FIXTURE_WRITER: fixture.writer,
      FIXTURE_REAL_GIT: realGit,
    })

    expect(result.stderr).toContain('[rejected]')
    expect((await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:concurrent.txt'])).stdout).toBe('Concurrent mirror change\n')
    expect((await execute('git', ['--git-dir', fixture.mirror, 'show', 'main:code.txt'])).stdout).toBe('latest\n')
  }, 30000)
})
