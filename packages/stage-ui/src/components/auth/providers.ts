import type { OAuthProvider } from '../../libs/auth'

export interface OAuthProviderDefinition {
  id: OAuthProvider
  name: string
  icon: string
}

/** Catalog id for connected-account rows (OAuth providers plus Steam). */
export type SignInProviderId = OAuthProvider | 'steam'

export interface SignInProviderDefinition {
  id: SignInProviderId
  name: string
  icon: string
}

export const oauthProviders: OAuthProviderDefinition[] = [
  {
    id: 'google',
    name: 'Google',
    icon: 'i-simple-icons-google',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'i-simple-icons-github',
  },
]

export const defaultSignInProviders: SignInProviderDefinition[] = [
  ...oauthProviders,
  {
    id: 'steam',
    name: 'Steam',
    icon: 'i-simple-icons-steam',
  },
]

export function isOAuthProviderId(id: SignInProviderId): id is OAuthProvider {
  return id === 'google' || id === 'github'
}
