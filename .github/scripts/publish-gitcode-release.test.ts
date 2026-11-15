import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('./publish-gitcode-release.sh', import.meta.url))
const temporaryDirectories: string[] = []

/** Creates command-boundary fixtures without contacting either hosting service. */
async function releaseFixture(latestTag: string) {
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
process.stdout.write(method === 'POST' ? '409' : '200')
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
      TEST_LATEST_TAG: latestTag,
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('gitCode release promotion', () => {
  it.each([['v1.2.3', 'latest'], ['v1.2.4', 'none']])('updates formal metadata when the latest tag is %s', async (latestTag, status) => {
    const fixture = await releaseFixture(latestTag)
    await execute('bash', ['-c', 'source "$1"; mkdir -p "$WORK_DIR"; ensure_gitcode_release', 'test', script], { env: fixture.env })
    const requests = (await readFile(fixture.requests, 'utf8')).trim().split('\n').map(line => JSON.parse(line))

    expect(requests.map(request => request.method)).toEqual(['POST', 'PATCH'])
    expect(requests[1].body).toMatchObject({ name: 'Release 1.2.3', body: 'Release notes', release_status: status })
    expect(requests[1].config).toContain('/releases/v1.2.3')
    expect(requests[1].config).not.toContain('/releases/tags/')
  }, 15000)
})
