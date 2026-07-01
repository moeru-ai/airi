import type { OIDCFlowParams, OIDCFlowState, TokenResponse } from './auth-oidc'

export interface OIDCCallbackCompletionHandlers {
  consumeFlowState: () => { flowState: OIDCFlowState, params: OIDCFlowParams } | null
  exchangeCodeForTokens: (
    code: string,
    flowState: OIDCFlowState,
    params: OIDCFlowParams,
    returnedState: string,
  ) => Promise<TokenResponse>
  applyOIDCTokens: (tokens: TokenResponse, clientId: string) => Promise<void>
  fetchSession: () => Promise<boolean>
}

export async function completeOIDCCallbackUrl(
  callbackUrl: string,
  handlers: OIDCCallbackCompletionHandlers,
): Promise<void> {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam)
    throw new Error(url.searchParams.get('error_description') ?? errorParam)

  if (!code || !state)
    throw new Error('Missing OIDC code or state')

  const persisted = handlers.consumeFlowState()
  if (!persisted)
    throw new Error('Missing OIDC flow state')

  const tokens = await handlers.exchangeCodeForTokens(
    code,
    persisted.flowState,
    persisted.params,
    state,
  )
  await handlers.applyOIDCTokens(tokens, persisted.params.clientId)
  await handlers.fetchSession()
}
