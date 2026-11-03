import process from 'node:process'

import { Buffer } from 'node:buffer'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { errorMessageFrom, merge } from '@moeru/std'
import { createContainer, createLoggLogger, lifecycle, provide, resolve, start, stop } from 'injeca'
import { connect } from 'mqtt'

import { CompanionService } from '../companion-service'
import { defaultPolicy } from '../companion-state'
import { parseEnv } from '../config'
import { companionOrigin, companionTopics, MqttGateway } from '../mqtt-gateway'
import { StateStore } from '../state-store'

/**
 * Starts the companion state service and owns its shutdown.
 *
 * Call stack:
 *
 * main
 *   -> {@link parseEnv}
 *   -> {@link StateStore.acquireLock}
 *   -> {@link CompanionService.start}
 *   -> {@link MqttGateway.start}
 *     -> MQTT message
 *       -> {@link CompanionService.handle}
 *         -> reduceCompanionState -> StateStore.save -> MqttGateway.publishState
 *
 * Shutdown order on SIGINT or SIGTERM: the service drains its queue first, then the
 * gateway publishes the offline status and disconnects, then the store releases the lock.
 */
async function main(): Promise<void> {
  initLogger(LoggerLevel.Log, LoggerFormat.Pretty)
  const log = useLogger('alice-companion')

  const container = createContainer({ logger: createLoggLogger(useLogger('injeca').useGlobalConfig()) })

  const env = provide(container, 'env', () => parseEnv(process.env))

  const store = provide(container, 'datastore:state', {
    dependsOn: { env },
    build: async ({ dependsOn }) => {
      const stateStore = new StateStore(dependsOn.env.ALICE_COMPANION_DATA_DIR)
      await stateStore.acquireLock()
      return stateStore
    },
  })

  const mqttClient = provide(container, 'network:mqtt', {
    dependsOn: { env },
    build: ({ dependsOn }) => {
      const topics = companionTopics(dependsOn.env.ALICE_COMPANION_PUBLISH_SITE)
      return connect(dependsOn.env.ALICE_COMPANION_MQTT_URL, {
        clientId: `${companionOrigin}-${process.pid}`,
        username: dependsOn.env.ALICE_COMPANION_MQTT_USERNAME,
        password: dependsOn.env.ALICE_COMPANION_MQTT_PASSWORD,
        reconnectPeriod: 5_000,
        will: { topic: topics.status, payload: Buffer.from(JSON.stringify({ online: false })), qos: 1, retain: true },
      })
    },
  })

  const gateway = provide(container, 'services:mqtt-gateway', {
    dependsOn: { env, mqttClient },
    build: ({ dependsOn }) => {
      return new MqttGateway({
        client: dependsOn.mqttClient,
        publishSite: dependsOn.env.ALICE_COMPANION_PUBLISH_SITE,
        inputSites: dependsOn.env.ALICE_COMPANION_INPUT_SITES,
        deriveInteractions: dependsOn.env.ALICE_COMPANION_DERIVE_INTERACTIONS,
        deriveWindowMs: dependsOn.env.ALICE_COMPANION_DERIVE_WINDOW_MS,
        now: () => new Date(),
      })
    },
  })

  const service = provide(container, 'services:companion', {
    dependsOn: { env, store, gateway, lifecycle },
    build: ({ dependsOn }) => {
      const companionService = new CompanionService({
        store: dependsOn.store,
        publisher: dependsOn.gateway,
        policy: merge(defaultPolicy, {
          timeZone: dependsOn.env.ALICE_COMPANION_TIME_ZONE,
          energy: { ...defaultPolicy.energy, mode: dependsOn.env.ALICE_COMPANION_ENERGY_MODE },
        }),
        personaId: dependsOn.env.ALICE_COMPANION_PERSONA_ID,
        ownerProfileId: dependsOn.env.ALICE_COMPANION_OWNER_PROFILE_ID,
        now: () => new Date(),
        refreshIntervalMs: dependsOn.env.ALICE_COMPANION_REFRESH_INTERVAL_MS,
      })
      // NOTICE: injeca runs stop hooks in registration order, not in reverse dependency order.
      // One hook keeps the required order: drain the queue, then disconnect, then release the lock.
      // Source: node_modules/injeca/dist/builtin-*.mjs, `for (const hook of onStopHooks)`.
      // Remove this when injeca stops hooks in reverse dependency order.
      dependsOn.lifecycle.appHooks.onStop(async () => {
        await companionService.stop()
        await dependsOn.gateway.stop()
        await dependsOn.store.releaseLock()
      })
      return companionService
    },
  })

  await start(container)
  const deps = await resolve(container, { service, gateway, env })
  await deps.service.start()
  deps.gateway.start({
    onEvent: event => deps.service.handle(event),
    onSnapshotRequest: () => deps.service.publishSnapshot(),
  })
  log.log(`Companion state service runs for persona "${deps.env.ALICE_COMPANION_PERSONA_ID}" on ${deps.env.ALICE_COMPANION_MQTT_URL}`)

  let stopping = false
  const shutdown = (signal: string) => {
    if (stopping)
      return
    stopping = true
    log.log(`${signal} received. Stopping.`)
    stop(container)
      .then(() => process.exit(0))
      .catch((error) => {
        log.withError(error).error(`Stop failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
        process.exit(1)
      })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error) => {
  useLogger('alice-companion').withError(error).error(`Start failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  process.exit(1)
})
