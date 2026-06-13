/**
 * Dev-only spike: init Steam and print a Web API session ticket hex string.
 *
 * Run: pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/steam-ticket-spike.ts
 */
import { errorMessageFrom } from '@moeru/std'

import {
  getWebApiTicket,
  initSteam,
  shutdownSteam,
  STEAM_APP_ID,
  STEAM_WEB_API_IDENTITY,
} from '../src/main/services/steam/client'

async function main(): Promise<void> {
  console.log(`Steam ticket spike (appId=${STEAM_APP_ID}, identity=${STEAM_WEB_API_IDENTITY})`)

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

    console.log(`ticketHex (${ticketResult.ticketHex.length} chars):`)
    console.log(ticketResult.ticketHex)
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
