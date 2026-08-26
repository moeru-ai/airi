import type { OAuthProvider } from '../../libs/auth'

export interface SignInProviderDefinition {
  icon: string
  id: OAuthProvider
  name: string
}

export const defaultSignInProviders = [
  {
    icon: 'i-simple-icons-google',
    id: 'google',
    name: 'Google',
  },
  {
    icon: 'i-simple-icons-github',
    id: 'github',
    name: 'GitHub',
  },
  {
    icon: 'i-simple-icons-steam',
    id: 'steam',
    name: 'Steam',
  },
] satisfies SignInProviderDefinition[]
