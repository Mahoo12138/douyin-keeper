# AI 对话配置

TinyShip 集成了强大的 AI 对话功能，基于 Vercel AI SDK v5，支持多个主流 AI 提供商，让您轻松构建智能对话体验。

> 💡 **AI 快速配置：** 已安装 [Agent Skills](https://github.com/TinyshipCN/tinyship-skills) 的用户可以直接对 AI 说「帮我配置 AI 功能」，使用 `tinyship-ai` skill 交互式完成配置。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| AI 对话页 | `/ai` | AI 聊天界面 |

## 📑 目录

- [支持的 AI 提供商](#支持的-ai-提供商)
- [在 config/ai.ts 中配置](#在-configaits-中配置)
- [环境变量配置](#环境变量配置)
- [获取 API 密钥](#获取-api-密钥)
- [AI 页面功能](#ai-页面功能)

## 支持的 AI 提供商

TinyShip 支持以下三个 AI 提供商，每个都有其独特优势：

| 提供商 | 模型 | 优势 | 推荐场景 |
|--------|------|------|----------|
| **Qwen (通义千问)** | qwen-max, qwen-plus, qwen-turbo | 中文支持优秀，性价比高 | 中文对话、通用场景 |
| **DeepSeek** | deepseek-chat, deepseek-coder | 编程能力强，成本低 | 代码辅助、技术支持 |
| **OpenAI** | gpt-5, gpt-5-codex, gpt-5-pro | 性能强大，生态完善 | 复杂推理、英文对话 |

## 在 config/ai.ts 中配置

```typescript
// config/ai.ts
export const aiConfig = {
  defaultProvider: 'qwen' as const,        // 默认 AI 提供商: 'qwen' | 'deepseek' | 'openai'
  
  defaultModels: {                         // 每个提供商的默认模型
    qwen: 'qwen-turbo',
    deepseek: 'deepseek-chat',
    openai: 'gpt-5'
  },
  
  availableModels: {                       // 每个提供商的可用模型列表
    qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    deepseek: ['deepseek-chat', 'deepseek-coder'],
    openai: ['gpt-5', 'gpt-5-codex', 'gpt-5-pro']
  }
}
```

**配置选项说明**：
- `defaultProvider`: 应用启动时使用的默认 AI 提供商
- `defaultModels`: 每个提供商的默认模型，用户首次访问时使用
- `availableModels`: 在模型选择器中显示的所有可用模型列表

## 环境变量配置

在 `.env` 文件中添加对应的 API 密钥：

```env
# AI Provider Configuration
AI_PROVIDER=qwen  # 可选：qwen, deepseek, openai

# Qwen (通义千问) - 推荐用于中文对话
QWEN_API_KEY="your-qwen-api-key"
QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# DeepSeek - 推荐用于代码相关
DEEPSEEK_API_KEY="your-deepseek-api-key"

# OpenAI - 推荐用于复杂推理
OPENAI_API_KEY="your-openai-api-key"
OPENAI_BASE_URL="https://api.openai.com/v1"  # 可选，自定义 API 端点
```

**配置建议**：
- 至少配置一个提供商的 API 密钥
- `AI_PROVIDER` 环境变量会被 `config.ts` 中的 `defaultProvider` 覆盖
- 可以同时配置多个提供商，用户可在界面中切换

## 获取 API 密钥

### 1. Qwen (通义千问)

1. 访问 [阿里云百炼平台](https://dashscope.aliyun.com/)
2. 注册/登录阿里云账号
3. 进入"API-KEY 管理"页面
4. 创建新的 API Key
5. 复制 API Key 到 `.env` 文件

**优势**: 中文支持最佳，新用户有免费额度，价格实惠

### 2. DeepSeek

1. 访问 [DeepSeek 平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入"API Keys"页面
4. 创建新的 API Key
5. 复制 API Key 到 `.env` 文件

**优势**: 代码生成能力强，价格非常低廉，新用户有免费额度

### 3. OpenAI

1. 访问 [OpenAI 平台](https://platform.openai.com/)
2. 注册/登录账号
3. 进入"API keys"页面
4. 创建新的 API Key
5. 复制 API Key 到 `.env` 文件

**优势**: 性能强大，生态完善，但价格相对较高

## AI 页面功能

TinyShip 提供了一个 AI 对话页面示例 (`/ai`)，这是一个**大模型对话的简单实现**，采用**可扩展设计**。该示例使用了最新的技术栈 **AI SDK v5 / AI Elements / StreamDown** 实现非常丝滑的聊天效果。

**核心特性**：

- ✨ **实时流式响应**: 基于 Vercel AI SDK v5 的流式对话，打字机效果流畅
- 🎨 **Markdown 渲染**: 支持代码高亮、表格、列表等格式，代码块一键复制
- 🔄 **模型切换**: 用户可在界面中实时切换不同的 AI 模型和提供商
- 💾 **会话管理**: 支持新建对话、重新生成回复等操作
- 🔐 **订阅保护**: 可选择性地限制只有付费用户才能使用 AI 功能
- 📱 **响应式设计**: 完美适配移动端和桌面端，支持自动滚动

**扩展能力**：

此页面只是一个**基础示例**，展示了如何集成 AI 对话功能。您可以基于当前的技术架构，按需扩展为更复杂的功能，例如：

- 🎯 **多轮对话上下文管理**: 实现长期记忆和上下文理解
- 🛠️ **工具调用集成**: 连接外部 API 和数据库，让 AI 执行实际操作
- 📁 **文件上传与分析**: 支持图片、PDF 等文件的 AI 分析
- 👥 **多用户会话隔离**: 为每个用户维护独立的对话历史
- 📊 **对话数据分析**: 记录和分析用户与 AI 的交互数据
- 🎨 **个性化助手**: 根据用户偏好定制 AI 行为和回复风格

**使用建议**：

- AI 对话功能会消耗 API 配额，请合理控制使用
- 建议在生产环境启用订阅保护，避免滥用
- 可以通过修改 `config.ts` 来添加或移除可用的模型
- 参考 `libs/ai` 库的文档了解更多高级功能

---

相关文档：
- [AI 图片生成配置](./image.md)
- [积分系统配置](../credits.md) - 配置 AI 积分消耗
