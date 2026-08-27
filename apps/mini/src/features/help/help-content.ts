export type HelpSection = { title: string; body: string }

export const helpSections: HelpSection[] = [
  { title: '首次绑定', body: '首次绑定抖音账号可在小程序发起扫码或短信流程；已有产品账号也可以通过绑定码关联。' },
  { title: '配置任务', body: '小程序可以选择已确认好友创建任务，启停火花维护和每日任务，也可以修改时间窗口与消息内容；好友同步仍需在 PC 端完成。' },
  { title: '处理风险提醒', body: '登录失效或安全验证出现时，请按通知提示在 PC 端重新处理，不要尝试绕过验证码或平台安全校验。' },
]

export const privacySections: HelpSection[] = [
  { title: '平台凭据', body: '产品界面不展示抖音 Session、Cookie 或其他平台凭据；管理员也不能通过普通页面读取这些内容。' },
  { title: '微信身份', body: '微信登录只用于身份关联和会话建立，服务端保存 provider subject，不持久化微信 session_key。' },
  { title: '产品边界', body: '系统不提供验证码绕过、设备指纹伪装、代理池轮换或群发营销能力；风险状态会优先停止相关动作。' },
]
