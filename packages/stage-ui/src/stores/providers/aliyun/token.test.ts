import { env } from 'node:process'

import { utc } from '@date-fns/utc'
import { isAfter, parse } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  buildCreateTokenRequest,
  canonicalizeQuery,
  createStringToSign,
  createToken,
  signStringToBase64,
} from './token'

describe('buildCreateTokenRequest', () => {
  const testParameters = {
    AccessKeyId: 'my_access_key_id',
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: 'b924c8c3-6d03-4c5d-ad36-d984d3116788',
    SignatureVersion: '1.0',
    Timestamp: '2019-04-18T08:32:31Z',
    Version: '2019-02-28',
  }

  const expectedCanonicalQuery = 'AccessKeyId=my_access_key_id&Action=CreateToken&Format=JSON&RegionId=cn-shanghai&SignatureMethod=HMAC-SHA1&SignatureNonce=b924c8c3-6d03-4c5d-ad36-d984d3116788&SignatureVersion=1.0&Timestamp=2019-04-18T08%3A32%3A31Z&Version=2019-02-28'
  const expectedBuiltQueryString = 'GET&%2F&AccessKeyId%3Dmy_access_key_id%26Action%3DCreateToken%26Format%3DJSON%26RegionId%3Dcn-shanghai%26SignatureMethod%3DHMAC-SHA1%26SignatureNonce%3Db924c8c3-6d03-4c5d-ad36-d984d3116788%26SignatureVersion%3D1.0%26Timestamp%3D2019-04-18T08%253A32%253A31Z%26Version%3D2019-02-28'
  const expectedSignature = 'hHq4yNsPitlfDJ2L0nQPdugdEzM='
  const expectedSignatureEncoded = encodeURIComponent(expectedSignature)
  const expectedSignedQuery = `Signature=${expectedSignatureEncoded}&${expectedCanonicalQuery}`
  const expectedUrl = `http://nls-meta.cn-shanghai.aliyuncs.com/?${expectedSignedQuery}`

  it('builds canonical query string matching the Java implementation', () => {
    const canonical = canonicalizeQuery(testParameters)
    expect(canonical).toBe(expectedCanonicalQuery)
  })

  it('creates the expected string to sign', () => {
    const canonical = canonicalizeQuery(testParameters)
    const stringToSign = createStringToSign('GET', '/', canonical)
    expect(stringToSign).toBe(expectedBuiltQueryString)
  })

  it('produces the expected signature', async () => {
    const signature = await signStringToBase64(expectedBuiltQueryString, 'my_access_key_secret')
    expect(signature).toBe(expectedSignature)
    expect(encodeURIComponent(signature)).toBe(expectedSignatureEncoded)
  })

  it('constructs the full token request data', async () => {
    const request = await buildCreateTokenRequest(
      'my_access_key_id',
      'my_access_key_secret',
      {
        timestamp: parse(testParameters.Timestamp, 'yyyy-MM-dd\'T\'HH:mm:ssX', new Date()),
        signatureNonce: testParameters.SignatureNonce,
      },
    )

    expect(request.canonicalQuery).toBe(expectedCanonicalQuery)
    expect(request.stringToSign).toBe(expectedBuiltQueryString)
    expect(request.signature).toBe(expectedSignature)
    expect(request.encodedSignature).toBe(expectedSignatureEncoded)
    expect(request.signedQuery).toBe(expectedSignedQuery)
    expect(request.url).toBe(expectedUrl)
    expect(request.params.Signature).toBe(expectedSignature)
  })
})

describe('createToken', (test) => {
  it('successfully fetches a token', async () => {
    if (!env.ALIYUN_AK_ID || !env.ALIYUN_AK_SECRET) {
      test.skip('ALIYUN_AK_ID and ALIYUN_AK_SECRET must be set in environment to run this test', () => {})
      return
    }

    const { token, expiresAt } = await createToken(env.ALIYUN_AK_ID!, env.ALIYUN_AK_SECRET!)
    expect(token).toBeDefined()
    expect(token).toBeTypeOf('string')
    expect(expiresAt).toBeTypeOf('number')
    expect(isAfter(new Date(expiresAt), utc(new Date()))).toBe(true)
  })
})
