import fs from 'node:fs/promises'
import path from 'node:path'

import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ScenarioStep {
  name: string
  action: 'inject_chat' | 'inject_event' | 'wait'
  params?: any
  expect?: {
    log_contains?: string
    last_action_tool?: string
  }
}

interface Scenario {
  name: string
  steps: ScenarioStep[]
}

async function runScenario(scenarioPath: string) {
  const content = await fs.readFile(scenarioPath, 'utf-8')
  const scenario: Scenario = JSON.parse(content)

  console.log(`\n🏃 Running Scenario: ${scenario.name}`)
  console.log('='.repeat(50))

  const transport = new SSEClientTransport(new URL('http://localhost:3001/sse'))
  const client = new Client({
    name: 'test-harness',
    version: '1.0.0',
  }, {
    capabilities: {},
  })

  try {
    await client.connect(transport)
    console.log('✅ Connected to Bot MCP')

    for (const [index, step] of scenario.steps.entries()) {
      console.log(`\n[Step ${index + 1}] ${step.name}`)

      // Execute Action
      if (step.action === 'wait') {
        const ms = step.params?.ms || 1000
        console.log(`   ⏳ Waiting ${ms}ms...`)
        await new Promise(resolve => setTimeout(resolve, ms))
      }
      else if (step.action === 'inject_chat') {
        console.log(`   💉 Injecting chat: "${step.params.message}"`)
        await client.callTool({
          name: 'inject_chat',
          arguments: step.params,
        })
      }
      else if (step.action === 'inject_event') {
        console.log(`   💉 Injecting event: ${step.params.type}`)
        await client.callTool({
          name: 'inject_event',
          arguments: step.params,
        })
      }

      // Assertions
      if (step.expect) {
        // Wait a bit for processing before asserting
        await new Promise(resolve => setTimeout(resolve, 2000))

        if (step.expect.log_contains) {
          const logsResource = await client.readResource({ uri: 'brain://logs' })
          const logsText = logsResource.contents[0].text
          const logs = JSON.parse(logsText)

          // Check if any recent log contains the text
          const found = logs.some((entry: any) =>
            (entry.text && entry.text.includes(step.expect!.log_contains))
            || (JSON.stringify(entry.metadata).includes(step.expect!.log_contains)),
          )

          if (found) {
            console.log(`   ✅ Assertion passed: Logs contain "${step.expect.log_contains}"`)
          }
          else {
            console.error(`   ❌ Assertion failed: Logs DO NOT contain "${step.expect.log_contains}"`)
            console.error('Recent logs:', logs.slice(-3))
            process.exit(1)
          }
        }
      }
    }

    console.log('\n✨ Scenario Passed Successfully!')
  }
  catch (error) {
    console.error('\n💥 Error running scenario:', error)
    process.exit(1)
  }
  finally {
    await client.close()
  }
}

// CLI entry point
const targetFile = process.argv[2]
if (!targetFile) {
  console.error('Usage: tsx scripts/test-harness.ts <scenario-file>')
  process.exit(1)
}

runScenario(path.resolve(process.cwd(), targetFile))
