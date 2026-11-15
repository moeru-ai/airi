import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('./publish-gitcode-release.sh', import.meta.url))
const temporaryDirectories: string[] = []

/** Creates command-boundary fixtures without contacting either hosting service. */
async function releaseFixture(patchStatus = '200', latestTag = 'v1.2.3') {
  const directory = await mkdtemp(join(tmpdir(), 'gitcode-release-test-'))
  temporaryDirectories.push(directory)
  await writeFile(join(directory, 'gh'), `#!/usr/bin/env node
process.stdout.write(process.argv[2] === 'api' ? process.env.TEST_LATEST_TAG : JSON.stringify({tagName:'v1.2.3',name:'Release 1.2.3',body:'Release notes',isPrerelease:false}))
`, { mode: 0o755 })
  await writeFile(join(directory, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const method = args[args.indexOf('-X') + 1]
const output = args[args.indexOf('-o') + 1]
fs.appendFileSync(process.env.TEST_REQUESTS, JSON.stringify({method,config:fs.readFileSync(args[args.indexOf('--config') + 1],'utf8'),body:JSON.parse(fs.readFileSync(args[args.indexOf('--data') + 1].slice(1),'utf8'))})+'\\n')
fs.writeFileSync(output, method === 'POST' ? JSON.stringify({error_code:409,error_message:'Release already exists'}) : '{}')
process.stdout.write(method === 'POST' ? '409' : process.env.TEST_PATCH_STATUS)
`, { mode: 0o755 })
  return {
    directory,
    requests: join(directory, 'requests.jsonl'),
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      RUNNER_TEMP: directory,
      GITCODE_RELEASE_TAG: 'v1.2.3',
      GITCODE_TOKEN: 'test-token',
      GITCODE_OWNER: 'example',
      GITCODE_REPO: 'project',
      GITCODE_TARGET_COMMITISH: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      TEST_REQUESTS: join(directory, 'requests.jsonl'),
      TEST_PATCH_STATUS: patchStatus,
      TEST_LATEST_TAG: latestTag,
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('gitCode release promotion', () => {
  it('updates an existing prerelease with the current formal release metadata', async () => {
    const fixture = await releaseFixture()
    await execute('bash', ['-c', 'source "$1"; mkdir -p "$WORK_DIR"; ensure_gitcode_release', 'test', script], { env: fixture.env })
    const requests = (await readFile(fixture.requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line))

    expect(requests.map(request => request.method)).toEqual(['POST', 'PATCH'])
    expect(requests[1].body).toMatchObject({ name: 'Release 1.2.3', body: 'Release notes', release_status: 'latest' })
    expect(requests[1].config).toContain('/releases/v1.2.3')
    expect(requests[1].config).not.toContain('/releases/tags/')
  }, 15000)

  it('keeps an older formal release from replacing the latest release', async () => {
    const fixture = await releaseFixture('200', 'v1.2.4')
    await execute('bash', ['-c', 'source "$1"; mkdir -p "$WORK_DIR"; ensure_gitcode_release', 'test', script], { env: fixture.env })
    const requests = (await readFile(fixture.requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line))

    expect(requests[1].body.release_status).toBe('none')
  }, 15000)

  it('fails when updating existing release metadata fails', async () => {
    const fixture = await releaseFixture('503')

    await expect(execute('bash', ['-c', 'source "$1"; mkdir -p "$WORK_DIR"; ensure_gitcode_release', 'test', script], { env: fixture.env })).rejects.toThrow()
  }, 15000)

  it('rejects release metadata that still reports a prerelease after promotion', async () => {
    const fixture = await releaseFixture()
    const work = join(fixture.directory, 'gitcode-release-v1.2.3')
    await execute('mkdir', ['-p', work])
    const expected = { tag_name: 'v1.2.3', name: 'Release 1.2.3', body: 'Release notes', release_status: 'latest' }
    await writeFile(join(work, 'gitcode-release.json'), JSON.stringify(expected))
    await writeFile(join(work, 'gitcode-release-current.json'), JSON.stringify({ ...expected, release_status: 'pre', prerelease: true }))

    await expect(execute('bash', ['-c', 'source "$1"; verify_gitcode_release_metadata', 'test', script], { env: fixture.env })).rejects.toThrow()
  })
})

describe('gitCode release workflow', () => {
  it('mirrors formal promotions without requiring another installer build', async () => {
    const workflow = parse(await readFile(new URL('../workflows/release-tamagotchi.yml', import.meta.url), 'utf8'))
    const condition: string = workflow.jobs['publish-gitcode-release'].if

    expect(workflow.on.release.types).toContain('released')
    expect(condition).toContain('github.event.action == \'released\'')
    expect(condition).not.toContain('github.event.release.prerelease')
    expect(condition).not.toContain('needs.build.result == \'success\'')
  })

  it('serializes all mirror entry points for the same release', async () => {
    for (const name of ['release-tamagotchi.yml', 'release-pocket-ios.yml', 'release-pocket-android.yml']) {
      const workflow = parse(await readFile(new URL(`../workflows/${name}`, import.meta.url), 'utf8'))
      const job = workflow.jobs['publish-gitcode-release']

      expect(job.concurrency.group).toContain('gitcode-release-')
      expect(job.concurrency['cancel-in-progress']).toBe(false)
      expect(job.steps.some((step: { uses?: string }) => step.uses === 'actions/setup-node@v6')).toBe(true)
    }
  })

  it('keeps Android mirroring independent from an itch.io failure', async () => {
    const workflow = parse(await readFile(new URL('../workflows/release-pocket-android.yml', import.meta.url), 'utf8'))
    const mirror = workflow.jobs['publish-gitcode-release']

    expect(workflow.jobs.build.outputs.gitcode_tag).toContain('steps.upload-github-release.outcome == \'success\'')
    expect(mirror.needs).toBe('build')
    expect(mirror.if).toContain('always()')
    expect(mirror.if).toContain('needs.build.outputs.gitcode_tag != \'\'')
    expect(mirror.if).not.toContain('needs.build.result == \'success\'')
  })

  it('provides a manual backfill that runs current scripts without building installers', async () => {
    const workflow = parse(await readFile(new URL('../workflows/sync-gitcode.yml', import.meta.url), 'utf8'))
    const job = workflow.jobs.sync
    const checkout = job.steps.find((step: { uses?: string }) => step.uses === 'actions/checkout@v6')
    const publish = job.steps.find((step: { run?: string }) => step.run === 'bash .github/scripts/publish-gitcode-release.sh')

    expect(workflow.on.workflow_dispatch.inputs.tag.required).toBe(true)
    expect(checkout.with.ref).toBe('main')
    expect(checkout.with['persist-credentials']).toBe(false)
    expect(workflow.permissions.contents).toBe('read')
    expect(publish.env.GITCODE_RELEASE_TAG).toContain('inputs.tag')
    expect(workflow.jobs.build).toBeUndefined()
  })
})
