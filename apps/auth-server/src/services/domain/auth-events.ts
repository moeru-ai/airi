export interface AuthEventInput {
  userId: string
  action: 'user_signed_up' | 'session_started'
  source: 'better-auth.user.create' | 'better-auth.session.create'
}

/** Best-effort port for forwarding auth lifecycle facts to the resource API. */
export interface AuthEventService {
  track: (input: AuthEventInput) => Promise<void>
}
