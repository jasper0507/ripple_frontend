import { ApiError } from '@/api/errors'

// 解析 Access JWT 的标准声明（sub / exp），用于本地到期判断与账号隔离标识。
// 不验证签名——签名由服务端中间件校验，本地解析只用于 UI 与调度，不能替代鉴权。
export interface AccessTokenClaims {
  userUuid: string
  /** 到期时间（毫秒时间戳） */
  expiresAtMs: number
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  // JWT payload 为 UTF-8 JSON；atob 返回字节序列，需要按 UTF-8 解码
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function readAccessTokenClaims(token: string): AccessTokenClaims {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) {
    throw new ApiError('protocol', '访问令牌格式不符合契约')
  }
  let payload: unknown
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]))
  } catch {
    throw new ApiError('protocol', '访问令牌内容无法解析')
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError('protocol', '访问令牌声明不符合契约')
  }
  const { sub, exp } = payload as Record<string, unknown>
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new ApiError('protocol', '访问令牌缺少用户标识')
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) {
    throw new ApiError('protocol', '访问令牌缺少到期时间')
  }
  return { userUuid: sub, expiresAtMs: exp * 1000 }
}

/** 提前 SKEW 视为到期，避免临界时刻发出的请求在服务端过期 */
const EXPIRY_SKEW_MS = 30 * 1000

export function isAccessTokenFresh(
  expiresAtMs: number,
  nowMs: number,
): boolean {
  return expiresAtMs - EXPIRY_SKEW_MS > nowMs
}
