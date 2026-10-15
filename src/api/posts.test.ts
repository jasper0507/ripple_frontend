import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { accountScope, isAccountQuery, queryKeys } from './query-keys'
import {
  applyDeletedPost,
  createPost,
  deletePost,
  fetchPost,
  loadPostListPage,
  parsePostId,
  patchPostVotes,
  postQueryOptions,
  postsListQueryOptions,
  type PostPage,
} from './posts'
import {
  bumpPostListGeneration,
  createPostListMemory,
  isPostListAppendPaused,
  isPostListGenerationCurrent,
  postListViewKey,
} from '@/lib/post-list'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(data: unknown) {
  return { code: 'OK', message: '成功', data }
}

function summary(id: number) {
  return {
    id,
    title: `标题${id}`,
    author_id: '11111111-1111-1111-1111-111111111111',
    author_username: 'alice',
    community_id: 1,
    community_name: 'Go',
    created_at: '2026-10-01T10:00:00+08:00',
  }
}

function page(items: unknown[], total = items.length, pageNumber = 1): PostPage {
  return { page: pageNumber, page_size: 10, total, items: items as PostPage['items'] }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parsePostId', () => {
  it('接受正整数十进制', () => {
    expect(parsePostId('1')).toBe(1)
    expect(parsePostId('42')).toBe(42)
  })

  it('拒绝空值、0、前导零和非数字', () => {
    expect(parsePostId(undefined)).toBeNull()
    expect(parsePostId('0')).toBeNull()
    expect(parsePostId('01')).toBeNull()
    expect(parsePostId('abc')).toBeNull()
  })
})

describe('loadPostListPage', () => {
  it('公开请求不带 Authorization，并带上页码、排序和社区', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      const url = new URL(request.url)
      expect(url.pathname).toBe('/api/v1/posts')
      expect(url.searchParams.get('page')).toBe('2')
      expect(url.searchParams.get('order')).toBe('hot')
      expect(url.searchParams.get('community_id')).toBe('7')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(envelope(page([summary(1)], 11, 2)))
    })
    vi.stubGlobal('fetch', fetchMock)

    const memory = createPostListMemory()
    await expect(
      loadPostListPage(
        { page: 2, order: 'hot', communityId: 7 },
        memory,
        postListViewKey(7, 'hot'),
      ),
    ).resolves.toMatchObject({ page: 2, page_size: 10, total: 11 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('全站列表不传 community_id', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL((input as Request).url)
      expect(url.searchParams.has('community_id')).toBe(false)
      expect(url.searchParams.get('order')).toBe('time')
      return jsonResponse(envelope(page([summary(1)])))
    })
    vi.stubGlobal('fetch', fetchMock)

    await loadPostListPage(
      { page: 1, order: 'time', communityId: null },
      createPostListMemory(),
      postListViewKey(null, 'time'),
    )
  })

  it('每页条数不是 10 或条目缺少标题时是协议错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope({ ...page([summary(1)]), page_size: 20 }))),
    )
    await expect(
      loadPostListPage(
        { page: 1, order: 'time', communityId: null },
        createPostListMemory(),
        postListViewKey(null, 'time'),
      ),
    ).rejects.toMatchObject({ kind: 'protocol' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope(page([{ id: 1 }])))),
    )
    await expect(
      loadPostListPage(
        { page: 1, order: 'time', communityId: null },
        createPostListMemory(),
        postListViewKey(null, 'time'),
      ),
    ).rejects.toMatchObject({ kind: 'protocol' })
  })

  it('首页暂时失败会再请求一次，追加失败不会', async () => {
    const firstPage = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500))
      .mockResolvedValueOnce(jsonResponse(envelope(page([summary(1)]))))
    vi.stubGlobal('fetch', firstPage)
    await expect(
      loadPostListPage(
        { page: 1, order: 'time', communityId: null },
        createPostListMemory(),
        postListViewKey(null, 'time'),
      ),
    ).resolves.toMatchObject({ page: 1 })
    expect(firstPage).toHaveBeenCalledTimes(2)

    const nextPage = vi.fn(async () =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500),
    )
    vi.stubGlobal('fetch', nextPage)
    await expect(
      loadPostListPage(
        { page: 2, order: 'time', communityId: null },
        createPostListMemory(),
        postListViewKey(null, 'time'),
      ),
    ).rejects.toMatchObject({ kind: 'server' })
    expect(nextPage).toHaveBeenCalledTimes(1)
  })

  it('代次变化后不接受这一页', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate
        return jsonResponse(envelope(page([summary(1)], 11, 2)))
      }),
    )
    const memory = createPostListMemory()
    const viewKey = postListViewKey(null, 'time')
    const pending = loadPostListPage({ page: 2, order: 'time', communityId: null }, memory, viewKey)
    bumpPostListGeneration(memory, viewKey)
    release()
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })
})

