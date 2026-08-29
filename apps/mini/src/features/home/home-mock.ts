/**
 * 首页演示数据。设计稿中的部分模块（风险提醒、运行概览统计等）后端接口尚未提供，
 * 置 USE_MOCK_HOME = true 时首页直接使用这里的演示数据；置为 false 后恢复真实接口加载。
 */
export const USE_MOCK_HOME = true

export type MockHomeAccount = {
  id: string
  name: string
  douyinId: string
  online: boolean
  statusText: string
  avatar: 'chen' | 'jasper' | 'miles'
}

export type MockRiskAlert = {
  id: string
  tone: 'amber' | 'red'
  icon: string
  title: string
  desc: string
  action: string
  target: 'accounts' | 'none'
}

export type MockRecentTask = {
  id: string
  icon: string
  tone: 'green' | 'red'
  name: string
  time: string
  status: '成功' | '失败' | '执行中'
}

export const mockHomeAccounts: MockHomeAccount[] = [
  { id: 'mock-doudou', name: '豆豆的抖音号', douyinId: 'douyin_doudou', online: true, statusText: '状态正常 · 运行中', avatar: 'jasper' },
  { id: 'mock-xiaodou', name: '小豆同学', douyinId: 'xiaodou_123', online: true, statusText: '状态正常 · 待机中', avatar: 'miles' },
  { id: 'mock-mengmeng', name: '萌萌的抖音号', douyinId: 'mengmeng_001', online: false, statusText: '风险冷却中 · 剩余 23 分钟', avatar: 'chen' },
  { id: 'mock-axing', name: '阿星的日常', douyinId: 'axing_daily', online: false, statusText: '离线 · 会话已过期', avatar: 'miles' },
]

export const mockRiskAlerts: MockRiskAlert[] = [
  { id: 'mock-risk-session', tone: 'amber', icon: '!', title: 'Session 失效', desc: '豆豆的抖音号 · 剩余 1 小时', action: '去处理', target: 'accounts' },
  { id: 'mock-risk-cooldown', tone: 'red', icon: '✕', title: '风险冷却中', desc: '萌萌的抖音号 · 剩余 23 分钟', action: '去查看', target: 'none' },
]

export const mockRecentTasks: MockRecentTask[] = [
  { id: 'mock-recent-1', icon: '⇄', tone: 'green', name: '同步好友关系', time: '09:21:33', status: '成功' },
  { id: 'mock-recent-2', icon: '✚', tone: 'green', name: '添加粉丝', time: '09:15:08', status: '成功' },
  { id: 'mock-recent-3', icon: '✉', tone: 'red', name: '私信互动', time: '09:10:45', status: '失败' },
]

export const mockOverviewMetrics = {
  runningTasks: 18,
  pending: 12,
  completed: 36,
  riskCount: mockRiskAlerts.length,
}

export const mockUnreadNotificationCount = 3
export const mockUserDisplayName = '豆豆'
