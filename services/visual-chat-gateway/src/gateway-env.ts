import { parseGatewayConfig } from './env/parse'

export const gatewayEnv = parseGatewayConfig()

export type { GatewayConfig } from './env/parse'
