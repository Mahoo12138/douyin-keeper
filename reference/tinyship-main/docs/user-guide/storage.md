# 存储服务配置

TinyShip 提供了统一的云存储服务，支持多个主流云存储服务商，让您轻松管理文件上传、下载和访问。

## 🔗 相关页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 上传示例页 | `/upload` | 文件上传示例页面 |

## 📑 目录

- [支持的存储服务商](#支持的存储服务商)
- [在 config/storage.ts 中配置](#在-configstoragets-中配置)
- [环境变量配置](#环境变量配置)
- [使用方法](#使用方法)

## 支持的存储服务商

| 服务商 | 优势 | 推荐场景 |
|--------|------|----------|
| **阿里云 OSS** | 中国区域访问快，与阿里云生态集成 | 面向中国用户的应用 |
| **AWS S3** | 全球覆盖，生态成熟，功能丰富 | 面向国际用户的应用 |
| **Cloudflare R2** | 无出口流量费用，性价比高，边缘分发 | 注重成本控制的应用 |
| **腾讯云 COS** | 国内云存储，生态完善 | 面向中国用户的应用 |

所有服务商都支持以下功能：
- ✅ 文件上传/下载
- ✅ 签名 URL 生成
- ✅ 文件删除
- ✅ 文件存在检查
- ✅ 元数据检索
- ✅ 目录列表

## 在 config/storage.ts 中配置

```typescript
// config/storage.ts
export const storageConfig = {
  defaultProvider: 'oss' as const,  // 默认服务商: 'oss' | 's3' | 'r2' | 'cos'
  
  oss: {
    region: 'oss-cn-shanghai',
    accessKeyId: '...',
    accessKeySecret: '...',
    bucket: 'your-bucket',
    endpoint: '',  // 可选：自定义端点
    defaultExpiration: 60
  },
  
  s3: {
    region: 'us-east-1',
    accessKeyId: '...',
    accessKeySecret: '...',
    bucket: 'your-bucket',
    endpoint: '',  // 可选：S3 兼容服务的自定义端点
    forcePathStyle: false,
    defaultExpiration: 3600
  },
  
  r2: {
    accountId: '...',
    accessKeyId: '...',
    accessKeySecret: '...',
    bucket: 'your-bucket',
    defaultExpiration: 3600
  },
  
  cos: {
    region: 'ap-guangzhou',
    secretId: '...',
    secretKey: '...',
    bucket: 'your-bucket-appid',
    defaultExpiration: 3600
  }
}
```

**配置选项说明**：
- `defaultProvider`: 默认使用的存储服务商
- `defaultExpiration`: 签名 URL 的默认过期时间（秒）
- `forcePathStyle`: S3 兼容服务可能需要设置为 `true`

## 环境变量配置

在 `.env` 文件中添加对应服务商的配置：

```env
# 选择默认存储服务商
STORAGE_PROVIDER=oss  # 可选：oss, s3, r2, cos

# 阿里云 OSS 配置
OSS_REGION=oss-cn-shanghai
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
OSS_BUCKET=your-bucket-name

# AWS S3 配置
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_access_key_id
S3_ACCESS_KEY_SECRET=your_secret_access_key
S3_BUCKET=your-bucket-name

# Cloudflare R2 配置
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_ACCESS_KEY_SECRET=your_r2_access_key_secret
R2_BUCKET=your-bucket-name

# 腾讯云 COS 配置
COS_REGION=ap-guangzhou
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_BUCKET=your-bucket-name-appid
```

**注意**：OSS 的 Access Key 可以复用阿里云通用的 `ALIYUN_ACCESS_KEY_ID` 和 `ALIYUN_ACCESS_KEY_SECRET`，如果未单独配置 OSS 专用的 Key，系统会自动回退使用通用 Key。
Cloudflare R2 现在推荐直接使用 `CLOUDFLARE_ACCOUNT_ID`，`R2_ACCOUNT_ID` 仅作为兼容旧配置的回退变量保留。

## 使用方法

### 基本使用

```typescript
import { storage } from '@libs/storage';

// 上传文件（使用默认服务商）
const result = await storage.uploadFile({
  file: fileBuffer,
  fileName: 'document.pdf',
  contentType: 'application/pdf',
  folder: 'uploads/2024'
});

// 生成签名下载 URL
const { url } = await storage.generateSignedUrl({
  key: result.key,
  expiresIn: 3600
});
```

### 使用指定服务商

```typescript
import { createStorageProvider } from '@libs/storage';

// 创建指定服务商实例
const s3Storage = createStorageProvider('s3');
const ossStorage = createStorageProvider('oss');
const r2Storage = createStorageProvider('r2');
const cosStorage = createStorageProvider('cos');

// 上传到 S3
await s3Storage.uploadFile({
  file: buffer,
  fileName: 'file.zip'
});
```

详细的 API 文档和更多示例请参考：[存储服务库文档](../../libs/storage/README.md)
