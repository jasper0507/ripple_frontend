# Bluebell Frontend

Bluebell 是前后端分离的社区讨论项目。本仓库负责前端，后端代码已由用户实现，位于同级目录 `../bluebell_backend`。前端按后端接口契约实现，禁止修改后端代码。

## 后端同步（2026-10-15）

已适配后端 `d18c55b`：注册密码改为 8–20 位不含空格的可打印 ASCII，须同时包含
大写字母、小写字母、数字和特殊符号（登录校验不变，旧账号照常登录）；`/api/v1`
按客户端 IP 限流，429 `TOO_MANY_REQUESTS` 单独分类，写操作提示稍后再试并保留输入，
续期被限流按暂时无法续期处理。契约来源见[契约记录](openapi/README.md)，验证见
[维护验证](docs/verification/backend-sync-2026-10-15.md)。

## 后端同步（2026-10-08）

已适配后端 `a173d1b`：作者字段改为 `author_username`；帖子列表与热门讨论
不再显示接口已移除的票数，详情保留实时票数；登录后读取本人投票方向，
不再处理七天截止。帖子列表按页码与总数推进，允许异步索引造成的短页和空页。
帖子正文上限 10,000 个 Unicode 字符、评论上限 2,000 个字符，超限保留草稿。
维护期间后端已补齐两项上限，最终快照来源见[契约记录](openapi/README.md)，
测试与联调边界见[维护验证](docs/verification/backend-sync.md)。

## UI 改造交付（2026-10-05）

当前界面以帖子流与单列阅读为中心：首页采用紧凑帖子流与相对时间，票数仅在详情显示（2026-10-08 随后端契约调整）；移除顶部刷新、黄色品牌和账号卡，发布移到帖子列表顶部，使用浅灰底与灰蓝文字；导航和热门讨论保留明确层级；手机标题占满可用宽度，社区位于票数行。详情页的正文、投票、评论与输入区已重新排版。新增写评论定位、清空草稿确认，登录往返保留列表来源，发帖预选有效来源社区。评论数按用户决定先省略。

- [产品与交互说明](docs/PRD.md)
- [前端设计与实现边界](docs/DESIGN.md)
- [静态视觉评审稿](docs/visual-preview.html)：可直接用浏览器打开，不连接后端
- [C 字标与抽象图标](docs/verification/brand-c.md)：保留原配色与布局，附验证结果
- [发布入口调整验证](docs/verification/publish-entry.md)：五种屏宽、位置配色与来源恢复
- [界面与交互验证](docs/verification/ux-polish.md)：类型、测试、契约、构建，以及真实 Chromium 与模拟 API 的交互和响应式检查；真实后端与触屏软键盘待验收
- [上一轮帖子流验证](docs/verification/post-stream.md)：保留历史结果

使用当前复制的依赖时，可用 `make dev` 启动；全新安装先执行 `make install`。

## 工程

技术栈：React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + Lucide + React Router Data Mode + TanStack Query + openapi-typescript/openapi-fetch，包管理使用 pnpm。

动画使用 Tailwind 内置工具类，无额外动画样式依赖。

帖子详情通过 React Router `route.lazy` 按需加载，正文 Markdown 解析依赖随详情页分包，首页不下载该分包。直接打开详情地址时，在分包加载期间显示「正在加载帖子页面…」；加载失败交由现有路由错误页处理。体积与浏览器验证见[构建分包验证](docs/verification/bundle-splitting.md)。

### 环境与安装

- Node.js（开发使用 v24）与 pnpm（`packageManager` 锁定 11.22.0）
- GNU Make（使用下方快捷命令时需要）
- `make install`：通过 `pnpm install --frozen-lockfile` 安装，不更新锁文件

### Makefile 快捷命令

直接运行 `make` 或 `make help` 查看命令。所有目标沿用项目现有 pnpm 脚本，运行脚本时关闭 pnpm 的自动依赖安装；缺依赖时先执行 `make install`。

| 命令 | 用途 |
| --- | --- |
| `make dev` | 启动开发服务器，默认 `127.0.0.1:5173` |
| `make preview` | 先构建，再预览生产产物，默认 `127.0.0.1:4173` |
| `make build` | 类型检查并构建到 `dist` |
| `make typecheck` / `make lint` / `make test` | 单独运行对应检查 |
| `make check` | 顺序运行类型、lint、测试、契约检查和构建；默认遇错停止 |
| `make contract-check` | 检查前端契约快照与生成类型一致性 |
| `make contract-sync` | 读取同级后端 OpenAPI，更新前端快照和类型；不写后端 |
| `make clean` | 删除 `dist`、`dist-ssr` 及 TypeScript/Vite 缓存，保留依赖与锁文件 |

可覆盖监听地址、端口、pnpm 命令和契约来源：

```bash
make dev DEV_PORT=5174
make dev HOST=0.0.0.0
make preview PREVIEW_PORT=4174
make contract-sync OPENAPI="/path/to/openapi.yaml"
```

