/**
 * Demo: use computer-use-mcp's terminal_exec tool via MCP client
 * to create a Python hello-world project and run it.
 */
import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  console.info('🚀 Starting computer-use-mcp server …')

  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['start'],
    cwd: packageDir,
    env: {
      ...env,
      // Use macos-local executor so terminal_exec actually runs commands
      COMPUTER_USE_EXECUTOR: 'macos-local',
      // Skip manual approval for this demo
      COMPUTER_USE_APPROVAL_MODE: 'never',
      COMPUTER_USE_SESSION_TAG: 'demo-hello-world',
      COMPUTER_USE_ALLOWED_BOUNDS: '0,0,2560,1600',
    },
    stderr: 'pipe',
  })

  const client = new Client({
    name: 'demo-hello-world-client',
    version: '0.1.0',
  })

  // Pipe server stderr so we can see logs
  transport.stderr?.on('data', (chunk: { toString: (enc: string) => string }) => {
    const text = chunk.toString('utf-8').trim()
    if (text) {
      console.error(`  [server] ${text}`)
    }
  })

  try {
    await client.connect(transport)
    console.info('✅ Connected to computer-use-mcp server')

    // 1. List available tools
    const tools = await client.listTools()
    console.info(`📋 Available tools (${tools.tools.length}):`)
    for (const t of tools.tools) {
      console.info(`   - ${t.name}`)
    }

    // 2. Step 1: Create folder + Python file via terminal_exec
    console.info('\n📁 Step 1: Creating folder ~/hello-python-project …')
    const mkdirResult = await client.callTool({
      name: 'terminal_exec',
      arguments: {
        command: 'mkdir -p ~/hello-python-project',
        timeoutMs: 10_000,
      },
    })
    printResult('mkdir', mkdirResult)

    // 3. Step 2: Write main.py
    console.info('\n📝 Step 2: Writing main.py …')
    const writeResult = await client.callTool({
      name: 'terminal_exec',
      arguments: {
        command: `cat > ~/hello-python-project/main.py << 'PYEOF'
#!/usr/bin/env python3
"""Hello World project — created by AIRI computer-use-mcp"""

def main():
    print("Hello World! 🌍")
    print("This project was created by AIRI computer-use-mcp terminal_exec tool.")

if __name__ == "__main__":
    main()
PYEOF`,
        timeoutMs: 10_000,
      },
    })
    printResult('write main.py', writeResult)

    // 4. Step 3: Run it!
    console.info('\n🐍 Step 3: Running python3 ~/hello-python-project/main.py …')
    const runResult = await client.callTool({
      name: 'terminal_exec',
      arguments: {
        command: 'python3 ~/hello-python-project/main.py',
        cwd: `${env.HOME}/hello-python-project`,
        timeoutMs: 15_000,
      },
    })
    printResult('run main.py', runResult)

    // 5. Step 4: Show the project structure
    console.info('\n📂 Step 4: Listing project contents …')
    const lsResult = await client.callTool({
      name: 'terminal_exec',
      arguments: {
        command: 'ls -la ~/hello-python-project && echo "---" && cat ~/hello-python-project/main.py',
        timeoutMs: 10_000,
      },
    })
    printResult('ls + cat', lsResult)

    console.info('\n🎉 Done! Python hello-world project created and executed via computer-use-mcp.')
  }
  finally {
    await client.close().catch(() => {})
  }
}

function printResult(label: string, result: unknown) {
  if (!result || typeof result !== 'object') {
    console.info(`  [${label}] (no result)`)
    return
  }

  const r = result as Record<string, unknown>

  // Print text content
  if (Array.isArray(r.content)) {
    for (const item of r.content) {
      if (item && typeof item === 'object' && 'text' in item) {
        console.info(`  [${label}] ${(item as { text: string }).text}`)
      }
    }
  }

  // Print structured content status
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    const sc = r.structuredContent as Record<string, unknown>
    if (sc.status) {
      console.info(`  [${label}] status=${sc.status}`)
    }
    if (sc.output && typeof sc.output === 'object') {
      const output = sc.output as Record<string, unknown>
      if (output.stdout) {
        console.info(`  [${label}] stdout: ${output.stdout}`)
      }
      if (output.stderr) {
        console.info(`  [${label}] stderr: ${output.stderr}`)
      }
    }
  }
}

main().catch((err) => {
  console.error('❌ Fatal:', err instanceof Error ? err.message : String(err))
  exit(1)
})
