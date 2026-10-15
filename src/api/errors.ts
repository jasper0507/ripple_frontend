// 请求失败的统一分类。保留 HTTP 状态与业务码，由页面决定展示方式。
// 分类规则见 docs/frontend-plan.md Phase 4 Q6 与 Issue #2 验收标准。

export type ApiErrorKind =
  | 'network' // 无响应、连接失败等传输层故障
  | 'protocol' // 响应不符合契约：异常 JSON/HTML、缺失信封或结果
  | 'params' // 400 INVALID_PARAMS
  | 'auth' // 401，code 区分 INVALID_CREDENTIALS 与 UNAUTHORIZED
  | 'forbidden' // 403
  | 'not-found' // 404
  | 'conflict' // 409 USERNAME_EXISTS
  | 'rate-limited' // 429 TOO_MANY_REQUESTS：限流先于业务处理，写请求确定未执行
  | 'server' // 5xx 临时服务器错误
  | 'aborted' // 主动取消，不当作网络故障

export const RATE_LIMITED_MESSAGE = '请求过于频繁，请稍后再试'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly httpStatus?: number
  /** 后端业务码，如 INVALID_CREDENTIALS、USERNAME_EXISTS；非信封响应时为空 */
  readonly code?: string

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: { httpStatus?: number; code?: string; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.httpStatus = options?.httpStatus
    this.code = options?.code
  }
}
