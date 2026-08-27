import { defineConfig } from '@tarojs/cli'
import path from 'node:path'

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
  outputRoot: 'dist',
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
    webpackChain(chain) {
      chain.resolve.alias.set('@', path.resolve(__dirname, '../src'))
    },
  },
})