describe('fetchPost', () => {
  it('解开正文，且不带 Authorization', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(envelope({ ...summary(4), content: '正文', up_votes: 3, down_votes: 1 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPost(4)).resolves.toMatchObject({ id: 4, content: '正文', up_votes: 3 })
  })

  it('暂时失败只自动重试一次', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500))
      .mockResolvedValueOnce(jsonResponse(envelope({ ...summary(4), content: '正文', up_votes: 3, down_votes: 1 })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPost(4)).resolves.toMatchObject({ content: '正文' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('详情缺少票数时拒绝响应，不伪装为零票', async () => {
    for (const data of [
      { ...summary(4), content: '正文' },
      { ...summary(4), content: '正文', up_votes: 0 },
      { ...summary(4), content: '正文', up_votes: 0, down_votes: '0' },
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(envelope(data))))
      await expect(fetchPost(4)).rejects.toMatchObject({ kind: 'protocol' })
    }
  })

  it('缺少正文是协议错误，帖子不存在保持 not-found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope(summary(4)))),
    )
    await expect(fetchPost(4)).rejects.toMatchObject({ kind: 'protocol' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 'POST_NOT_FOUND', message: '帖子不存在', data: null }, 404)),
    )
    await expect(fetchPost(4)).rejects.toMatchObject({ kind: 'not-found', code: 'POST_NOT_FOUND' })
  })
})

