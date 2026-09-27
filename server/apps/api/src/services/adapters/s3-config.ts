import type { InferOutput } from 'valibot'

import { check, nonEmpty, object, optional, picklist, pipe, string, transform, url } from 'valibot'

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
  }),
  check(config => Object.values(config).every(value => value === undefined) || Boolean(config.S3_BUCKET && config.S3_REGION), 'S3_BUCKET and S3_REGION are required when any S3 setting is present'),
)

/** Parsed storage configuration. Credentials belong to the AWS default credential chain. */
export type S3Environment = InferOutput<typeof S3EnvironmentSchema>
