import { View, Text, Button } from '@tarojs/components'

// 我的：微信登录 / 绑定（M4 通过 link code 绑定已有 PC 账号，docs/13 §5）。
export default function Login() {
  return (
    <View>
      <View className="card">
        <Text className="title">我的</Text>
      </View>
      <View className="card">
        <Text>登录占位：小程序将使用一次性 Link Code 绑定你的 PC 账号。</Text>
      </View>
      <View style={{ margin: '24rpx' }}>
        <Button type="primary" disabled>
          微信登录（M4 可用）
        </Button>
      </View>
    </View>
  )
}