开发和预览端口被占用时直接报错，不自动切换端口。检查目标串行执行，避免类型检查与构建同时写入 TypeScript 缓存。契约同步后需审阅生成差异，并更新 [契约来源记录](openapi/README.md)。

`artifacts/` 存放本地交付补丁和临时验收产物，已忽略，避免补丁中的历史类名参与 Tailwind 自动扫描。

### 命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器，`/api`、`/ping`、`/health` 代理到 `http://localhost:8080`，保留完整 API 前缀 |
| `pnpm build` | 类型检查并构建生产产物 |
| `pnpm preview` | 预览构建产物 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | Vitest 行为测试（请求层、社区读取、认证传输与会话协调） |
| `pnpm contract:check` | 从仓库快照重新生成类型并与已提交类型比较，差异即失败 |
| `pnpm contract:sync [路径]` | 显式同步后端 OpenAPI 快照并重新生成类型，默认读取 `../bluebell_backend/docs/openapi.yaml` |

### 目录

```text
openapi/          OpenAPI 契约快照与来源记录（类型生成的唯一输入）
scripts/          契约同步与一致性检查脚本
src/
  app/            路由、Provider、会话 Context 与两类布局
  pages/          业务页面与路由状态页
  components/     共用界面组件；ui/ 为 shadcn/ui 基础组件
  api/            生成类型、请求客户端、错误分类、查询约定与资源查询
  lib/            实际复用的共用逻辑
```

### 契约与请求层

- `openapi/openapi.yaml` 是显式同步的契约快照，来源提交与 SHA256 记录在 `openapi/README.md`；正常构建与检查不依赖同级后端或联网契约。
- 请求层解开 `{code, message, data}` 业务信封，204 按无正文成功处理；失败抛出保留 HTTP 状态与业务码的分类错误（网络、协议、参数、权限、不存在、冲突、限流、服务器、认证、主动取消）；普通首次读取对网络或临时服务器错误最多自动重试一次，限流、追加分页与写请求不自动重试。
- TanStack Query 是唯一服务端缓存，仅存当前标签页内存；会话使用 React Context，表单与弹窗保留局部状态。

### 本地联调

后端未配置 CORS，开发经 Vite 代理同源访问。准备步骤：

```bash
cd ../bluebell_backend
docker compose up -d        # MySQL + Redis
go run ./cmd/migrate        # 建表
go run ./cmd/server         # 监听 :8080
make -C ../bluebell_frontend dev
```

部署形态：Nginx 在同一 HTTPS 入口提供静态文件与 `/api/v1` 反代，前端路由回退到 `index.html`，API 错误不得回退为 HTML。

后端按客户端 IP 限流（默认每 IP 每秒 20 次、突发 40 次；注册和登录另限每 5 秒 1 次、突发 5 次）。经 Nginx 反代时，Nginx 需转发 `X-Forwarded-For`（或 `X-Real-IP`），后端配置 `http.trusted_proxies` 包含 Nginx 地址；否则所有访客按 Nginx 的同一 IP 计数，很快互相触发 429。本地 Vite 代理同理，所有请求都来自 `127.0.0.1`。

## 项目文档

- [首版规格 #1](https://github.com/jasper0507/bluebell_frontend/issues/1)：完整业务范围、70 条用户故事、实现约束、已确认测试边界与认证接入差异，标记为 `ready-for-agent`。
- [首版模块任务](docs/frontend-plan.md#首版模块任务)：七张模块票及原生阻塞关系。
- [前端规划](docs/frontend-plan.md)：四阶段任务、接口约束、功能与流程、技术栈与设计决策、架构及 API/types 讨论。
- [领域术语](CONTEXT.md)：社区、帖子、评论、回复和投票的统一定义。
- [后端项目说明](../bluebell_backend/README.md)。

## 当前边界

- 工程与 API 基础（Issue #2）、账号认证与会话（Issue #3）已交付。认证差异的收口见 [ADR 0001](docs/adr/0001-auth-session.md)。
- 社区模块（Issue #4）已接入公开社区列表和详情。导航与社区页使用真实名称和简介，并区分不存在、地址无效、列表为空和加载失败。行为与验证见 [社区模块验证记录](docs/verification/communities.md)。
- 帖子模块（Issue #5）已接入首页和社区列表、详情、发帖和删帖。行为与验证见 [帖子模块验证记录](docs/verification/posts.md)。
- 评论与回复（Issue #6）已接入阅读、发表、回复和删除。评论是纯文本，和正文一起整页滚动。行为与验证见 [评论与回复验证记录](docs/verification/comments.md)。
- 投票模块（Issue #7）已在详情页提供赞成、反对和取消。票数按帖子 ID 更新，不重排列表。登录后查询本人投票方向，刷新后可恢复；读取失败保持未知。行为与验证见 [投票模块验证记录](docs/verification/votes.md)。
