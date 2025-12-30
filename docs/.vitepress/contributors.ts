import type { DefaultTheme } from 'vitepress'

import contributorNames from './contributor-names.json'

export interface Contributor {
  name: string
  avatar: string
}

export interface CoreTeam extends DefaultTheme.TeamMember {
  // required to download avatars from GitHub
  github: string
  twitter?: string
  mastodon?: string
  discord?: string
  youtube?: string
}

const contributorsAvatars: Record<string, string> = {}

function getAvatarUrl(name: string) {
  return `https://github.com/${name}.png`
}

function resolveAvatar(name: string) {
  return contributorsAvatars[name] ?? getAvatarUrl(name)
}

export const contributors = (contributorNames as string[]).reduce((acc, name) => {
  contributorsAvatars[name] = getAvatarUrl(name)
  acc.push({ name, avatar: contributorsAvatars[name] })
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

const plainTeamMembers: CoreTeam[] = [
  {
    name: 'nekomeowww',
    avatar: resolveAvatar('nekomeowww'),
    github: 'nekomeowww',
    title: 'Core Maintainer',
    twitter: 'nekomeowww',
  },
  {
    name: 'luoling8192',
    avatar: resolveAvatar('luoling8192'),
    github: 'luoling8192',
    title: 'Core Maintainer',
  },
  {
    name: 'LemonNeko',
    avatar: resolveAvatar('LemonNekoGH'),
    github: 'LemonNekoGH',
    title: 'Engineer',
  },
  {
    name: 'kwaa',
    avatar: resolveAvatar('kwaa'),
    github: 'kwaa',
    title: 'Engineer',
  },
  {
    name: 'sumimakito',
    avatar: resolveAvatar('sumimakito'),
    github: 'sumimakito',
    title: 'Engineer',
  },
  {
    name: 'junkwarrior87',
    avatar: resolveAvatar('junkwarrior87'),
    github: 'junkwarrior87',
    title: 'Engineer',
  },
  {
    name: 'Menci',
    avatar: resolveAvatar('Menci'),
    github: 'Menci',
    title: 'Engineer',
  },
]

const teamMembers = plainTeamMembers.map(tm => createLinks(tm))

export { teamMembers }
