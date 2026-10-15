import { dedupeById, nextNumberedPage, visibleById, type NumberedPage } from '@/lib/paged-list'

// 评论列表的引用、回显和标签页内暂停状态。
// 页码与按 ID 去重和帖子列表共用。查询缓存仍由 TanStack Query 保存。

export type CommentPageInfo = NumberedPage

export const nextCommentPage = nextNumberedPage
export const dedupeComments = dedupeById
export const visibleComments = visibleById

export interface LoadedComment {
  id: number
  content: string
  author_username: string
}

export type ReplyQuote =
  | { kind: 'none' }
  | { kind: 'number'; id: number }
  | { kind: 'quote'; id: number; authorName: string; content: string }
  | { kind: 'deleted'; id: number }

/**
 * 已加载的目标显示引用。缓存里没有只显示编号，不能据此说已删除。
 * 只有调用方确认删除过的 ID 才标成已删除。
 */
export function replyQuote(
  replyToCommentId: number | null,
  loaded: ReadonlyMap<number, LoadedComment>,
  deletedIds: ReadonlySet<number>,
): ReplyQuote {
  if (replyToCommentId === null) return { kind: 'none' }
  if (deletedIds.has(replyToCommentId)) return { kind: 'deleted', id: replyToCommentId }
  const target = loaded.get(replyToCommentId)
  if (!target) return { kind: 'number', id: replyToCommentId }
  return {
    kind: 'quote',
    id: target.id,
    authorName: target.author_username,
    content: target.content,
  }
}

/** 时间线已经出现，或确认删除的回显，不再在编辑区旁边重复显示。 */
export function pendingEchoes<T extends { id: number }>(
  echoes: readonly T[],
  loadedIds: ReadonlySet<number>,
  deletedIds: ReadonlySet<number>,
): T[] {
  return echoes.filter((echo) => !loadedIds.has(echo.id) && !deletedIds.has(echo.id))
}

/** 从第 1 页连续加载，且最后一页没有下一页。中间有缺口不算读到底。 */
export function isCommentListCaughtUp(pages: readonly CommentPageInfo[]): boolean {
  if (pages.length === 0) return false
  const last = pages[pages.length - 1]
  if (!last || last.page !== pages.length) return false
  for (let index = 0; index < pages.length; index += 1) {
    if (pages[index]?.page !== index + 1) return false
  }
  return nextCommentPage(last) === undefined
}

export type CommentTailPlan = { kind: 'hold' } | { kind: 'check-last'; page: number }

/** 没读到底就保持原列表。读到底时只回头核对当前末页，不从第 1 页重拉。 */
export function commentTailPlan(pages: readonly CommentPageInfo[]): CommentTailPlan {
  if (!isCommentListCaughtUp(pages)) return { kind: 'hold' }
  return { kind: 'check-last', page: pages[pages.length - 1]?.page ?? 1 }
}

export type CommentPageWrite = 'replace-last' | 'append' | 'reject'

/** 只允许替换当前末页，或追加紧邻的下一页。更后面的页不能跨过缺口接上。 */
export function commentPageWrite(
  loadedPages: readonly { page: number }[],
  incoming: { page: number },
): CommentPageWrite {
  if (loadedPages.length === 0) return incoming.page === 1 ? 'append' : 'reject'
  const last = loadedPages[loadedPages.length - 1]?.page
  if (incoming.page === last) return 'replace-last'
  if (last !== undefined && incoming.page === last + 1) return 'append'
  return 'reject'
}

export interface CommentListMemory {
  generations: Map<number, number>
  deletedIds: Set<number>
  pausedPosts: Set<number>
  /** 末页核对进行中。这段时间底部观察器不能再取下一页，避免同一页写两次。 */
  tailingPosts: Set<number>
}

export function createCommentListMemory(): CommentListMemory {
  return {
    generations: new Map(),
    deletedIds: new Set(),
    pausedPosts: new Set(),
    tailingPosts: new Set(),
  }
}

/** 当前标签页共用。浏览器刷新后自然清空，已确认删除的编号也一起丢掉。 */
export const commentListMemory = createCommentListMemory()

export function commentListGeneration(memory: CommentListMemory, postId: number): number {
  return memory.generations.get(postId) ?? 0
}

export function bumpCommentListGeneration(memory: CommentListMemory, postId: number): number {
  const next = commentListGeneration(memory, postId) + 1
  memory.generations.set(postId, next)
  return next
}

export function isCommentListGenerationCurrent(
  memory: CommentListMemory,
  postId: number,
  generation: number,
): boolean {
  return commentListGeneration(memory, postId) === generation
}

export function rememberDeletedComment(memory: CommentListMemory, commentId: number): void {
  memory.deletedIds.add(commentId)
}

export function pauseCommentAppend(memory: CommentListMemory, postId: number): void {
  memory.pausedPosts.add(postId)
}

export function isCommentListAppendPaused(memory: CommentListMemory, postId: number): boolean {
  return memory.pausedPosts.has(postId)
}

export function markCommentTail(memory: CommentListMemory, postId: number): void {
  memory.tailingPosts.add(postId)
}

export function clearCommentTail(memory: CommentListMemory, postId: number): void {
  memory.tailingPosts.delete(postId)
}

export function isCommentTailRunning(memory: CommentListMemory, postId: number): boolean {
  return memory.tailingPosts.has(postId)
}

/** 用户从第一批刷新评论：恢复追加，并让进行中的旧页失效。已删除编号保留。 */
export function resetCommentList(memory: CommentListMemory, postId: number): number {
  memory.pausedPosts.delete(postId)
  return bumpCommentListGeneration(memory, postId)
}
