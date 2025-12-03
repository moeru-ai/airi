export function nlsMetaEndpointFromRegion(region: string): URL {
  return new URL(`http://nls-meta.${region}.aliyuncs.com`)
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
      websocketURL.protocol = 'wss:'
      websocketURL.hostname = `nls-gateway-${region}-internal.aliyuncs.com:80`
  }

  return websocketURL
}
