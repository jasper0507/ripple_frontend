import { ApiError } from './errors'

// openapi-fetch 的响应形态：data 为解析后的响应正文（本契约中为业务信封），
// error 为非 2xx 的响应正文，网络异常与主动取消通过 reject 传递。
export type ClientResponse = {
  data?: unknown
  error?: unknown
  response: Response
}

type Envelope = {
  code: string
  message: string
  data: unknown
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'data' in value &&
    typeof (value as Envelope).code === 'string' &&
    typeof (value as Envelope).message === 'string'
  )
}

function classifyHttpFailure(status: number): ApiError['kind'] {
  if (status === 400) return 'params'
  if (status === 401) return 'auth'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server'
  return 'protocol'
}

function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === 'AbortError') ||
    (cause instanceof Error && cause.name === 'AbortError')
  )
}

/**
 * 解开业务信封：2xx 返回业务 data，204 返回 undefined；失败抛出分类错误。
 * 异常 JSON/HTML、缺失信封或缺失结果一律为协议错误，不伪装成功或空数据。
 */
export async function unwrap<TData = unknown>(
  request: Promise<ClientResponse>,
): Promise<TData> {
  let result: ClientResponse
  try {
    result = await request
  } catch (cause) {
    if (isAbortError(cause)) {
      throw new ApiError('aborted', '请求已取消', { cause })
    }
    throw new ApiError('network', '网络故障，请稍后重试', { cause })
  }

  const { data, error, response } = result

  // 删除、退出成功为 204，没有正文
  if (response.status === 204) {
    return undefined as TData
  }

  if (error !== undefined || !response.ok) {
    const kind = classifyHttpFailure(response.status)
    const body = isEnvelope(error) ? error : undefined
    throw new ApiError(kind, body?.message ?? `请求失败（HTTP ${response.status}）`, {
      httpStatus: response.status,
      code: body?.code,
    })
  }

  if (!isEnvelope(data)) {
    throw new ApiError('protocol', '响应格式不符合契约', {
      httpStatus: response.status,
    })
  }
  if (data.code !== 'OK') {
    throw new ApiError('protocol', '响应业务码与 HTTP 状态不符', {
      httpStatus: response.status,
      code: data.code,
    })
  }
  return data.data as TData
}

/**
 * 普通首次读取的重试策略：仅网络故障或临时服务器错误最多自动重试一次。
 * 追加分页与写请求不使用本函数；参数、权限、不存在、限流、协议错误与取消不重试。
 * 认证恢复的特殊规则由会话模块确定，不套用本策略。
 */
export async function getWithRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.kind === 'network' || error.kind === 'server')
    ) {
      return read()
    }
    throw error
  }
}
