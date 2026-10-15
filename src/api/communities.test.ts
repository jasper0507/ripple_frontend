import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  communitiesQueryOptions,
  communityQueryOptions,
  fetchCommunities,
  fetchCommunity,
  parseCommunityId,
} from './communities'
import { ApiError } from './errors'
import { accountScope, isAccountQuery } from './query-keys'

// 社区读取的公开入口：列表与详情走统一请求处理，不依赖登录。
// 不存在与失败必须保持分类，不能变成空列表。

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

describe('parseCommunityId', () => {
  it('接受正整数十进制', () => {
    expect(parseCommunityId('1')).toBe(1)
    expect(parseCommunityId('42')).toBe(42)
  })

  it('拒绝空值、0、负数、前导零和非数字', () => {
    expect(parseCommunityId(undefined)).toBeNull()
    expect(parseCommunityId('')).toBeNull()
    expect(parseCommunityId('0')).toBeNull()
    expect(parseCommunityId('-1')).toBeNull()
    expect(parseCommunityId('01')).toBeNull()
    expect(parseCommunityId('1.5')).toBeNull()
    expect(parseCommunityId('1e2')).toBeNull()
    expect(parseCommunityId('abc')).toBeNull()
    expect(parseCommunityId('1/2')).toBeNull()
    expect(parseCommunityId('9007199254740993')).toBeNull()
  })
})

describe('fetchCommunity', () => {
  it('解开社区详情，保留简介与创建时间', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          envelope({
            id: 1,
            name: 'Go',
            introduction: 'Go 开发交流',
            created_at: '2026-10-01T09:00:00+08:00',
          }),
        ),
      ),
    )

    await expect(fetchCommunity(1)).resolves.toEqual({
      id: 1,
      name: 'Go',
      introduction: 'Go 开发交流',
      created_at: '2026-10-01T09:00:00+08:00',
    })
  })

  it('不携带 Authorization，路径不含分页参数', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request)
      const request = input as Request
      expect(new URL(request.url).pathname).toBe('/api/v1/communities/1')
      expect(new URL(request.url).search).toBe('')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(
        envelope({
          id: 1,
          name: 'Go',
          introduction: '简介',
          created_at: '2026-10-01T09:00:00+08:00',
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchCommunity(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('社区不存在是 not-found，不是空结果', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { code: 'COMMUNITY_NOT_FOUND', message: '社区不存在', data: null },
          404,
        ),
      ),
    )

    const error = await fetchCommunity(99).then(
      () => null,
      (cause: unknown) => cause,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'not-found', code: 'COMMUNITY_NOT_FOUND', httpStatus: 404 })
  })

  it('参数错误不自动重试', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ code: 'INVALID_PARAMS', message: '请求参数无效', data: null }, 400),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCommunity(1)).rejects.toMatchObject({ kind: 'params', code: 'INVALID_PARAMS' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('临时服务器错误只自动重试一次', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            id: 1,
            name: 'Go',
            introduction: '简介',
            created_at: '2026-10-01T09:00:00+08:00',
          }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCommunity(1)).resolves.toMatchObject({ id: 1, name: 'Go' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('成功响应缺少 data 是协议错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 'OK', message: '成功', data: null })),
    )
    await expect(fetchCommunity(1)).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('详情缺少简介是协议错误，不是空简介', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(envelope({ id: 1, name: 'Go', created_at: '2026-10-01T09:00:00+08:00' })),
      ),
    )
    await expect(fetchCommunity(1)).rejects.toMatchObject({ kind: 'protocol' })
  })
})

describe('fetchCommunities：公开且不分页', () => {
  it('请求社区列表时不带分页参数和 Authorization', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input).toBeInstanceOf(Request)
      const request = input as Request
      expect(new URL(request.url).pathname).toBe('/api/v1/communities')
      expect(new URL(request.url).search).toBe('')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(envelope([{ id: 1, name: 'Go' }]))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCommunities()).resolves.toEqual([{ id: 1, name: 'Go' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('列表 data 为 null 是协议错误，不是空列表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 'OK', message: '成功', data: null })),
    )
    await expect(fetchCommunities()).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('列表条目缺少名称是协议错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope([{ id: 1 }]))),
    )
    await expect(fetchCommunities()).rejects.toMatchObject({ kind: 'protocol' })
  })
})

describe('社区 Query 是公共数据', () => {
  const community = {
    id: 7,
    name: 'Go',
    introduction: 'Go 开发交流',
    created_at: '2026-10-01T09:00:00+08:00',
  }

  it('列表与详情按资源和社区 ID 区分，不含账号作用域', () => {
    expect(communitiesQueryOptions().queryKey).toEqual(['communities'])
    expect(communityQueryOptions(7).queryKey).toEqual(['communities', 7])
    expect(communitiesQueryOptions().queryKey).not.toContain('account')
    expect(communityQueryOptions(7).queryKey).not.toContain('account')
  })

  it('清理某账号缓存时保留社区列表和详情', () => {
    const client = new QueryClient()
    const userUuid = '11111111-1111-1111-1111-111111111111'
    const voteKey = ['vote', 7, ...accountScope({ userUuid, sessionId: 'session-a' })] as const

    client.setQueryData(communitiesQueryOptions().queryKey, [{ id: 7, name: 'Go' }])
    client.setQueryData(communityQueryOptions(7).queryKey, community)
    client.setQueryData(voteKey, { direction: 1 })

    client.removeQueries({
      predicate: (query) => isAccountQuery(query.queryKey, userUuid),
    })

    expect(client.getQueryData(communitiesQueryOptions().queryKey)).toEqual([{ id: 7, name: 'Go' }])
    expect(client.getQueryData(communityQueryOptions(7).queryKey)).toEqual(community)
    expect(client.getQueryData(voteKey)).toBeUndefined()
    expect(isAccountQuery(communityQueryOptions(7).queryKey, userUuid)).toBe(false)
    expect(isAccountQuery(voteKey, userUuid)).toBe(true)
  })
})
