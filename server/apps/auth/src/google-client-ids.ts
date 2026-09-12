import { array, pipe, regex, string, transform } from 'valibot'

/**
 * Parses explicit Google OAuth audiences without accepting arbitrary hosts or wildcard values.
 * Accepts legacy numeric IDs and IDs with a project suffix.
 *
 * @example
 * parse(GoogleNativeClientIdsSchema, ' 123.apps.googleusercontent.com,123.apps.googleusercontent.com, ')
 * // => ['123.apps.googleusercontent.com']
 */
export const GoogleNativeClientIdsSchema = pipe(
  string(),
  transform(raw => raw.split(',').map(value => value.trim()).filter(Boolean)),
  array(pipe(string(), regex(/^\d+(?:-[a-z0-9]+)?\.apps\.googleusercontent\.com$/, 'Invalid Google OAuth client ID'))),
  transform(values => [...new Set(values)]),
)

/**
 * Keeps the browser client first so native audiences do not change browser OAuth credentials.
 *
 * @example
 * googleClientIds('123.apps.googleusercontent.com', ['456-native.apps.googleusercontent.com', '123.apps.googleusercontent.com'])
 * // => ['123.apps.googleusercontent.com', '456-native.apps.googleusercontent.com']
 */
export function googleClientIds(browserClientId: string, nativeClientIds: string[] = []): string | string[] {
  if (nativeClientIds.length === 0)
    return browserClientId
  return [...new Set([browserClientId, ...nativeClientIds])]
}
