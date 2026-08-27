import { describe, expect, it } from 'vitest'

import { helpSections, privacySections } from './help-content'

describe('mini help and agreement content', () => {
  it('covers the supported mobile-console help paths', () => {
    expect(helpSections.map((section) => section.title)).toEqual(['首次绑定', '配置任务', '处理风险提醒'])
    expect(helpSections.every((section) => section.body.length > 20)).toBe(true)
    expect(helpSections[1]?.body).toContain('已确认会话')
    expect(helpSections[1]?.body).not.toContain('已确认好友')
  })

  it('states the product privacy and security boundaries', () => {
    expect(privacySections.map((section) => section.title)).toEqual(['平台凭据', '微信身份', '产品边界'])
    expect(privacySections.map((section) => section.body).join('')).toContain('session_key')
    expect(privacySections.map((section) => section.body).join('')).toContain('验证码绕过')
  })
})
