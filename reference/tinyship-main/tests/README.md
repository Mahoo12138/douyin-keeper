# TinyShip 测试文档

本目录包含 TinyShip 项目的测试用例。我们使用 [Vitest](https://vitest.dev/) 作为测试框架，它提供了与 Jest 兼容的 API 但性能更好。

## 目录结构

```
tests/
├── unit/                  # 单元测试
│   ├── permissions/       # 权限系统测试
│   │   ├── abilities.test.ts    # 权限能力测试
│   │   ├── utils.test.ts        # 权限工具函数测试
│   │   ├── middleware.test.ts   # 权限中间件测试
│   │   ├── integration.test.ts  # 权限集成场景测试
│   │   └── mock-data.ts         # 测试用的模拟数据
│   └── ... (其他模块测试)
├── e2e/                   # 端到端测试 (未来添加)
└── README.md              # 本文档
```

## 运行测试

项目根目录的 `package.json` 中已配置了以下测试命令：

### 运行所有测试

```bash
pnpm test
```

### 监视模式下运行测试（开发时使用）

```bash
pnpm test:watch
```

### 使用图形界面运行测试

```bash
pnpm test:ui
```

### 生成测试覆盖率报告

```bash
pnpm test:coverage
```

## 编写测试

### 权限系统测试

权限系统的测试包括：

1. **能力定义测试 (abilities.test.ts)**：测试不同角色的用户是否被正确赋予了预期的权限。

2. **工具函数测试 (utils.test.ts)**：测试权限工具函数，如 `can`, `getAbility`, `mapDatabaseRoleToAppRole` 等。

3. **中间件测试 (middleware.test.ts)**：测试权限中间件在 Next.js 和 Express/Nest.js 环境中的工作情况。

4. **集成场景测试 (integration.test.ts)**：模拟真实应用场景中的权限检查流程。

### 添加新测试

1. 创建以 `.test.ts` 结尾的文件
2. 使用 `describe` 和 `test`/`it` 组织测试
3. 使用 `expect` 进行断言

示例：

```typescript
import { describe, test, expect } from 'vitest';

describe('你的测试套件', () => {
  test('你的测试用例', () => {
    const result = yourFunction();
    expect(result).toBe(expectedValue);
  });
});
```

## 模拟数据

`mock-data.ts` 提供了测试所需的模拟用户和资源数据，包括：

- 不同角色的用户（普通用户、VIP用户、管理员）
- 项目数据
- 报告数据
- 订阅数据

如需添加更多模拟数据，请在此文件中扩展。 