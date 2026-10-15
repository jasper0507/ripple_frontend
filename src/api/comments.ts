import {
  infiniteQueryOptions,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { ApiError } from './errors'
import { client } from './client'
import { queryKeys } from './query-keys'
import { getWithRetry, unwrap } from './request'
import type { operations } from './types'
import {
  bumpCommentListGeneration,
  clearCommentTail,
  commentListGeneration,
  commentListMemory,
  commentPageWrite,
  commentTailPlan,
  isCommentListAppendPaused,
  isCommentListGenerationCurrent,
  markCommentTail,
  nextCommentPage,
  pauseCommentAppend,
  rememberDeletedComment,
  type CommentListMemory,
} from '@/lib/comment-list'
import { isReplyId } from '@/lib/comment-draft'

export type CommentPage = NonNullable<
  operations['listComments']['responses'][200]['content']['application/json']['data']
>

export type CommentItem = CommentPage['items'][number]

export interface NewCommentInput {
  content: string
  replyToCommentId: number | null
}

function isCommentItem(value: unknown): value is CommentItem {
  if (typeof value !== 'object' || value === null) return false
  const comment = value as CommentItem
  return (
    typeof comment.id === 'number' &&
    typeof comment.content === 'string' &&
    typeof comment.author_id === 'string' &&
    typeof comment.author_username === 'string' &&
    isReplyId(comment.reply_to_comment_id) &&
    typeof comment.created_at === 'string'
  )
}

function assertCommentPage(data: unknown): CommentPage {
  if (typeof data !== 'object' || data === null) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  const page = data as CommentPage
  if (
    typeof page.page !== 'number' ||
    page.page_size !== 10 ||
    typeof page.total !== 'number' ||
    !Array.isArray(page.items) ||
    page.items.some((item) => !isCommentItem(item))
  ) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return page
}

function assertCreatedId(data: unknown): { id: number } {
  if (typeof data !== 'object' || data === null || typeof (data as { id?: unknown }).id !== 'number') {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return { id: (data as { id: number }).id }
}

export async function fetchCommentPage(
  postId: number,
  page: number,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const data = await unwrap<unknown>(
    client.GET('/api/v1/posts/{postID}/comments', {
      params: { path: { postID: postId }, query: { page } },
      signal,
    }),
  )
  return assertCommentPage(data)
}

/**
 * 读取一页评论。第一页沿用普通读取的一次自动重试；追加页失败交给调用方手动重试。
 * 尾页核对也不走这里的重试。响应返回前若这篇帖子的列表已刷新或删除，丢弃这一页。
 */
export async function loadCommentPage(
  postId: number,
  page: number,
  memory: CommentListMemory,
  signal?: AbortSignal,
): Promise<CommentPage> {
  const generation = commentListGeneration(memory, postId)
  const read = () => fetchCommentPage(postId, page, signal)
  const result = page === 1 ? await getWithRetry(read) : await read()
  if (!isCommentListGenerationCurrent(memory, postId, generation)) {
    throw new ApiError('aborted', '请求已取消')
  }
  return result
}

/** 只返回新建评论的 ID。不把正文拼进列表，也不伪造时间。 */
export async function createComment(
  accessToken: string,
  postId: number,
  input: NewCommentInput,
): Promise<{ id: number }> {
  const data = await unwrap<unknown>(
    client.POST('/api/v1/posts/{postID}/comments', {
      params: { path: { postID: postId } },
      body:
        input.replyToCommentId === null
          ? { content: input.content }
          : { content: input.content, reply_to_comment_id: input.replyToCommentId },
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )
  return assertCreatedId(data)
}

/** 成功为 204。不自动重试。 */
export async function deleteComment(accessToken: string, commentId: number): Promise<void> {
  await unwrap<void>(
    client.DELETE('/api/v1/comments/{commentID}', {
      params: { path: { commentID: commentId } },
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )
}

export function commentsQueryOptions(postId: number, memory: CommentListMemory = commentListMemory) {
  return infiniteQueryOptions({
    queryKey: queryKeys.comments.list(postId),
    initialPageParam: 1,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ pageParam, signal }) => loadCommentPage(postId, pageParam, memory, signal),
    getNextPageParam: (lastPage) => nextCommentPage(lastPage),
  })
}

function writeCommentPage(
  queryClient: QueryClient,
  postId: number,
  page: CommentPage,
): boolean {
  const key = queryKeys.comments.list(postId)
  const current = queryClient.getQueryData<InfiniteData<CommentPage>>(key)
  if (!current) return false
  const mode = commentPageWrite(current.pages, page)
  if (mode === 'reject') return false
  queryClient.setQueryData<InfiniteData<CommentPage>>(key, {
    pages: mode === 'replace-last' ? [...current.pages.slice(0, -1), page] : [...current.pages, page],
    pageParams: mode === 'replace-last' ? current.pageParams : [...current.pageParams, page.page],
  })
  return true
}

/**
 * 已经读到底时，重取当前末页，末页变满再继续向后加载。
 * 没读到底，或删除后还暂停追加时，什么都不请求。读取失败不自动重试，已有评论保留。
 * 核对期间底部观察器不再取下一页，避免同一页写进两次。
 * 返回 updated 表示这次核对写过缓存；held 表示按规则不请求；unavailable 表示核对没完成。
 */
export async function refreshCommentTail(
  queryClient: QueryClient,
  postId: number,
  memory: CommentListMemory = commentListMemory,
): Promise<'updated' | 'held' | 'unavailable'> {
  const current = queryClient.getQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(postId))
  if (!current || isCommentListAppendPaused(memory, postId)) return 'held'
  const plan = commentTailPlan(current.pages)
  if (plan.kind === 'hold') return 'held'

  const generation = commentListGeneration(memory, postId)
  let pageNumber = plan.page
  let wrote = false
  markCommentTail(memory, postId)

  try {
    for (;;) {
      let page: CommentPage
      try {
        page = await fetchCommentPage(postId, pageNumber)
      } catch {
        return 'unavailable'
      }
      if (!isCommentListGenerationCurrent(memory, postId, generation)) return 'unavailable'
      if (page.page !== pageNumber) return 'unavailable'
      const next = nextCommentPage(page)
      if (next !== undefined && next !== pageNumber + 1) return 'unavailable'
      if (!writeCommentPage(queryClient, postId, page)) return 'unavailable'
      wrote = true
      if (next === undefined) return wrote ? 'updated' : 'unavailable'
      pageNumber = next
    }
  } finally {
    clearCommentTail(memory, postId)
  }
}

/**
 * 服务端已确认这条评论不在之后调用：从已加载页去掉目标，保留它的回复。
 * 这篇帖子的评论暂停追加，进行中的旧页作废。204 和 404 都走这里。
 * 是不是本次删除成功由页面上的说明区分。正文和草稿不动。
 */
export function applyDeletedComment(
  queryClient: QueryClient,
  memory: CommentListMemory,
  postId: number,
  commentId: number,
): void {
  rememberDeletedComment(memory, commentId)
  pauseCommentAppend(memory, postId)
  bumpCommentListGeneration(memory, postId)
  queryClient.setQueryData<InfiniteData<CommentPage>>(queryKeys.comments.list(postId), (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== commentId),
      })),
    }
  })
}
