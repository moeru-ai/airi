export type IOSSignInHandler = (authorizeUrl: string) => Promise<void>

let iosSignInHandler: IOSSignInHandler | null = null

export function configureIOSSignIn(handler: IOSSignInHandler | null): void {
  iosSignInHandler = handler
}

export function getIOSSignInHandler(): IOSSignInHandler | null {
  return iosSignInHandler
}
