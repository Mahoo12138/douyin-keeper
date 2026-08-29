import { describe, expect, it } from 'vitest'

import { resolveApiBaseUrl } from './api-config'

describe('resolveApiBaseUrl', () => {
  it('uses the absolute mini-program API address for Weapp', () => {
    expect(resolveApiBaseUrl('weapp', {
      TARO_APP_API_BASE_URL: 'http://192.168.1.20:18080/api/v1',
      TARO_APP_H5_API_BASE_URL: '/api/v1',
    })).toBe('http://192.168.1.20:18080/api/v1')
  })

  it('uses the H5 proxy path in the browser', () => {
    expect(resolveApiBaseUrl('h5', {
      TARO_APP_API_BASE_URL: 'http://192.168.1.20:18080/api/v1',
      TARO_APP_H5_API_BASE_URL: '/api/v1/',
    })).toBe('/api/v1')
  })

  it('falls back to the API path when no environment value exists', () => {
    expect(resolveApiBaseUrl('weapp', {})).toBe('/api/v1')
  })
})
