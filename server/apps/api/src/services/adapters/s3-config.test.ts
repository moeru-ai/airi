import { parse, safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { S3EnvironmentSchema } from './s3-config'

describe('s3 configuration', () => {
  it('allows an API without object storage', () => {
    expect(parse(S3EnvironmentSchema, {})).toEqual({})
  })

  it('supports the default AWS credential chain', () => {
    const config = parse(S3EnvironmentSchema, { S3_BUCKET: 'private-bucket', S3_REGION: 'us-east-1' })
    expect(config).toEqual({ S3_BUCKET: 'private-bucket', S3_REGION: 'us-east-1' })
  })

  it('parses custom endpoints and optional path-style addressing', () => {
    const config = parse(S3EnvironmentSchema, {
      S3_BUCKET: 'private-bucket',
      S3_REGION: 'auto',
      S3_ENDPOINT: 'https://objects.example.com',
      S3_FORCE_PATH_STYLE: 'true',
    })
    expect(config.S3_FORCE_PATH_STYLE).toBe(true)
    expect(config.S3_ENDPOINT).toBe('https://objects.example.com')
  })

  it.each([
    { S3_BUCKET: 'bucket' },
    { S3_REGION: 'auto' },
    { S3_ENDPOINT: 'https://objects.example.com' },
    { S3_FORCE_PATH_STYLE: 'false' },
  ])('rejects partial storage configuration: %j', (input) => {
    expect(safeParse(S3EnvironmentSchema, input).success).toBe(false)
  })

  it.each([
    { S3_BUCKET: '' },
    { S3_REGION: '' },
    { S3_ENDPOINT: 'ftp://objects.example.com' },
    { S3_ENDPOINT: 'https://user:password@objects.example.com' },
    { S3_ENDPOINT: 'https://objects.example.com?token=secret' },
    { S3_FORCE_PATH_STYLE: 'yes' },
  ])('rejects invalid settings: %j', (input) => {
    expect(safeParse(S3EnvironmentSchema, { S3_BUCKET: 'bucket', S3_REGION: 'auto', ...input }).success).toBe(false)
  })
})