describe('createPost', () => {
  it('返回新建 ID，不改已加载列表', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('POST')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      expect(await request.json()).toEqual({ title: '标题', content: '正文', community_id: 1 })
      return jsonResponse(envelope({ id: 9 }), 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const key = queryKeys.posts.list(null, 'time')
    const loaded: InfiniteData<PostPage> = {
      pageParams: [1],
      pages: [page([summary(1)])],
    }
    client.setQueryData(key, loaded)

    await expect(
      createPost('token-1', { title: '标题', content: '正文', community_id: 1 }),
    ).resolves.toEqual({ id: 9 })
    expect(client.getQueryData(key)).toEqual(loaded)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('网络故障不自动重试', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed')
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      createPost('token-1', { title: '标题', content: '正文', community_id: 1 }),
    ).rejects.toMatchObject({ kind: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('deletePost', () => {
  it('204 视为删除成功', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('DELETE')
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(deletePost('token-1', 4)).resolves.toBeUndefined()
  })

  it('无权限、不存在和网络故障都不会自动重试', async () => {
    const forbidden = vi.fn(async () =>
      jsonResponse({ code: 'FORBIDDEN', message: '无权执行此操作', data: null }, 403),
    )
    vi.stubGlobal('fetch', forbidden)
    await expect(deletePost('token-1', 4)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(forbidden).toHaveBeenCalledTimes(1)

    const missing = vi.fn(async () =>
      jsonResponse({ code: 'POST_NOT_FOUND', message: '帖子不存在', data: null }, 404),
    )
    vi.stubGlobal('fetch', missing)
    await expect(deletePost('token-1', 4)).rejects.toMatchObject({ kind: 'not-found' })
    expect(missing).toHaveBeenCalledTimes(1)

    const offline = vi.fn(async () => {
      throw new TypeError('failed')
    })
    vi.stubGlobal('fetch', offline)
    await expect(deletePost('token-1', 4)).rejects.toMatchObject({ kind: 'network' })
    expect(offline).toHaveBeenCalledTimes(1)
  })
})

describe('帖子缓存', () => {
  it('只更新详情票数，列表缓存和顺序不变', () => {
    const client = new QueryClient()
    const listKey = queryKeys.posts.list(1, 'hot')
    const loaded: InfiniteData<PostPage> = {
      pageParams: [1],
      pages: [page([summary(1), summary(2), summary(3)])],
    }
    client.setQueryData(listKey, loaded)
    client.setQueryData(queryKeys.posts.detail(2), { ...summary(2), content: '正文' })

    patchPostVotes(client, 2, { up_votes: 8, down_votes: 0 })

    const items = client.getQueryData<InfiniteData<PostPage>>(listKey)?.pages[0]?.items
    expect(items?.map((item) => item.id)).toEqual([1, 2, 3])
    expect(client.getQueryData(listKey)).toBe(loaded)
    expect(items?.[1]).not.toHaveProperty('up_votes')
    expect(items?.[1]).not.toHaveProperty('down_votes')
    expect(client.getQueryData(queryKeys.posts.detail(2))).toMatchObject({
      up_votes: 8,
      down_votes: 0,
      content: '正文',
    })
  })

  it('删除成功后从列表移除，并清掉详情、评论和本人方向', () => {
    const client = new QueryClient()
    const memory = createPostListMemory()
    const sourceKey = postListViewKey(null, 'time')
    const homeKey = queryKeys.posts.list(null, 'time')
    const otherKey = queryKeys.posts.list(9, 'time')
    client.setQueryData<InfiniteData<PostPage>>(homeKey, {
      pageParams: [1],
      pages: [page([summary(1), summary(2)])],
    })
    client.setQueryData<InfiniteData<PostPage>>(otherKey, {
      pageParams: [1],
      pages: [page([{ ...summary(5), community_id: 9 }])],
    })
    client.setQueryData(queryKeys.posts.detail(2), { ...summary(2), content: '正文' })
    client.setQueryData(queryKeys.comments.list(2), { pages: [] })
    const voteKey = [...queryKeys.votes.byPost(2), ...accountScope({ userUuid: 'u', sessionId: 's' })]
    client.setQueryData(voteKey, { direction: 1 })

    applyDeletedPost(client, memory, 2, sourceKey)

    expect(client.getQueryData<InfiniteData<PostPage>>(homeKey)?.pages[0]?.items.map((item) => item.id)).toEqual([1])
    expect(client.getQueryData<InfiniteData<PostPage>>(otherKey)?.pages[0]?.items).toHaveLength(1)
    expect(client.getQueryData(queryKeys.posts.detail(2))).toBeUndefined()
    expect(client.getQueryData(queryKeys.comments.list(2))).toBeUndefined()
    expect(client.getQueryData(voteKey)).toBeUndefined()
    expect(isPostListAppendPaused(memory, sourceKey)).toBe(true)
    expect(isPostListAppendPaused(memory, postListViewKey(9, 'time'))).toBe(false)
    expect(isPostListGenerationCurrent(memory, sourceKey, 0)).toBe(false)
  })

  it('列表和详情是公共查询，清理账号缓存时保留', () => {
    expect(postsListQueryOptions(null, 'time').queryKey).toEqual(['posts', 'list', null, 'time'])
    expect(postQueryOptions(4).queryKey).toEqual(['posts', 'detail', 4])
    expect(postsListQueryOptions(3, 'hot').queryKey).not.toContain('account')

    const client = new QueryClient()
    const userUuid = '11111111-1111-1111-1111-111111111111'
    const voteKey = [...queryKeys.votes.byPost(4), ...accountScope({ userUuid, sessionId: 'session-a' })]
    client.setQueryData(postsListQueryOptions(null, 'time').queryKey, {
      pageParams: [1],
      pages: [page([summary(4)])],
    })
    client.setQueryData(postQueryOptions(4).queryKey, { ...summary(4), content: '正文', up_votes: 3, down_votes: 1 })
    client.setQueryData(voteKey, { direction: 1 })

    client.removeQueries({
      predicate: (query) => isAccountQuery(query.queryKey, userUuid),
    })

    expect(client.getQueryData(postsListQueryOptions(null, 'time').queryKey)).toBeDefined()
    expect(client.getQueryData(postQueryOptions(4).queryKey)).toBeDefined()
    expect(client.getQueryData(voteKey)).toBeUndefined()
  })
})
