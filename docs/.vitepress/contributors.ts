import type { DefaultTheme } from 'vitepress'

import contributorNames from './contributor-names.json'

export interface Contributor {
  avatar: string
  name: string
}

export interface CoreTeam extends DefaultTheme.TeamMember {
  discord?: string
  // required to download avatars from GitHub
  github: string
  mastodon?: string
  twitter?: string
  youtube?: string
}

const contributorsAvatars: Record<string, string> = {}

function getAvatarUrl(name: string) {
  return `https://github.com/${name}.png`
}

export const contributors = (contributorNames as string[]).reduce((acc, name) => {
  contributorsAvatars[name] = getAvatarUrl(name)
  acc.push({ avatar: contributorsAvatars[name], name })
  return acc
}, [] as Contributor[])
function createLinks(tm: CoreTeam): CoreTeam {
  tm.links = [{ icon: 'github', link: `https://github.com/${tm.github}` }]
  if (tm.mastodon)
    tm.links.push({ icon: 'mastodon', link: tm.mastodon })

  if (tm.discord)
    tm.links.push({ icon: 'discord', link: tm.discord })

  if (tm.youtube)
    tm.links.push({ icon: 'youtube', link: `https://www.youtube.com/@${tm.youtube}` })

  if (tm.twitter)
    tm.links.push({ icon: 'twitter', link: `https://twitter.com/${tm.twitter}` })

  return tm
}

// TODO
const plainTeamMembers: CoreTeam[] = []

const teamMembers = plainTeamMembers.map(tm => createLinks(tm))

export { teamMembers }
