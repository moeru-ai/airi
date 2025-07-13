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
    avatar: contributorsAvatars.zernonia,
    name: 'Zernonia',
    github: 'zernonia',
    twitter: 'zernonia',
    desc: 'Core team member of Radix Vue',
    sponsor: 'https://github.com/sponsors/zernonia',
  },
  {
    avatar: contributorsAvatars.k11q,
    name: 'Khairul Haaziq',
    github: 'k11q',
    twitter: 'khairulhaaziq',
    desc: 'Core team member of Radix Vue',
  },
  {
    avatar: contributorsAvatars.mujahidfa,
    name: 'Mujahid Anuar',
    github: 'mujahidfa',
    twitter: 'mujahid_fa',
    desc: 'Core team member of Radix Vue',
  },
  {
    avatar: contributorsAvatars.onmax,
    name: 'Max',
    github: 'onmax',
    twitter: 'iam_mad_max',
    desc: 'Core team member of Radix Vue',
  },
  {
    avatar: contributorsAvatars.MellKam,
    name: 'Artem Melnyk',
    github: 'MellKam',
    desc: 'Core team member of Radix Vue',
  },
  {
    avatar: contributorsAvatars.epr3,
    name: 'Eduard Predescu',
    github: 'epr3',
    desc: 'Core team member of Radix Vue',
  },
]

const teamMembers = plainTeamMembers.map(tm => createLinks(tm))

export { teamMembers }
