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
      { pagePath: 'pages/index/index', text: '首页', iconPath: 'assets/tabbar/home.png', selectedIconPath: 'assets/tabbar/home-active.png' },
      { pagePath: 'pages/spark/index', text: '会话', iconPath: 'assets/tabbar/spark.png', selectedIconPath: 'assets/tabbar/spark-active.png' },
      { pagePath: 'pages/tasks/index', text: '任务', iconPath: 'assets/tabbar/tasks.png', selectedIconPath: 'assets/tabbar/tasks-active.png' },
      { pagePath: 'pages/accounts/index', text: '账号', iconPath: 'assets/tabbar/accounts.png', selectedIconPath: 'assets/tabbar/accounts-active.png' },
      { pagePath: 'pages/login/index', text: '我的', iconPath: 'assets/tabbar/me.png', selectedIconPath: 'assets/tabbar/me-active.png' },
    ],
  },
})
