import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCommunities } from './communities'
import { ApiError } from './errors'
import { getWithRetry, unwrap, type ClientResponse } from './request'

function envelope(data: unknown) {
  return { code: 'OK', message: '成功', data }
}

function errorEnvelope(code: string, message: string) {
  return { code, message, data: null }
}

function success(body: unknown, status = 200): Promise<ClientResponse> {
  return Promise.resolve({
    data: body,
    response: new Response(null, { status }),
  })
}

function failure(body: unknown, status: number): Promise<ClientResponse> {
  return Promise.resolve({
    error: body,
    response: new Response(null, { status }),
  })
}

async function expectKind(promise: Promise<unknown>, kind: ApiError['kind']) {
  await expect(promise).rejects.toMatchObject({ kind })
}

describe('unwrap：成功信封与 204', () => {
  it('解开业务信封返回 data', async () => {
    await expect(unwrap(success(envelope([{ id: 1, name: 'Go' }])))).resolves.toEqual([
      { id: 1, name: 'Go' },
    ])
  })

  it('204 无正文按成功处理', async () => {
    await expect(unwrap(success(undefined, 204))).resolves.toBeUndefined()
  })

  it('空数组是有效结果', async () => {
    await expect(unwrap(success(envelope([])))).resolves.toEqual([])
  })
})

describe('unwrap：协议错误不伪装成功', () => {
  it('2xx 返回 HTML 正文为协议错误', async () => {
    await expectKind(unwrap(success('<html>Bad Gateway</html>')), 'protocol')
  })

  it('2xx 缺少 data 字段为协议错误', async () => {
    await expectKind(unwrap(success({ code: 'OK', message: '成功' })), 'protocol')
  })

  it('2xx 业务码非 OK 为协议错误', async () => {
    await expectKind(unwrap(success(errorEnvelope('INTERNAL_ERROR', '服务器内部错误'))), 'protocol')
  })

  it('非信封的错误正文仍按 HTTP 状态分类', async () => {
    await expectKind(unwrap(failure('<html>not found</html>', 404)), 'not-found')
  })
})

describe('unwrap：失败分类保留 HTTP 状态与业务码', () => {
  it.each([
    [400, 'INVALID_PARAMS', 'params'],
    [401, 'INVALID_CREDENTIALS', 'auth'],
    [401, 'UNAUTHORIZED', 'auth'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'POST_NOT_FOUND', 'not-found'],
    [409, 'USERNAME_EXISTS', 'conflict'],
    [429, 'TOO_MANY_REQUESTS', 'rate-limited'],
    [500, 'INTERNAL_ERROR', 'server'],
  ] as const)('HTTP %i / %s 分类为 %s', async (status, code, kind) => {
    const promise = unwrap(failure(errorEnvelope(code, '提示'), status))
    await expect(promise).rejects.toMatchObject({ kind, httpStatus: status, code })
  })

  it('登录密码错误与会话失效通过 code 区分', async () => {
    const credentials = (await unwrap(
      failure(errorEnvelope('INVALID_CREDENTIALS', '用户名或密码错误'), 401),
    ).catch((e: unknown) => e)) as ApiError
    const session = (await unwrap(
      failure(errorEnvelope('UNAUTHORIZED', '未登录或登录已过期'), 401),
    ).catch((e: unknown) => e)) as ApiError
    expect(credentials).toBeInstanceOf(ApiError)
    expect(credentials.kind).toBe('auth')
    expect(credentials.code).toBe('INVALID_CREDENTIALS')
    expect(session.code).toBe('UNAUTHORIZED')
  })

  it('网络故障分类为 network', async () => {
    await expectKind(unwrap(Promise.reject(new TypeError('fetch failed'))), 'network')
  })

  it('主动取消分类为 aborted，不当作网络故障', async () => {
    await expectKind(
      unwrap(Promise.reject(new DOMException('aborted', 'AbortError'))),
      'aborted',
    )
  })
})

describe('getWithRetry：首次读取最多自动重试一次', () => {
  it('网络故障重试一次后成功', async () => {
    let calls = 0
    const read = () => {
      calls += 1
      return calls === 1
        ? unwrap(Promise.reject(new TypeError('fetch failed')))
        : unwrap(success(envelope('ok')))
    }
    await expect(getWithRetry(read)).resolves.toBe('ok')
    expect(calls).toBe(2)
  })

  it('临时服务器错误只追加一次请求', async () => {
    let calls = 0
    const read = () => {
      calls += 1
      return unwrap(failure(errorEnvelope('INTERNAL_ERROR', '服务器内部错误'), 500))
    }
    await expectKind(getWithRetry(read), 'server')
    expect(calls).toBe(2)
  })

  it.each([
    ['params', () => unwrap(failure(errorEnvelope('INVALID_PARAMS', '请求参数无效'), 400))],
    ['auth', () => unwrap(failure(errorEnvelope('UNAUTHORIZED', '未登录'), 401))],
    ['not-found', () => unwrap(failure(errorEnvelope('POST_NOT_FOUND', '帖子不存在'), 404))],
    ['rate-limited', () => unwrap(failure(errorEnvelope('TOO_MANY_REQUESTS', '请求过于频繁'), 429))],
    ['protocol', () => unwrap(success('<html>x</html>'))],
    ['aborted', () => unwrap(Promise.reject(new DOMException('aborted', 'AbortError')))],
  ] as const)('%s 错误不自动重试', async (kind, read) => {
    let calls = 0
    await expectKind(
      getWithRetry(() => {
        calls += 1
        return read()
      }),
      kind,
    )
    expect(calls).toBe(1)
  })
})

describe('fetchCommunities：真实请求管线', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  it('透传取消信号并解开信封', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(envelope([{ id: 1, name: 'Go' }])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await expect(fetchCommunities(controller.signal)).resolves.toEqual([{ id: 1, name: 'Go' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    // Request 可能派生信号；验证取消仍然传导
    const signal = (request as Request).signal
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('首次读取遇到临时服务器错误自动重试一次', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(errorEnvelope('INTERNAL_ERROR', '服务器内部错误'), 500))
      .mockResolvedValueOnce(jsonResponse(envelope([])))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCommunities()).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
