<div align="center">

# Bluebell Frontend

**Bluebell 社区论坛的 Web 前端：游客浏览、发帖、投票、评论回复**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

[后端](https://github.com/jasper0507/bluebell) · [前端规划](docs/frontend-plan.md) · [设计](docs/DESIGN.md)

</div>

---

- **契约驱动**：类型由后端 OpenAPI 快照生成，`make contract-check` 防止漂移。
- **双令牌会话**：access token 只在内存，refresh token 走 HttpOnly Cookie，多标签页同步登录与退出。
- **失败不吞**：错误按网络、认证、限流等分类；写请求结果未确认不重放，草稿保留。

## 快速开始

需要 Node.js 24、pnpm 11，并先按[后端说明](https://github.com/jasper0507/bluebell#快速开始)启动服务。

```bash
make install
make dev      # http://127.0.0.1:5173，/api 代理到 localhost:8080
make check    # 类型、lint、测试、契约检查、构建
```

后端接口变化时运行 `make contract-sync`，并在 [openapi/README.md](openapi/README.md) 记录来源提交。

## 部署

Caddy 在同一域名下提供静态文件并反代 API：

```caddyfile
bluebell.example.com {
	handle /api/v1/* {
		reverse_proxy 127.0.0.1:8080
	}
	handle {
		root * /var/www/bluebell
		try_files {path} /index.html
		file_server
	}
}
```

后端需配置 `http.trusted_proxies` 包含 Caddy 地址（否则所有访客共用一个限流桶），并开启 `auth.cookie_secure`。

## 已知限制

- 后端无 CORS，必须同源部署；页码分页在并发写入时可能漏读；草稿关闭浏览器后不保证恢复。
