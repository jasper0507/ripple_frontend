import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { accountScope, isAccountQuery } from './query-keys'
import type { PostPage } from './posts'
import {
  applyConfirmedVote,
  fetchPostVote,
  shouldReadVote,
  submitVote,
  voteQueryKey,
  voteRead,
  voteSubmitError,
  voteViewStillCurrent,
} from './votes'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(data: unknown) {
  return { code: 'OK', message: '成功', data }
}

const identity = {
  userUuid: '11111111-1111-1111-1111-111111111111',
  sessionId: 'session-a',
}

function summary(id: number) {
  return {
    id,
    title: `标题${id}`,
    author_id: identity.userUuid,
    author_username: 'alice',
    community_id: 1,
    community_name: 'Go',
    created_at: '2026-10-04T10:00:00+08:00',
  }
}

function detail(id: number, up: number, down: number) {
  return { ...summary(id), content: '正文', up_votes: up, down_votes: down }
}

function page(items: unknown[]): InfiniteData<PostPage> {
  return {
    pageParams: [1],
    pages: [{ page: 1, page_size: 10, total: items.length, items: items as PostPage['items'] }],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPostVote', () => {
  it('身份确认后的读取带 Bearer，0 是已确认的未投票而不是失败', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('GET')
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4/vote')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      return jsonResponse(envelope({ direction: 0 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPostVote('token-1', 4)).resolves.toEqual({ direction: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('受保护读取遇到 401 不在 API 层重试', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ code: 'UNAUTHORIZED', message: '未登录或登录已过期', data: null }, 401),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPostVote('expired', 4)).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('方向不是 -1、0、1 时是协议错误，不当作未投票', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(envelope({ direction: 2 }))))
    await expect(fetchPostVote('token-1', 4)).rejects.toMatchObject({ kind: 'protocol' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(envelope({}))))
    await expect(fetchPostVote('token-1', 4)).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('暂时失败会再请求一次，帖子不存在不会', async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500))
      .mockResolvedValueOnce(jsonResponse(envelope({ direction: 1 })))
    vi.stubGlobal('fetch', flaky)
    await expect(fetchPostVote('token-1', 4)).resolves.toEqual({ direction: 1 })
    expect(flaky).toHaveBeenCalledTimes(2)

    const missing = vi.fn(async () =>
      jsonResponse({ code: 'POST_NOT_FOUND', message: '帖子不存在', data: null }, 404),
    )
    vi.stubGlobal('fetch', missing)
    await expect(fetchPostVote('token-1', 4)).rejects.toMatchObject({ kind: 'not-found' })
    expect(missing).toHaveBeenCalledTimes(1)
  })
})

