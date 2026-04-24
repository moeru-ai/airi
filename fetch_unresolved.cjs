const { spawnSync } = require('node:child_process')

const query = `
query {
  repository(owner: "moeru-ai", name: "airi") {
    pullRequest(number: 1636) {
      reviewThreads(last: 80) {
        nodes {
          id
          isResolved
          comments(last: 1) {
            nodes {
              body
              author {
                login
              }
            }
          }
        }
      }
    }
  }
}
`

const result = spawnSync('gh', ['api', 'graphql', '-f', `query=${query}`], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

const data = JSON.parse(result.stdout)
const threads = data.data.repository.pullRequest.reviewThreads.nodes
const unresolved = threads.filter(t => !t.isResolved)

console.log(JSON.stringify(unresolved, null, 2))
