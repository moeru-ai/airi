import { promises as fs } from 'node:fs'

interface Contributor {
  login: string
}

async function fetchContributors(page = 1) {
  const collaborators: string[] = []

  const res = await fetch(`https://api.github.com/repos/moeru-ai/airi/contributors?per_page=100&page=${page}`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (!res.ok) {
    console.error(`Failed to fetch contributors page #${page}: ${res.status} ${res.statusText} ${await res.text()}`)
    return []
  }

  const data: Contributor[] = await res.json()

  collaborators.push(...data.map(contributor => contributor.login))
  if (res.headers.get('Link')?.includes('rel=\"next\"'))
    collaborators.push(...(await fetchContributors(page + 1)))
  return collaborators.filter(name => !name.includes('[bot]'))
}

async function generate() {
  const collaborators = await fetchContributors()
  await fs.writeFile('.vitepress/contributor-names.json', `${JSON.stringify(collaborators, null, 2)}\n`, 'utf8')
}

generate()