describe('submitVote', () => {
  it('按所选方向提交一次，不自动重试', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('PUT')
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4/vote')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      expect(await request.json()).toEqual({ direction: -1 })
      return jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitVote('token-1', 4, -1)).rejects.toMatchObject({ kind: 'server' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('取消和重复选择均可提交，成功回显服务端方向', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const { direction } = await (input as Request).json() as { direction: number }
      return jsonResponse(envelope({ post_id: 4, direction }))
    })
    vi.stubGlobal('fetch', fetchMock)
    for (const direction of [1, 1, -1, 0] as const) {
      await expect(submitVote('token-1', 4, direction)).resolves.toEqual({ post_id: 4, direction })
    }
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('成功回显缺少帖子或方向时是协议错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(envelope({ post_id: 4 }))))
    await expect(submitVote('token-1', 4, 1)).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('网络故障不自动重试，也不能据此断定没有写入', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed')
    })
    vi.stubGlobal('fetch', fetchMock)
    const error = await submitVote('token-1', 4, 1).then(
      () => null,
      (cause: unknown) => cause,
    )
    expect(error).toMatchObject({ kind: 'network' })
    expect(voteSubmitError(error)).toBe('unconfirmed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('投票方向的读取状态', () => {
  it('只有身份确认后才读取，游客和未确认身份不读', () => {
    expect(shouldReadVote('authenticated')).toBe(true)
    expect(shouldReadVote('guest')).toBe(false)
    expect(shouldReadVote('unknown')).toBe(false)
  })

  it('加载中和失败保持未知，0 是已确认的未投票', () => {
    expect(voteRead({ enabled: false, pending: true, failed: false, direction: 0 })).toEqual({
      status: 'unknown',
    })
    expect(voteRead({ enabled: true, pending: true, failed: false, direction: undefined })).toEqual({
      status: 'unknown',
    })
    expect(voteRead({ enabled: true, pending: false, failed: true, direction: undefined })).toEqual({
      status: 'unknown',
    })
    expect(voteRead({ enabled: true, pending: false, failed: false, direction: 0 })).toEqual({
      status: 'known',
      direction: 0,
    })
    expect(voteRead({ enabled: true, pending: false, failed: false, direction: 1 })).toEqual({
      status: 'known',
      direction: 1,
    })
    expect(voteRead({ enabled: true, pending: false, failed: false, direction: -1 })).toEqual({
      status: 'known',
      direction: -1,
    })
    expect(voteRead({ enabled: true, pending: false, failed: false, direction: 2 })).toEqual({
      status: 'unknown',
    })
  })

  it('缓存键含帖子、用户和本次会话，不含访问令牌', () => {
    const key = voteQueryKey(4, identity)
    expect(key).toEqual(['votes', 4, ...accountScope(identity)])
    expect(key).not.toContain('token-1')
    expect(isAccountQuery(key, identity.userUuid)).toBe(true)
  })
})

describe('voteViewStillCurrent', () => {
  const captured = { postId: 35, userUuid: identity.userUuid, sessionId: identity.sessionId }

  it('同一篇帖子、同一次登录才更新当前页面', () => {
    expect(voteViewStillCurrent(captured, { postId: 35, identity })).toBe(true)
  })

  it('换帖、退出或换账号后，迟到回调不更新当前页面', () => {
    expect(voteViewStillCurrent(captured, { postId: 34, identity })).toBe(false)
    expect(voteViewStillCurrent(captured, { postId: 35, identity: null })).toBe(false)
    expect(
      voteViewStillCurrent(captured, {
        postId: 35,
        identity: { userUuid: '22222222-2222-2222-2222-222222222222', sessionId: identity.sessionId },
      }),
    ).toBe(false)
    expect(
      voteViewStillCurrent(captured, {
        postId: 35,
        identity: { userUuid: identity.userUuid, sessionId: 'session-b' },
      }),
    ).toBe(false)
  })
})

describe('applyConfirmedVote', () => {
  it('用 PUT 回显更新本人方向，更新详情票数，列表原样保留', async () => {
    const client = new QueryClient()
    const listKey = ['posts', 'list', null, 'time'] as const
    client.setQueryData(listKey, page([summary(1), summary(4), summary(9)]))
    client.setQueryData(['posts', 'detail', 4], detail(4, 3, 1))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('GET')
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(envelope(detail(4, 4, 1)))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      applyConfirmedVote(client, {
        postId: 4,
        confirmed: { post_id: 4, direction: 1 },
        identity,
        stillCurrent: () => true,
      }),
    ).resolves.toBe('updated')

    expect(client.getQueryData(voteQueryKey(4, identity))).toEqual({ direction: 1 })
    const items = client.getQueryData<InfiniteData<PostPage>>(listKey)?.pages[0]?.items
    expect(items?.map((item) => item.id)).toEqual([1, 4, 9])
    expect(items?.[1]).toEqual(summary(4))
    expect(client.getQueryData(['posts', 'detail', 4])).toMatchObject({
      up_votes: 4,
      down_votes: 1,
      content: '正文',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('票数读取失败时保留已确认方向，不改列表，也不再发投票', async () => {
    const client = new QueryClient()
    const listKey = ['posts', 'list', 1, 'hot'] as const
    client.setQueryData(listKey, page([summary(4)]))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      applyConfirmedVote(client, {
        postId: 4,
        confirmed: { post_id: 4, direction: -1 },
        identity,
        stillCurrent: () => true,
      }),
    ).resolves.toBe('counts-unavailable')

    expect(client.getQueryData(voteQueryKey(4, identity))).toEqual({ direction: -1 })
    expect(client.getQueryData<InfiniteData<PostPage>>(listKey)?.pages[0]?.items[0]).toEqual(summary(4))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([input]) => (input as Request).method === 'GET')).toBe(true)
  })

  it('会话已经变了就不写方向，也不用这次详情回填票数', async () => {
    const client = new QueryClient()
    const listKey = ['posts', 'list', null, 'time'] as const
    client.setQueryData(listKey, page([summary(4)]))
    const otherKey = voteQueryKey(4, { userUuid: identity.userUuid, sessionId: 'session-b' })
    client.setQueryData(otherKey, { direction: 0 })
    const fetchMock = vi.fn(async () => jsonResponse(envelope(detail(4, 9, 9))))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      applyConfirmedVote(client, {
        postId: 4,
        confirmed: { post_id: 4, direction: 1 },
        identity,
        stillCurrent: () => false,
      }),
    ).resolves.toBe('stale')

    expect(client.getQueryData(voteQueryKey(4, identity))).toBeUndefined()
    expect(client.getQueryData(otherKey)).toEqual({ direction: 0 })
    expect(client.getQueryData<InfiniteData<PostPage>>(listKey)?.pages[0]?.items[0]).toEqual(summary(4))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('详情返回时会话已变，不把票数写进当前页面', async () => {
    const client = new QueryClient()
    const listKey = ['posts', 'list', null, 'time'] as const
    client.setQueryData(listKey, page([summary(4)]))
    let current = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        current = false
        return jsonResponse(envelope(detail(4, 8, 0)))
      }),
    )

    await expect(
      applyConfirmedVote(client, {
        postId: 4,
        confirmed: { post_id: 4, direction: 1 },
        identity,
        stillCurrent: () => current,
      }),
    ).resolves.toBe('stale')

    expect(client.getQueryData(voteQueryKey(4, identity))).toEqual({ direction: 1 })
    expect(client.getQueryData<InfiniteData<PostPage>>(listKey)?.pages[0]?.items[0]).toEqual(summary(4))
  })

  it('回显的帖子对不上时不写入方向', async () => {
    const client = new QueryClient()
    const fetchMock = vi.fn(async () => jsonResponse(envelope(detail(4, 8, 0))))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      applyConfirmedVote(client, {
        postId: 4,
        confirmed: { post_id: 9, direction: 1 },
        identity,
        stillCurrent: () => true,
      }),
    ).resolves.toBe('rejected')

    expect(client.getQueryData(voteQueryKey(4, identity))).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('voteSubmitError', () => {
  it('结果未确认、帖子不存在和明确拒绝分开', () => {
    expect(voteSubmitError(new ApiError('server', '服务器内部错误'))).toBe('unconfirmed')
    expect(voteSubmitError(new ApiError('protocol', '响应格式不符合契约'))).toBe('unconfirmed')
    expect(voteSubmitError(new ApiError('not-found', '帖子不存在'))).toBe('missing')
    // 429 在业务处理前拒绝，确定未写入，不走结果未确认的重新查询
    expect(
      voteSubmitError(new ApiError('rate-limited', '请求过于频繁', { httpStatus: 429, code: 'TOO_MANY_REQUESTS' })),
    ).toBe('rate-limited')
    expect(voteSubmitError(new ApiError('params', '请求参数无效'))).toBe('rejected')
    expect(voteSubmitError(new ApiError('conflict', '其他冲突', { code: 'USERNAME_EXISTS' }))).toBe(
      'rejected',
    )
  })
})
