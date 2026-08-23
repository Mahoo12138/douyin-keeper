# 支付功能测试指南

本测试指南为支付系统提供全面的手动测试覆盖，确保支付功能在各种场景下正常工作。

## 📁 文件结构

```
tests/payment/
├── README.md                    # 本文件
├── payment-test-plan.md         # 完整测试计划
└── manual-test-guide.md         # 详细手动测试指南
```

## 🚀 快速开始

### 1. 环境准备

确保已配置所需的环境变量：
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET`
- Creem: `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`
- WeChat Pay: `WECHAT_PAY_APP_ID`, `WECHAT_PAY_MCH_ID`, `WECHAT_PAY_API_KEY`（可选）
- 基础: `DATABASE_URL`, `APP_BASE_URL`

### 2. 开始测试

1. 启动开发服务器：`npm run dev:next`
2. 按照[手动测试指南](./manual-test-guide.md)进行测试
3. 使用[测试计划](./payment-test-plan.md)确保覆盖所有场景

## 📋 测试文档

| 文档 | 描述 |
|------|------|
| [payment-test-plan.md](./payment-test-plan.md) | 完整的测试计划和策略 |
| [manual-test-guide.md](./manual-test-guide.md) | 详细的手动测试步骤 |

## 🧪 测试分类

### 1. 环境配置检查
- 验证所有支付提供商的 API 密钥
- 检查数据库连接
- 验证 Webhook URL 配置
- 检查支付计划配置

### 2. 功能测试
- 完整支付流程测试
- 订阅管理测试
- 客户门户功能测试
- Webhook 处理验证

### 3. 兼容性测试
- 多设备兼容性测试
- 浏览器兼容性测试
- 异常情况处理测试
- 用户体验测试

## 🔧 配置说明

### 环境变量要求

**基础配置**:
- `APP_BASE_URL`: 应用基础 URL
- `DATABASE_URL`: 数据库连接字符串

**Stripe 配置**:
- `STRIPE_SECRET_KEY`: Stripe 密钥
- `STRIPE_PUBLIC_KEY`: Stripe 公钥
- `STRIPE_WEBHOOK_SECRET`: Webhook 密钥

**WeChat Pay 配置（可选）**:
- `WECHAT_PAY_APP_ID`: 微信应用 ID
- `WECHAT_PAY_MCH_ID`: 商户号
- `WECHAT_PAY_API_KEY`: API 密钥

**Creem 配置**:
- `CREEM_API_KEY`: Creem API 密钥
- `CREEM_WEBHOOK_SECRET`: Webhook 密钥
- `CREEM_SERVER_URL`: 服务器 URL（可选）

## 📊 测试记录

建议为每次测试创建记录，包括：
- 测试日期和环境
- 测试场景覆盖情况
- 发现的问题和解决方案
- 性能表现记录

### 测试记录模板
```
## 支付功能测试记录

**测试日期**: 2024-01-15
**测试环境**: 开发环境
**测试人员**: [姓名]

### 测试结果
✅ Stripe 月度订阅支付
✅ Creem 年度订阅支付  
❌ WeChat Pay 扫码支付
   问题: 二维码无法显示
   解决: 检查微信支付配置

### 发现的问题
1. 支付成功页面加载慢
2. 移动端布局需要优化

### 建议
1. 优化支付成功页面性能
2. 改进移动端用户体验
```

## 🎯 测试覆盖范围

### 支付提供商
- ✅ Stripe（月度/年度订阅）
- ✅ WeChat Pay（扫码支付）
- ✅ Creem（订阅管理）

### 支付流程
- ✅ 新用户注册购买
- ✅ 现有用户续费
- ✅ 订阅升级/降级
- ✅ 支付失败处理
- ✅ 退款处理

### 技术测试
- ✅ Webhook 签名验证
- ✅ Return URL 验证
- ✅ 数据库状态同步
- ✅ 并发支付处理
- ✅ 网络中断恢复

## 🐛 故障排除

### 常见问题

**1. 环境检查失败**
```
❌ 缺失必需的环境变量
```
**解决方案**: 检查 `.env` 文件，确保设置了所有必需的环境变量。

**2. API 测试失败**
```
❌ 无法连接到服务
```
**解决方案**: 确保开发服务器正在运行 (`npm run dev:next`)。

**3. Webhook 测试失败**
```
❌ 签名验证失败
```
**解决方案**: 检查 Webhook 密钥配置，确保与支付提供商设置一致。

### 调试技巧

1. **检查网络连接**:
   ```bash
   curl -I http://localhost:7001/api/health
   ```

2. **验证数据库连接**:
   ```bash
   npm run db:check
   ```

3. **查看支付提供商仪表板**:
   - Stripe Dashboard: 查看支付事件和日志
   - Creem Dashboard: 监控订阅状态
   - WeChat Pay 商户平台: 检查支付记录

## 📚 相关文档

- [支付功能完整测试计划](./payment-test-plan.md)
- [手动测试详细指南](./manual-test-guide.md)
- [Stripe 集成文档](../../libs/payment/providers/stripe.ts)
- [Creem 集成文档](../../libs/payment/CREEM.md)
- [WeChat Pay 集成文档](../../libs/payment/providers/wechat.ts)

## 🔄 定期测试建议

### 测试频率建议

- **每日**: 核心支付流程快速验证
- **每周**: 完整的支付功能测试
- **发布前**: 全面的回归测试
- **重要更新后**: 端到端测试验证

### 测试清单

#### 日常检查
- [ ] 一个 Stripe 支付流程
- [ ] 一个 Creem 支付流程
- [ ] 订阅状态查询

#### 周度检查
- [ ] 所有支付提供商测试
- [ ] 移动端兼容性
- [ ] 客户门户功能
- [ ] 异常情况处理

## 🛡️ 安全注意事项

1. **测试环境隔离**: 所有涉及真实支付的测试必须在测试环境进行
2. **敏感数据保护**: 测试后及时清理所有测试数据
3. **API 密钥安全**: 使用测试环境密钥，永远不要在代码中硬编码生产密钥
4. **权限验证**: 确保测试覆盖所有权限和访问控制场景

## 📈 性能基准

### 响应时间目标
- 支付页面加载: < 2秒
- 支付状态查询: < 1秒
- Webhook 处理: < 5秒
- 客户门户: < 3秒

### 并发处理目标
- 同时支付用户: 100+
- Webhook 处理: 50 TPS
- 数据库查询: < 500ms

## 🤝 贡献指南

1. 添加新的测试场景时，请更新相应文档
2. 确保新测试与现有测试套件兼容
3. 为复杂测试添加详细注释
4. 更新测试覆盖率报告

## 📞 支持

如果在测试过程中遇到问题：
1. 检查故障排除部分
2. 查看相关文档和支付提供商仪表板
3. 查看浏览器开发者工具的网络和控制台
4. 记录详细的错误信息和重现步骤 