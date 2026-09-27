import { parse, safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { S3EnvironmentSchema } from './s3-config'

describe('s3 configuration', () => {
  it('allows an API without object storage', () => {
    expect(parse(S3EnvironmentSchema, {})).toEqual({})
  })

  it('supports the default AWS credential chain', () => {
    const config = parse(S3EnvironmentSchema, { S3_BUCKET: 'private-bucket', S3_REGION: 'us-east-1' })
    expect(config.S3_ACCESS_KEY_ID).toBeUndefined()
    expect(config.S3_SECRET_ACCESS_KEY).toBeUndefined()
  })

  it('parses custom endpoints, temporary credentials, and URL expiry', () => {
    const config = parse(S3EnvironmentSchema, {
      S3_BUCKET: 'private-bucket',
      S3_REGION: 'auto',
      S3_ENDPOINT: 'https://objects.example.com',
      S3_FORCE_PATH_STYLE: 'true',
      S3_ACCESS_KEY_ID: 'test-access',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_SESSION_TOKEN: 'test-session',
      S3_SIGNED_URL_TTL_SECONDS: '60',
    })
    expect(config.S3_FORCE_PATH_STYLE).toBe(true)
    expect(config.S3_SIGNED_URL_TTL_SECONDS).toBe(60)
    expect(config.S3_SESSION_TOKEN).toBe('test-session')
  })

  it.each([
    { S3_BUCKET: 'bucket' },
    { S3_REGION: 'auto' },
    { S3_ENDPOINT: 'https://objects.example.com' },
    { S3_FORCE_PATH_STYLE: 'false' },
    { S3_ACCESS_KEY_ID: 'test-access' },
  ])('rejects partial storage configuration: %j', (input) => {
    expect(safeParse(S3EnvironmentSchema, input).success).toBe(false)
  })

  it.each([
    { S3_BUCKET: '' },
    { S3_REGION: '' },
    { S3_ACCESS_KEY_ID: 'test-access' },
    { S3_SECRET_ACCESS_KEY: 'test-secret' },
    { S3_SESSION_TOKEN: 'test-session' },
    { S3_ENDPOINT: 'ftp://objects.example.com' },
    { S3_ENDPOINT: 'https://user:password@objects.example.com' },
    { S3_ENDPOINT: 'https://objects.example.com?token=secret' },
    { S3_FORCE_PATH_STYLE: 'yes' },
    { S3_SIGNED_URL_TTL_SECONDS: '' },
    { S3_SIGNED_URL_TTL_SECONDS: '0' },
    { S3_SIGNED_URL_TTL_SECONDS: '604801' },
    { S3_SIGNED_URL_TTL_SECONDS: '1.5' },
    { S3_SIGNED_URL_TTL_SECONDS: 'NaN' },
  ])('rejects invalid settings: %j', (input) => {
    expect(safeParse(S3EnvironmentSchema, { S3_BUCKET: 'bucket', S3_REGION: 'auto', ...input }).success).toBe(false)
  })
})
