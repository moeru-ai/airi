const ENV_TRUTHY_PATTERN = /^(?:1|true|t|yes|y|on)$/i

/**
 * Returns true if the provided environment variable represents a truthy value.
 *
 * Truthy values: `true`, `t`, `yes`, `y`, `on`, `1`
 */
export function isEnvTruthy(value: string | undefined | null): boolean {
  if (value == null)
    return false
  return ENV_TRUTHY_PATTERN.test(value.trim())
}
