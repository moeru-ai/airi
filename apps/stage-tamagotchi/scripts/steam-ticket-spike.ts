/**
 * Dev-only spike: init Steam and print a Web API session ticket hex string.
 *
 * Run: pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/steam-ticket-spike.ts
 */
import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'

import {
  getWebApiTicket,
  initSteam,
  shutdownSteam,
} from '../src/main/services/steam/client'
import { STEAM_APP_ID } from '../src/main/services/steam/types'

async function main(): Promise<void> {
  console.info(`Steam ticket spike (appId=${STEAM_APP_ID}, identity=airi-desktop)`)

  const initResult = await initSteam()
  if (!initResult.ok) {
    console.error(`Steam init failed: ${initResult.reason}`)
    process.exitCode = 1
    return
  }

  try {
    const ticketResult = await getWebApiTicket()
    if (!ticketResult.ok) {
      console.error(`GetAuthTicketForWebApi failed: ${ticketResult.reason}`)
      process.exitCode = 1
      return
    }

    console.info(`ticketHex (${ticketResult.ticketHex.length} chars):`)
    console.info(ticketResult.ticketHex)
  }
  catch (error) {
    console.error(errorMessageFrom(error) ?? String(error))
    process.exitCode = 1
  }
  finally {
    shutdownSteam()
  }
}

void main()
