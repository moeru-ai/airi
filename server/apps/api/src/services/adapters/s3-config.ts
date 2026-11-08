import type { InferOutput } from 'valibot'

import { check, nonEmpty, object, optional, picklist, pipe, string, transform, url } from 'valibot'

/** Startup configuration for one private bucket. The API does not start without it. */
export const S3EnvironmentSchema = object({
  S3_BUCKET: pipe(string(), nonEmpty()),
  S3_REGION: pipe(string(), nonEmpty()),
  S3_ENDPOINT: optional(pipe(string(), url(), check((input) => {
    const endpoint = new URL(input)
    return ['http:', 'https:'].includes(endpoint.protocol)
      && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
  }, 'S3_ENDPOINT must be an HTTP(S) URL without credentials, query, or fragment'))),
  /** @default false */
  S3_FORCE_PATH_STYLE: optional(pipe(picklist(['true', 'false']), transform(value => value === 'true'))),
})

/** Parsed storage configuration. Credentials belong to the AWS default credential chain. */
export type S3Environment = InferOutput<typeof S3EnvironmentSchema>
