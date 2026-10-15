# OpenAPI 契约快照

`openapi.yaml` 是从后端仓库显式同步的接口契约快照，是前端类型生成的唯一输入。
正常构建与检查只使用本快照，不依赖同级后端目录或远程契约地址。

## 当前来源

| 项 | 值 |
| --- | --- |
| 来源文件 | `bluebell_backend/docs/openapi.yaml` |
| 后端提交 | `d18c55bf471d2fb53837485eeefa7ab45149d723` |
| SHA256 | `09f433e4bfa4cca1d193cba962eadfdcd42ae095f6af1955ac6ac06a6eb2aadb` |
| 同步日期 | 2026-10-15 |

## 同步与检查

- 同步（显式、手动）：`pnpm contract:sync [后端 openapi.yaml 路径]`
  默认从 `../bluebell_backend/docs/openapi.yaml` 复制快照并重新生成
  `src/api/types.ts`。同步后核对新 SHA256、审阅类型差异，并更新本表的
  来源提交、SHA256 与日期。
- 检查（常态）：`pnpm contract:check`
  使用锁定版本的 openapi-typescript 从本快照重新生成到临时位置，与已提交
  的 `src/api/types.ts` 比较，存在差异即失败。

检查只证明生成物与快照一致；源码与契约的偏差需在同步时只读复核及真实
联调识别。

## 本次复核（2026-10-15）

对照 `a173d1b..d18c55b` 的 36 个提交，契约变化与源码一致：

- 注册密码：`maxLength` 20，必须同时含大写字母、小写字母、数字和特殊符号，
  仅限不含空格的可打印 ASCII（`handler/user.go` 的 `validPassword`）。
- 新增 `429 / TOO_MANY_REQUESTS`：`/api/v1` 全部操作按客户端 IP 限流，
  注册和登录另有更严的令牌桶，不返回 `Retry-After`（`middleware/rate_limit.go`）。
- 删除评论：所属帖子已删除时返回 `404 / COMMENT_NOT_FOUND`。

其他对外影响较小的变化：帖子列表 `order` 省略或为空时按时间排序，与契约描述一致
（前端始终显式传入）；登录对不存在的用户名做等时比对，响应不变。

## 上次复核（2026-10-08）

维护期间后端新增 `a173d1b`，已为帖子正文 10,000 个字符、评论
2,000 个字符补齐 `maxLength` 和说明。最终快照与该提交的来源逐字一致，
生成类型由快照生成；此前发现的长度说明偏差已消除。

前端按提交时去掉首尾空白后的 Unicode 字符数校验，超限保留草稿。
本次核对的路由、作者字段、详情票数、投票响应、异步列表行为及长度
限制均与契约一致。检查快照与生成类型一致，不等于真实后端联调通过，见
[维护验证](../docs/verification/backend-sync.md)。
