import type { InferOutput } from 'valibot'

import { errorMessageFrom } from '@moeru/std'
import { ofetch } from 'ofetch'
import { looseObject, minLength, number, object, optional, picklist, pipe, safeParse, string, union } from 'valibot'

import { ApiError, createInternalError, createServiceUnavailableError } from '../../utils/error'

const PARTNER_BASE = 'https://partner.steam-api.com'

type SteamMicroTxnInterface = 'ISteamMicroTxn' | 'ISteamMicroTxnSandbox'

/** Steam: user has not authorized the transaction yet. */
const STEAM_ERROR_NOT_APPROVED = 5
/** Steam: FinalizeTxn already captured this order. */
const STEAM_ERROR_ALREADY_COMMITTED = 6
/** Steam: user denied the transaction. */
const STEAM_ERROR_DENIED = 10

export const STEAM_TXN_NOT_APPROVED = 'STEAM_TXN_NOT_APPROVED'
export const STEAM_TXN_DENIED = 'STEAM_TXN_DENIED'
export const STEAM_TXN_ALREADY_COMMITTED = 'STEAM_TXN_ALREADY_COMMITTED'

const SteamApiErrorSchema = object({
  errorcode: optional(union([number(), string()])),
  errordesc: optional(string()),
})

const SteamEnvelopeSchema = object({
  response: object({
    result: picklist(['OK', 'Failure']),
    params: optional(looseObject({})),
    error: optional(SteamApiErrorSchema),
  }),
})

const InitTxnParamsSchema = object({
  steamurl: pipe(string(), minLength(1)),
})

const FinalizeTxnParamsSchema = object({
  transid: pipe(string(), minLength(1)),
})

const QueryTxnParamsSchema = object({
  status: optional(string()),
  transid: optional(string()),
})

type SteamApiError = InferOutput<typeof SteamApiErrorSchema>

export interface SteamMicroTxnClientOptions {
  publisherKey: string
  appId: number
  /**
   * When true, call `ISteamMicroTxnSandbox` instead of production.
   * @default false
   */
  sandbox?: boolean
  /**
   * @default 15_000
   */
  timeoutMs?: number
}

export interface SteamInitTxnResult {
  steamUrl: string
}

export interface SteamFinalizeTxnResult {
  transId?: string
}

/**
 * Steamworks `ISteamMicroTxn` client. Channel operations call this.
 * Payment CORE never sees the partner HTTP envelope.
 */
export interface SteamMicroTxnClient {
  initTxn: (txn: {
    orderId: string
    steamId: string
    itemId: number
    amount: number
    currency: string
    description: string
    ipAddress: string
  }) => Promise<SteamInitTxnResult>
  finalizeTxn: (txn: { orderId: string }) => Promise<SteamFinalizeTxnResult>
}

/**
 * Creates a typed `ofetch` client for Steamworks `ISteamMicroTxn`.
 */
export function createSteamMicroTxnClient({
  publisherKey,
  appId,
  sandbox = false,
  timeoutMs = 15_000,
}: SteamMicroTxnClientOptions): SteamMicroTxnClient {
  const iface: SteamMicroTxnInterface = sandbox ? 'ISteamMicroTxnSandbox' : 'ISteamMicroTxn'
  const key = publisherKey
  const appid = appId

  async function request(
    method: string,
    version: string,
    httpMethod: 'GET' | 'POST',
    fields: Record<string, string | number>,
  ) {
    const url = `${PARTNER_BASE}/${iface}/${method}/${version}/`
    let raw: unknown
    try {
      raw = httpMethod === 'GET'
        ? await ofetch(url, {
            method: 'GET',
            query: { key, appid, ...fields },
            timeout: timeoutMs,
          })
        : await ofetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              key,
              appid: String(appid),
              ...Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, String(value)])),
            }).toString(),
            timeout: timeoutMs,
          })
    }
    catch (error) {
      throw createServiceUnavailableError(
        `Steam MicroTxn ${method} failed: ${errorMessageFrom(error) ?? 'network error'}`,
        'STEAM_MICROTXN_UNAVAILABLE',
      )
    }

    const envelope = safeParse(SteamEnvelopeSchema, raw)
    if (!envelope.success) {
      throw createInternalError(
        `Steam MicroTxn ${method} returned an invalid response`,
        { errorCode: 'STEAM_MICROTXN_FAILURE' },
      )
    }

    const { result, params, error } = envelope.output.response
    if (result === 'Failure')
      throw createSteamFailure(method, error)

    return params
  }

  async function queryTxn(orderId: string) {
    const parsed = safeParse(QueryTxnParamsSchema, await request('QueryTxn', 'v3', 'GET', { orderid: orderId }))
    return parsed.success ? parsed.output : {}
  }

  return {
    async initTxn({ orderId, steamId, itemId, amount, currency, description, ipAddress }) {
      const parsed = safeParse(InitTxnParamsSchema, await request('InitTxn', 'v3', 'POST', {
        'orderid': orderId,
        'steamid': steamId,
        'itemcount': 1,
        'language': 'en',
        'currency': currency.toUpperCase(),
        'usersession': 'web',
        'ipaddress': ipAddress,
        'itemid[0]': itemId,
        'qty[0]': 1,
        'amount[0]': amount,
        'description[0]': description,
      }))
      if (!parsed.success) {
        throw createServiceUnavailableError(
          'Steam InitTxn did not return a checkout URL',
          'STEAM_CHECKOUT_URL_MISSING',
        )
      }
      return { steamUrl: parsed.output.steamurl }
    },

    async finalizeTxn({ orderId }) {
      try {
        const parsed = safeParse(FinalizeTxnParamsSchema, await request('FinalizeTxn', 'v2', 'POST', {
          orderid: orderId,
        }))
        if (!parsed.success) {
          throw createServiceUnavailableError(
            'Steam FinalizeTxn did not return a transaction id',
            'STEAM_TRANSID_MISSING',
          )
        }
        return { transId: parsed.output.transid }
      }
      catch (error) {
        if (!(error instanceof ApiError) || error.errorCode !== STEAM_TXN_ALREADY_COMMITTED)
          throw error

        const queried = await queryTxn(orderId)
        if (queried.status === 'Succeeded' || queried.status === 'Approved')
          return { transId: queried.transid }

        throw error
      }
    },
  }
}

function createSteamFailure(method: string, error?: SteamApiError): ApiError {
  const code = Number(error?.errorcode)
  const description = error?.errordesc ?? 'Steam MicroTxn failure'

  switch (code) {
    case STEAM_ERROR_NOT_APPROVED:
      return new ApiError(409, STEAM_TXN_NOT_APPROVED, 'Steam transaction is not approved yet', {
        steamErrorCode: code,
        steamErrorDesc: description,
      })
    case STEAM_ERROR_DENIED:
      return new ApiError(400, STEAM_TXN_DENIED, 'Steam transaction was denied', {
        steamErrorCode: code,
        steamErrorDesc: description,
      })
    case STEAM_ERROR_ALREADY_COMMITTED:
      return new ApiError(409, STEAM_TXN_ALREADY_COMMITTED, 'Steam transaction is already committed', {
        steamErrorCode: code,
        steamErrorDesc: description,
      })
    default:
      return createInternalError(
        `Steam MicroTxn ${method} returned Failure: ${description}`,
        {
          errorCode: 'STEAM_MICROTXN_FAILURE',
          steamErrorCode: Number.isNaN(code) ? error?.errorcode : code,
          steamErrorDesc: description,
        },
      )
  }
}
