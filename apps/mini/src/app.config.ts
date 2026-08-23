export default defineAppConfig({
  pages: ['pages/index/index', 'pages/spark/index', 'pages/login/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '抖音火花助手',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#8a8a8a',
    selectedColor: '#1f1f1f',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/spark/index', text: '火花' },
      { pagePath: 'pages/login/index', text: '我的' },
    ],
  },
})