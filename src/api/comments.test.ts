import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import {
  applyDeletedComment,
  commentsQueryOptions,
  createComment,
  deleteComment,
  loadCommentPage,
  refreshCommentTail,
  type CommentPage,
} from './comments'
import { isAccountQuery, queryKeys } from './query-keys'
import {
  bumpCommentListGeneration,
  createCommentListMemory,
  isCommentListAppendPaused,
  isCommentListGenerationCurrent,
  isCommentTailRunning,
  pauseCommentAppend,
  visibleComments,
} from '@/lib/comment-list'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function envelope(data: unknown) {
  return { code: 'OK', message: '成功', data }
}

function comment(id: number, replyTo: number | null = null) {
  return {
    id,
    content: `评论${id}`,
    author_id: '11111111-1111-1111-1111-111111111111',
    author_username: 'alice',
    reply_to_comment_id: replyTo,
    created_at: '2026-10-01T10:05:00+08:00',
  }
}

function page(items: unknown[], total = items.length, pageNumber = 1): CommentPage {
  return { page: pageNumber, page_size: 10, total, items: items as CommentPage['items'] }
}

function ten(start: number) {
  return Array.from({ length: 10 }, (_, index) => comment(start + index))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadCommentPage', () => {
  it('公开请求不带 Authorization，路径和页码按契约', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      const url = new URL(request.url)
      expect(url.pathname).toBe('/api/v1/posts/4/comments')
      expect(url.searchParams.get('page')).toBe('2')
      expect(request.headers.get('Authorization')).toBeNull()
      return jsonResponse(envelope(page([comment(11)], 11, 2)))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadCommentPage(4, 2, createCommentListMemory())).resolves.toMatchObject({
      page: 2,
      page_size: 10,
      total: 11,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('每页条数不是 10 或条目缺少正文时是协议错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope({ ...page([comment(1)]), page_size: 20 }))),
    )
    await expect(loadCommentPage(4, 1, createCommentListMemory())).rejects.toMatchObject({
      kind: 'protocol',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope(page([{ id: 1 }])))),
    )
    await expect(loadCommentPage(4, 1, createCommentListMemory())).rejects.toMatchObject({
      kind: 'protocol',
    })
  })

  it('第一页暂时失败会再请求一次，追加失败不会', async () => {
    const firstPage = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500))
      .mockResolvedValueOnce(jsonResponse(envelope(page([comment(1)]))))
    vi.stubGlobal('fetch', firstPage)
    await expect(loadCommentPage(4, 1, createCommentListMemory())).resolves.toMatchObject({ page: 1 })
    expect(firstPage).toHaveBeenCalledTimes(2)

    const nextPage = vi.fn(async () =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500),
    )
    vi.stubGlobal('fetch', nextPage)
    await expect(loadCommentPage(4, 2, createCommentListMemory())).rejects.toMatchObject({ kind: 'server' })
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
        return jsonResponse(envelope(page([comment(1)], 11, 2)))
      }),
    )
    const memory = createCommentListMemory()
    const pending = loadCommentPage(4, 2, memory)
    bumpCommentListGeneration(memory, 4)
    release()
    await expect(pending).rejects.toBeInstanceOf(ApiError)
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
  })
})

describe('createComment', () => {
  it('只返回新建 ID，直接评论不带回复目标，也不写入列表缓存', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('POST')
      expect(new URL(request.url).pathname).toBe('/api/v1/posts/4/comments')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      expect(await request.json()).toEqual({ content: '说一句' })
      return jsonResponse(envelope({ id: 9 }), 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const key = queryKeys.comments.list(4)
    const loaded: InfiniteData<CommentPage> = { pageParams: [1], pages: [page([comment(1)])] }
    client.setQueryData(key, loaded)

    await expect(
      createComment('token-1', 4, { content: '说一句', replyToCommentId: null }),
    ).resolves.toEqual({ id: 9 })
    expect(client.getQueryData(key)).toEqual(loaded)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('回复带上同帖评论编号', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(await (input as Request).json()).toEqual({
        content: '回复你',
        reply_to_comment_id: 3,
      })
      return jsonResponse(envelope({ id: 10 }), 201)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      createComment('token-1', 4, { content: '回复你', replyToCommentId: 3 }),
    ).resolves.toEqual({ id: 10 })
  })

  it('无效回复目标是参数错误，网络故障不自动重试', async () => {
    const rejected = vi.fn(async () =>
      jsonResponse({ code: 'INVALID_PARAMS', message: '请求参数无效', data: null }, 400),
    )
    vi.stubGlobal('fetch', rejected)
    await expect(
      createComment('token-1', 4, { content: '回复你', replyToCommentId: 3 }),
    ).rejects.toMatchObject({ kind: 'params', code: 'INVALID_PARAMS' })
    expect(rejected).toHaveBeenCalledTimes(1)

    const offline = vi.fn(async () => {
      throw new TypeError('failed')
    })
    vi.stubGlobal('fetch', offline)
    await expect(
      createComment('token-1', 4, { content: '说一句', replyToCommentId: null }),
    ).rejects.toMatchObject({ kind: 'network' })
    expect(offline).toHaveBeenCalledTimes(1)
  })
})

