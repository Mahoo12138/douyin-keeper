import { View, Text } from '@tarojs/components'

// 首页：账号概览（M4 接入 API）。
export default function Index() {
  return (
    <View>
      <View className="card">
        <Text className="title">抖音火花助手</Text>
      </View>
      <View className="card">
        <Text>账号概览占位（M4 接入登录与账号列表）。</Text>
      </View>
    </View>
  )
}