export default defineAppConfig({
  pages: ['pages/index/index', 'pages/spark/index', 'pages/tasks/index', 'pages/accounts/index', 'pages/history/index', 'pages/login/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '抖音火花助手',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#8a8a8a',
    selectedColor: '#18b979',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/spark/index', text: '好友' },
      { pagePath: 'pages/tasks/index', text: '任务' },
      { pagePath: 'pages/accounts/index', text: '账号' },
      { pagePath: 'pages/login/index', text: '我的' },
    ],
  },
})
