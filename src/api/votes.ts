import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors'
import { client } from './client'
import { accountScope, queryKeys } from './query-keys'
import { fetchPost, patchPostVotes } from './posts'
import { getWithRetry, unwrap } from './request'
import type { components } from './types'

export type VoteDirection = components['schemas']['VoteDirection']

export interface VoteIdentity {
  userUuid: string
  sessionId: string
}

export interface ConfirmedVote {
  post_id: number
  direction: VoteDirection
}

export type VoteRead =
  | { status: 'unknown' }
  | { status: 'known'; direction: VoteDirection }

export type ApplyVoteResult = 'updated' | 'counts-unavailable' | 'stale' | 'rejected'

export type VoteSubmitError = 'unconfirmed' | 'missing' | 'rate-limited' | 'rejected'

function isDirection(value: unknown): value is VoteDirection {
  return value === -1 || value === 0 || value === 1
}

function readVoteEcho(data: unknown): { post_id: unknown; direction: VoteDirection } | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as { post_id?: unknown; direction?: unknown }
  if (!isDirection(record.direction)) return null
  return { post_id: record.post_id, direction: record.direction }
}

/** 只有身份已经确认才读取本人方向。游客、列表和会话恢复中都不发这个请求。 */
export function shouldReadVote(status: 'unknown' | 'guest' | 'authenticated'): boolean {
  return status === 'authenticated'
}

/**
 * 1 / -1 / 0 是服务端确认过的方向，0 表示未投票或已取消。
 * 还没读到、读失败，或方向不是这三个值，都保持未知，不能当成未投票。
 */
export function voteRead(input: {
  enabled: boolean
  pending: boolean
  failed: boolean
  direction: unknown
}): VoteRead {
  if (!input.enabled || input.pending || input.failed) return { status: 'unknown' }
  if (!isDirection(input.direction)) return { status: 'unknown' }
  return { status: 'known', direction: input.direction }
}

/** 帖子、用户 UUID、本次登录会话。续期沿用这次会话。访问令牌不进键。 */
export function voteQueryKey(postId: number, identity: VoteIdentity) {
  return [...queryKeys.votes.byPost(postId), ...accountScope(identity)] as const
}

/**
 * 投票提示只属于发起时的那篇帖子、这一次登录。
 * 换帖、退出或换账号后，迟到回调不改当前页面。方向缓存仍按原帖子和原会话写入。
 */
export function voteViewStillCurrent(
  captured: { postId: number; userUuid: string; sessionId: string },
  current: { postId: number; identity: VoteIdentity | null },
): boolean {
  if (!current.identity) return false
  return (
    current.postId === captured.postId &&
    current.identity.userUuid === captured.userUuid &&
    current.identity.sessionId === captured.sessionId
  )
}

export function voteSubmitError(error: unknown): VoteSubmitError {
  if (!(error instanceof ApiError)) return 'rejected'
  if (error.kind === 'not-found') return 'missing'
  if (error.kind === 'rate-limited') return 'rate-limited'
  if (error.kind === 'network' || error.kind === 'server' || error.kind === 'protocol') {
    return 'unconfirmed'
  }
  return 'rejected'
}

/** 读取本人方向。首次遇到网络或 5xx 时最多再请求一次。不代表可以投票。 */
export async function fetchPostVote(
  accessToken: string,
  postId: number,
  signal?: AbortSignal,
): Promise<{ direction: VoteDirection }> {
  const data = await getWithRetry(() =>
    unwrap<unknown>(
      client.GET('/api/v1/posts/{postID}/vote', {
        params: { path: { postID: postId } },
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      }),
    ),
  )
  const echo = readVoteEcho(data)
  if (!echo) throw new ApiError('protocol', '响应格式不符合契约')
  return { direction: echo.direction }
}

/** 设置方向。不自动重试，也不在失败后替用户再投一次。 */
export async function submitVote(
  accessToken: string,
  postId: number,
  direction: VoteDirection,
): Promise<ConfirmedVote> {
  const data = await unwrap<unknown>(
    client.PUT('/api/v1/posts/{postID}/vote', {
      params: { path: { postID: postId } },
      body: { direction },
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )
  const echo = readVoteEcho(data)
  if (!echo || typeof echo.post_id !== 'number') {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return { post_id: echo.post_id, direction: echo.direction }
}

/**
 * PUT 已经成功之后调用。方向以回显为准，先写入这次登录的缓存。
 * 再读公开详情，只更新详情票数，不重排、不重取异步列表。
 * 票数没读到就留下方向，调用方不能因此重发投票。
 * 会话已经不是这一次时，不写新会话的方向，也不把这次详情回填到页面上。
 */
export async function applyConfirmedVote(
  queryClient: QueryClient,
  input: {
    postId: number
    confirmed: ConfirmedVote
    identity: VoteIdentity
    stillCurrent: () => boolean
  },
): Promise<ApplyVoteResult> {
  if (!input.stillCurrent()) return 'stale'
  if (input.confirmed.post_id !== input.postId || !isDirection(input.confirmed.direction)) {
    return 'rejected'
  }

  const key = voteQueryKey(input.postId, input.identity)
  await queryClient.cancelQueries({ queryKey: key, exact: true })
  if (!input.stillCurrent()) return 'stale'
  queryClient.setQueryData(key, { direction: input.confirmed.direction })

  let detail: Awaited<ReturnType<typeof fetchPost>>
  try {
    detail = await fetchPost(input.postId)
  } catch {
    return input.stillCurrent() ? 'counts-unavailable' : 'stale'
  }
  if (!input.stillCurrent()) return 'stale'

  await queryClient.cancelQueries(
    { queryKey: queryKeys.posts.detail(input.postId), exact: true },
    { revert: false },
  )
  if (!input.stillCurrent()) return 'stale'
  patchPostVotes(queryClient, input.postId, {
    up_votes: detail.up_votes,
    down_votes: detail.down_votes,
  })
  return 'updated'
}