describe('deleteComment', () => {
  it('204 视为删除成功', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      expect(request.method).toBe('DELETE')
      expect(new URL(request.url).pathname).toBe('/api/v1/comments/9')
      expect(request.headers.get('Authorization')).toBe('Bearer token-1')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(deleteComment('token-1', 9)).resolves.toBeUndefined()
  })

  it('无权限、不存在和网络故障都不会自动重试', async () => {
    const forbidden = vi.fn(async () =>
      jsonResponse({ code: 'FORBIDDEN', message: '无权执行此操作', data: null }, 403),
    )
    vi.stubGlobal('fetch', forbidden)
    await expect(deleteComment('token-1', 9)).rejects.toMatchObject({ kind: 'forbidden' })
    expect(forbidden).toHaveBeenCalledTimes(1)

    const missing = vi.fn(async () =>
      jsonResponse({ code: 'COMMENT_NOT_FOUND', message: '评论不存在', data: null }, 404),
    )
    vi.stubGlobal('fetch', missing)
    await expect(deleteComment('token-1', 9)).rejects.toMatchObject({
      kind: 'not-found',
      code: 'COMMENT_NOT_FOUND',
    })
    expect(missing).toHaveBeenCalledTimes(1)

    const offline = vi.fn(async () => {
      throw new TypeError('failed')
    })
    vi.stubGlobal('fetch', offline)
    await expect(deleteComment('token-1', 9)).rejects.toMatchObject({ kind: 'network' })
    expect(offline).toHaveBeenCalledTimes(1)
  })
})

describe('评论缓存', () => {
  it('删除后只移除目标，回复还在，并暂停这篇帖子的追加', () => {
    const client = new QueryClient()
    const memory = createCommentListMemory()
    const key = queryKeys.comments.list(4)
    client.setQueryData<InfiniteData<CommentPage>>(key, {
      pageParams: [1],
      pages: [page([comment(1), comment(2, 1), comment(3, 1)])],
    })
    client.setQueryData(queryKeys.comments.list(8), {
      pageParams: [1],
      pages: [page([comment(1)])],
    })
    client.setQueryData(queryKeys.posts.detail(4), { id: 4, content: '正文' })

    applyDeletedComment(client, memory, 4, 1)

    const left = client.getQueryData<InfiniteData<CommentPage>>(key)?.pages[0]?.items
    expect(left?.map((item) => item.id)).toEqual([2, 3])
    expect(left?.[0]?.reply_to_comment_id).toBe(1)
    expect(client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(8))?.pages[0]?.items).toHaveLength(1)
    expect(client.getQueryData(queryKeys.posts.detail(4))).toMatchObject({ content: '正文' })
    expect(isCommentListAppendPaused(memory, 4)).toBe(true)
    expect(isCommentListGenerationCurrent(memory, 4, 0)).toBe(false)
    expect(memory.deletedIds.has(1)).toBe(true)
  })

  it('旧页里残留的已删除评论不会重新显示', () => {
    const loaded = [[comment(1), comment(2, 1)]]
    expect(visibleComments(loaded, new Set([1])).map((item) => item.id)).toEqual([2])
  })

  it('评论列表是公共查询，清理账号缓存时保留', () => {
    expect(commentsQueryOptions(4).queryKey).toEqual(['comments', 4])
    expect(commentsQueryOptions(4).queryKey).not.toContain('account')

    const client = new QueryClient()
    const userUuid = '11111111-1111-1111-1111-111111111111'
    client.setQueryData(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page([comment(1)])],
    })
    client.removeQueries({
      predicate: (query) => isAccountQuery(query.queryKey, userUuid),
    })
    expect(client.getQueryData(queryKeys.comments.list(4))).toBeDefined()
  })
})

