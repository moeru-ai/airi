import { describe, expect, it } from 'vitest'

import { resolveWidgetAssetRoute } from './asset-url'

describe('resolveWidgetAssetRoute', () => {
  it('derives widget route asset path and session prefix with /ui semantics', () => {
    expect(resolveWidgetAssetRoute('./ui/index.html')).toEqual({
      routeAssetPath: 'index.html',
      sessionPathPrefix: '',
    })

    expect(resolveWidgetAssetRoute('ui/index.html')).toEqual({
      routeAssetPath: 'index.html',
      sessionPathPrefix: '',
    })

    expect(resolveWidgetAssetRoute('ui/assets/index.html')).toEqual({
      routeAssetPath: 'assets/index.html',
      sessionPathPrefix: 'assets/',
    })

    expect(resolveWidgetAssetRoute('assets/index.html')).toEqual({
      routeAssetPath: 'assets/index.html',
      sessionPathPrefix: 'assets/',
    })
  })
})
