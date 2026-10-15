import { dedupeById, visibleById, type NumberedPage } from '@/lib/paged-list'
import { parseRouteId } from '@/lib/route-id'

// 帖子列表的视图键和标签页内恢复状态。
// 按 ID 去重共用 paged-list；帖子翻页允许异步索引造成的短页和空页。
// 查询缓存仍由 TanStack Query 保存；这里只记录代次、暂停追加、已删 ID 和滚动位置。
// 视图键是 communityId + order 的内存标识，查询键仍是 ['posts','list', communityId, order]。

export type PostOrder = 'time' | 'hot'

export function parsePostOrder(value: string | null): PostOrder {
  return value === 'hot' ? 'hot' : 'time'
}

export function postListViewKey(communityId: number | null, order: PostOrder): string {
  return `${communityId ?? 'all'}:${order}`
}

/** 从帖子列表查询键还原内存视图。对不上列表键时返回 null。 */
export function postListViewKeyFromQueryKey(queryKey: readonly unknown[]): string | null {
  if (queryKey[0] !== 'posts' || queryKey[1] !== 'list') return null
  const communityId = queryKey[2]
  const order = queryKey[3]
  if (communityId !== null && typeof communityId !== 'number') return null
  if (order !== 'time' && order !== 'hot') return null
  return postListViewKey(communityId, order)
}

/** 详情页带来的来源地址。只认首页和社区页，用来决定删帖后暂停哪一份列表。 */
export function postListTargetFromPath(
  path: string,
): { communityId: number | null; order: PostOrder } | null {
  let url: URL
  try {
    url = new URL(path, 'http://local')
  } catch {
    return null
  }
  const order = parsePostOrder(url.searchParams.get('order'))
  if (url.pathname === '/') return { communityId: null, order }
  const match = /^\/communities\/([1-9]\d*)$/.exec(url.pathname)
  if (!match) return null
  const communityId = parseRouteId(match[1])
  if (communityId === null) return null
  return { communityId, order }
}

export type PostPageInfo = NumberedPage

/** 索引可能暂时含已删除帖子，原始条数不能判断结束；按页码和 total 推进。 */
export function nextPostPage(page: PostPageInfo): number | undefined {
  if (!Number.isSafeInteger(page.page) || page.page < 1) return undefined
  if (page.page_size !== 10) return undefined
  if (!Number.isSafeInteger(page.total) || page.total < 0) return undefined
  if (page.page >= Math.ceil(page.total / page.page_size)) return undefined
  return page.page + 1
}
export const dedupePosts = dedupeById
export const visiblePosts = visibleById

export interface PostListMemory {
  generations: Map<string, number>
  deletedIds: Set<number>
  pausedViews: Set<string>
  preserve: { viewKey: string; scrollY: number; token: number } | null
  nextPreserveToken: number
}

export function createPostListMemory(): PostListMemory {
  return {
    generations: new Map(),
    deletedIds: new Set(),
    pausedViews: new Set(),
    preserve: null,
    nextPreserveToken: 1,
  }
}

/** 当前标签页共用的列表恢复状态。浏览器刷新后自然清空。 */
export const postListMemory = createPostListMemory()

export function postListGeneration(memory: PostListMemory, viewKey: string): number {
  return memory.generations.get(viewKey) ?? 0
}

export function bumpPostListGeneration(memory: PostListMemory, viewKey: string): number {
  const next = postListGeneration(memory, viewKey) + 1
  memory.generations.set(viewKey, next)
  return next
}

export function isPostListGenerationCurrent(
  memory: PostListMemory,
  viewKey: string,
  generation: number,
): boolean {
  return postListGeneration(memory, viewKey) === generation
}

export function rememberDeletedPost(memory: PostListMemory, postId: number): void {
  memory.deletedIds.add(postId)
}

export function pausePostListAppend(memory: PostListMemory, viewKey: string): void {
  memory.pausedViews.add(viewKey)
}

export function isPostListAppendPaused(memory: PostListMemory, viewKey: string): boolean {
  return memory.pausedViews.has(viewKey)
}

export function clearPostListPause(memory: PostListMemory, viewKey: string): void {
  memory.pausedViews.delete(viewKey)
}

/** 主动刷新或切换筛选：恢复追加，并让进行中的旧页失效。 */
export function resetPostListView(memory: PostListMemory, viewKey: string): number {
  clearPostListPause(memory, viewKey)
  return bumpPostListGeneration(memory, viewKey)
}

export function markListPreserve(memory: PostListMemory, viewKey: string, scrollY: number): number {
  const token = memory.nextPreserveToken
  memory.nextPreserveToken += 1
  memory.preserve = { viewKey, scrollY, token }
  return token
}

export function peekListPreserve(memory: PostListMemory, viewKey: string): number | null {
  if (memory.preserve?.viewKey !== viewKey) return null
  return memory.preserve.scrollY
}

/**
 * 打开一份列表时消费返回位置。对得上就取出滚动距离；
 * 对不上说明用户已经去了别的列表，丢掉标记，避免以后回到原列表被当成从详情返回。
 */
export function takeListPreserve(memory: PostListMemory, viewKey: string): number | null {
  const preserve = memory.preserve
  if (!preserve) return null
  memory.preserve = null
  return preserve.viewKey === viewKey ? preserve.scrollY : null
}

/** 发帖要带回的列表地址。详情页沿用进来时的列表；不是列表就不带。 */
export function postListSourceFromLocation(path: string, carried: string | null): string | null {
  if (postListTargetFromPath(path)) return path
  if (carried && postListTargetFromPath(carried)) return carried
  return null
}

export function clearListPreserve(memory: PostListMemory, token: number): void {
  if (memory.preserve?.token === token) memory.preserve = null
}