describe('refreshCommentTail', () => {
  it('还没读到底时不请求，避免把后面的页拼到缺口上', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page(ten(1), 30, 1)],
    })

    await expect(refreshCommentTail(client, 4, createCommentListMemory())).resolves.toBe('held')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('删除后暂停追加，发表不再核对末页', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const memory = createCommentListMemory()
    pauseCommentAppend(memory, 4)
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page([comment(1), comment(2), comment(3)], 3, 1)],
    })

    await expect(refreshCommentTail(client, 4, memory)).resolves.toBe('held')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(isCommentTailRunning(memory, 4)).toBe(false)
  })

  it('末页没满时只重取这一页', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL((input as Request).url).searchParams.get('page')).toBe('1')
      return jsonResponse(envelope(page([comment(1), comment(2), comment(3), comment(4)], 4, 1)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const memory = createCommentListMemory()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page([comment(1), comment(2), comment(3)], 3, 1)],
    })

    await expect(refreshCommentTail(client, 4, memory)).resolves.toBe('updated')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages[0]?.items.map((item) => item.id),
    ).toEqual([1, 2, 3, 4])
  })

  it('末页已满时先核对末页，再继续加载，不能只取下一页', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const pageNumber = Number(new URL((input as Request).url).searchParams.get('page'))
      if (pageNumber === 2) return jsonResponse(envelope(page(ten(11), 25, 2)))
      if (pageNumber === 3) return jsonResponse(envelope(page([comment(21), comment(22), comment(23), comment(24), comment(25)], 25, 3)))
      throw new Error(`不应请求第 ${pageNumber} 页`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1, 2],
      pages: [page(ten(1), 20, 1), page(ten(11), 20, 2)],
    })

    await expect(refreshCommentTail(client, 4, createCommentListMemory())).resolves.toBe('updated')
    const requested = fetchMock.mock.calls.map((call) =>
      new URL((call[0] as Request).url).searchParams.get('page'),
    )
    expect(requested).toEqual(['2', '3'])
    const pages = client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages
    expect(pages).toHaveLength(3)
    expect(pages?.[2]?.items.map((item) => item.id)).toEqual([21, 22, 23, 24, 25])
  })

  it('原来只有满满的第一页时，核对后继续到新评论所在的页', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const pageNumber = Number(new URL((input as Request).url).searchParams.get('page'))
      if (pageNumber === 1) return jsonResponse(envelope(page(ten(1), 21, 1)))
      if (pageNumber === 2) return jsonResponse(envelope(page(ten(11), 21, 2)))
      if (pageNumber === 3) return jsonResponse(envelope(page([comment(21)], 21, 3)))
      throw new Error(`不应请求第 ${pageNumber} 页`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page(ten(1), 10, 1)],
    })

    await expect(refreshCommentTail(client, 4, createCommentListMemory())).resolves.toBe('updated')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages).toHaveLength(3)
  })

  it('响应页码对不上时不跨页写回', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const pageNumber = Number(new URL((input as Request).url).searchParams.get('page'))
      if (pageNumber === 1) return jsonResponse(envelope(page(ten(1), 21, 1)))
      return jsonResponse(envelope(page(ten(31), 40, 4)))
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page(ten(1), 10, 1)],
    })

    await expect(refreshCommentTail(client, 4, createCommentListMemory())).resolves.toBe('unavailable')
    const pages = client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages
    expect(pages).toHaveLength(1)
    expect(pages?.[0]?.total).toBe(21)
  })

  it('尾页读取失败不自动重试，并保留已有评论', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务器内部错误', data: null }, 500),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const memory = createCommentListMemory()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page([comment(1), comment(2)], 2, 1)],
    })

    await expect(refreshCommentTail(client, 4, memory)).resolves.toBe('unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages[0]?.items.map((item) => item.id),
    ).toEqual([1, 2])
  })

  it('代次变化后不把旧的尾页写回去', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const memory = createCommentListMemory()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        expect(isCommentTailRunning(memory, 4)).toBe(true)
        await gate
        return jsonResponse(envelope(page([comment(1), comment(2), comment(9)], 3, 1)))
      }),
    )
    const client = new QueryClient()
    client.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4), {
      pageParams: [1],
      pages: [page([comment(1), comment(2)], 2, 1)],
    })
    const pending = refreshCommentTail(client, 4, memory)
    bumpCommentListGeneration(memory, 4)
    release()

    await expect(pending).resolves.toBe('unavailable')
    expect(isCommentTailRunning(memory, 4)).toBe(false)
    expect(
      client.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(4))?.pages[0]?.items.map((item) => item.id),
    ).toEqual([1, 2])
  })
})
