import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const miniRoot = resolve(__dirname, '..')
const tabBarConfig = readFileSync(resolve(miniRoot, 'src/app.config.ts'), 'utf8')

describe('mini-program navigation assets', () => {
  it('ships selected and unselected icon assets for every tab', () => {
    const names = ['home', 'spark', 'tasks', 'accounts', 'me']

    names.forEach((name) => {
      expect(existsSync(resolve(miniRoot, `src/assets/tabbar/${name}.png`))).toBe(true)
      expect(existsSync(resolve(miniRoot, `src/assets/tabbar/${name}-active.png`))).toBe(true)
      expect(tabBarConfig).toContain(`assets/tabbar/${name}.png`)
      expect(tabBarConfig).toContain(`assets/tabbar/${name}-active.png`)
    })
  })
})
