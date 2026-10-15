import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiLogin, apiLogout, apiRefresh, apiSignup } from './auth'

// 认证传输层的真实请求管线：确认蛇形契约字段映射为驼峰，
// 204 退出与错误分类沿用 unwrap 规则（详细分类见 request.test.ts）。

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(data: unknown) {
  return { code: 'OK', message: '成功', data }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiLogin：契约字段映射', () => {
  it('access_token 映射为 accessToken', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        envelope({ username: 'alice', access_token: 'header.payload.sig', token_type: 'Bearer' }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiLogin({ username: 'alice', password: 'p' })).resolves.toEqual({
      username: 'alice',
      accessToken: 'header.payload.sig',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('凭据错误保留业务码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { code: 'INVALID_CREDENTIALS', message: '用户名或密码错误', data: null },
          401,
        ),
      ),
    )
    await expect(apiLogin({ username: 'a', password: 'b' })).rejects.toMatchObject({
      kind: 'auth',
      code: 'INVALID_CREDENTIALS',
    })
  })
})

describe('apiRefresh：契约字段映射', () => {
  it('access_token 映射为 accessToken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(envelope({ access_token: 'new.token.here', token_type: 'Bearer' })),
      ),
    )
    await expect(apiRefresh()).resolves.toEqual({ accessToken: 'new.token.here' })
  })
})

describe('apiSignup 与 apiLogout', () => {
  it('注册返回用户名', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope({ username: 'alice' }), 201)),
    )
    await expect(
      apiSignup({ username: 'alice', password: 'Example123', confirm_password: 'Example123' }),
    ).resolves.toEqual({ username: 'alice' })
  })

  it('退出 204 无正文按成功处理', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    await expect(apiLogout()).resolves.toBeUndefined()
  })
})
