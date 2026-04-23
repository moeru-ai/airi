const { spawnSync } = require('node:child_process')

const threadIds = ['PRRT_kwDONXX6d856WL8y', 'PRRT_kwDONXX6d856WL8z', 'PRRT_kwDONXX6d856YK0-', 'PRRT_kwDONXX6d856YrgP', 'PRRT_kwDONXX6d856YrgS', 'PRRT_kwDONXX6d856ZduQ', 'PRRT_kwDONXX6d856Zyjb', 'PRRT_kwDONXX6d856aNKB', 'PRRT_kwDONXX6d856aNKD', 'PRRT_kwDONXX6d856mkRL', 'PRRT_kwDONXX6d856m1vw', 'PRRT_kwDONXX6d857VXLZ', 'PRRT_kwDONXX6d857VXg4', 'PRRT_kwDONXX6d857VXzo', 'PRRT_kwDONXX6d857VYpm', 'PRRT_kwDONXX6d857VbrX', 'PRRT_kwDONXX6d857Ve0U', 'PRRT_kwDONXX6d857Ve9W', 'PRRT_kwDONXX6d857VgLn', 'PRRT_kwDONXX6d857VoCh', 'PRRT_kwDONXX6d857VoCk', 'PRRT_kwDONXX6d857Vy0a', 'PRRT_kwDONXX6d857Vy0e', 'PRRT_kwDONXX6d857WRc7', 'PRRT_kwDONXX6d857kJZh', 'PRRT_kwDONXX6d858QUpY', 'PRRT_kwDONXX6d858ThuI', 'PRRT_kwDONXX6d858ThuO', 'PRRT_kwDONXX6d859F2ft']

for (const id of threadIds) {
  console.log(`Resolving thread: ${id}`)
  const query = `mutation { resolveReviewThread(input: { threadId: "${id}" }) { thread { id isResolved } } }`
  const result = spawnSync('gh', ['api', 'graphql', '-f', `query=${query}`], { stdio: ['pipe', 'inherit', 'inherit'], input: '', shell: false })
  if (result.status !== 0) {
    console.error(`Failed to resolve thread ${id}`)
  }
}
