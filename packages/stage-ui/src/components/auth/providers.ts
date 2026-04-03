import type { OAuthProvider } from '../../libs/auth'

export interface SignInProviderDefinition {
  id: OAuthProvider
  name: string
  icon: string
}

export const defaultSignInProviders = [
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
] satisfies SignInProviderDefinition[]
