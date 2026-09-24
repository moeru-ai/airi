export function nlsMetaEndpointFromRegion(region: string): URL {
  const publicRegion = region.replace(/-internal$/, '')
  return new URL(`https://nls-meta.${publicRegion}.aliyuncs.com`)
}

export function nlsWebSocketEndpointFromRegion(region: string = 'cn-shanghai'): URL {
  const websocketURL = new URL('/ws/v1', 'https://example.com')

  switch (region) {
    case 'cn-shanghai':
    case 'cn-beijing':
    case 'cn-shenzhen':
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}.aliyuncs.com`
      break
    case 'cn-shanghai-internal':
    case 'cn-beijing-internal':
    case 'cn-shenzhen-internal':
      websocketURL.protocol = 'ws:'
      websocketURL.hostname = `nls-gateway-${region}.aliyuncs.com`
      websocketURL.port = '80'
      break
    default:
      throw new Error(`Unsupported Aliyun NLS region: ${region}`)
  }

  return websocketURL
}
