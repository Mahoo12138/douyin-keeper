import { defineConfig } from '@tarojs/cli'
import { dotenvParse } from '@tarojs/helper'
import path from 'node:path'

const appEnv = dotenvParse(path.resolve(__dirname, '..'), ['TARO_APP_'], process.env.NODE_ENV || 'development')
const injectedEnv = Object.fromEntries(
  Object.entries(appEnv).map(([key, value]) => [key, JSON.stringify(value)]),
)
const apiTarget = (appEnv.TARO_APP_API_BASE_URL || 'http://10.0.0.149:18080/api/v1').replace(/\/api\/v1\/?$/, '')
const outputRoot = process.env.TARO_OUTPUT_ROOT || 'dist'
const assetBaseUrl = appEnv.TARO_APP_ASSET_BASE_URL || 'http://10.0.0.149:5173/mini-assets'

export default defineConfig({
  projectName: 'douyin-keeper-mini',
  date: '2026-08-24',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot,
  env: {
    ...injectedEnv,
    TARO_APP_API_BASE_URL: JSON.stringify(appEnv.TARO_APP_API_BASE_URL || 'http://10.0.0.149:18080/api/v1'),
    TARO_APP_H5_API_BASE_URL: JSON.stringify('/api/v1'),
    TARO_APP_ASSET_BASE_URL: JSON.stringify(assetBaseUrl),
    TARO_APP_WECHAT_NOTIFICATION_TEMPLATE_ID: JSON.stringify(appEnv.TARO_APP_WECHAT_NOTIFICATION_TEMPLATE_ID || ''),
  },
  framework: 'react',
  compiler: 'webpack5',
  mini: {
    // Taro 4.2's webpackbar passes legacy options to the current webpack
    // ProgressPlugin. Disable the cosmetic progress bar so the build stays
    // compatible with the workspace's webpack version.
    webpackChain(chain) {
      chain.plugins.delete('webpackbar')
      chain.resolve.alias.set('@', path.resolve(__dirname, '../src'))
    },
    postcss: {
      pxtransform: { enable: true },
      cssModules: { enable: false },
      url: { enable: true },
      htmltransform: { enable: true },
    },
  },
  h5: {
    devServer: {
      proxy: {
        '/api': {
          target: apiTarget,
          // Keep the H5 page host so the backend's same-origin mutation
          // guard accepts browser requests forwarded by the dev server.
          changeOrigin: false,
        },
      },
    },
    webpackChain(chain) {
      chain.resolve.alias.set('@', path.resolve(__dirname, '../src'))
    },
  },
})
