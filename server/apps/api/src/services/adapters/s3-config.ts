import type { InferOutput } from 'valibot'

import { check, integer, maxValue, minValue, nonEmpty, object, optional, picklist, pipe, string, transform, url } from 'valibot'

/** Startup configuration for one private bucket. An absent configuration disables object storage. */
export const S3EnvironmentSchema = pipe(
  object({
    S3_BUCKET: optional(pipe(string(), nonEmpty())),
    S3_REGION: optional(pipe(string(), nonEmpty())),
    S3_ENDPOINT: optional(pipe(string(), url(), check((input) => {
      const endpoint = new URL(input)
      return ['http:', 'https:'].includes(endpoint.protocol)
        && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
    }, 'S3_ENDPOINT must be an HTTP(S) URL without credentials, query, or fragment'))),
    /** @default false */
    S3_FORCE_PATH_STYLE: optional(pipe(picklist(['true', 'false']), transform(value => value === 'true'))),
    S3_ACCESS_KEY_ID: optional(pipe(string(), nonEmpty())),
    S3_SECRET_ACCESS_KEY: optional(pipe(string(), nonEmpty())),
    S3_SESSION_TOKEN: optional(pipe(string(), nonEmpty())),
    /** @default 900 */
    S3_SIGNED_URL_TTL_SECONDS: optional(pipe(string(), nonEmpty(), transform(Number), integer(), minValue(1), maxValue(604800))),
  }),
  check(config => Object.values(config).every(value => value === undefined) || Boolean(config.S3_BUCKET && config.S3_REGION), 'S3_BUCKET and S3_REGION are required when any S3 setting is present'),
  check(config => Boolean(config.S3_ACCESS_KEY_ID) === Boolean(config.S3_SECRET_ACCESS_KEY), 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together'),
  check(config => !config.S3_SESSION_TOKEN || Boolean(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY), 'S3_SESSION_TOKEN requires explicit S3 credentials'),
)

/** Parsed configuration. Omitted credentials select the AWS default credential chain. */
export type S3Environment = InferOutput<typeof S3EnvironmentSchema>
