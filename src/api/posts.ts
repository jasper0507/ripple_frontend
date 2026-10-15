import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { ApiError } from './errors'
import { client } from './client'
import { queryKeys } from './query-keys'
import { getWithRetry, unwrap } from './request'
import type { components, operations } from './types'
import {
  bumpPostListGeneration,
  isPostListGenerationCurrent,
  nextPostPage,
  pausePostListAppend,
  postListGeneration,
  postListMemory,
  postListViewKey,
  postListViewKeyFromQueryKey,
  rememberDeletedPost,
  type PostListMemory,
  type PostOrder,
} from '@/lib/post-list'
import { parseRouteId } from '@/lib/route-id'

/** 路径中的帖子 ID。无效时不发请求。 */
export function parsePostId(raw: string | undefined): number | null {
  return parseRouteId(raw)
}

export type PostSummary = components['schemas']['PostSummary']

export type PostPage = NonNullable<
  operations['listPosts']['responses'][200]['content']['application/json']['data']
>

export type PostDetail = NonNullable<
  operations['getPost']['responses'][200]['content']['application/json']['data']
>

export interface NewPostInput {
  title: string
  content: string
  community_id: number
}

function isPostSummary(value: unknown): value is PostSummary {
  if (typeof value !== 'object' || value === null) return false
  const post = value as PostSummary
  return (
    typeof post.id === 'number' &&
    typeof post.title === 'string' &&
    typeof post.author_id === 'string' &&
    typeof post.author_username === 'string' &&
    typeof post.community_id === 'number' &&
    typeof post.community_name === 'string' &&
    typeof post.created_at === 'string'
  )
}

function assertPostPage(data: unknown): PostPage {
  if (typeof data !== 'object' || data === null) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  const page = data as PostPage
  if (
    typeof page.page !== 'number' ||
    page.page_size !== 10 ||
    typeof page.total !== 'number' ||
    !Array.isArray(page.items) ||
    page.items.some((item) => !isPostSummary(item))
  ) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return page
}

function assertPostDetail(data: unknown): PostDetail {
  if (
    !isPostSummary(data) ||
    typeof (data as PostDetail).content !== 'string' ||
    typeof (data as PostDetail).up_votes !== 'number' ||
    typeof (data as PostDetail).down_votes !== 'number'
  ) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return data as PostDetail
}

function assertCreatedId(data: unknown): { id: number } {
  if (typeof data !== 'object' || data === null || typeof (data as { id?: unknown }).id !== 'number') {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return { id: (data as { id: number }).id }
}

export async function fetchPostPage(args: {
  page: number
  order: PostOrder
  communityId: number | null
  signal?: AbortSignal
}): Promise<PostPage> {
  const data = await unwrap<unknown>(
    client.GET('/api/v1/posts', {
      params: {
        query: {
          page: args.page,
          order: args.order,
          ...(args.communityId === null ? {} : { community_id: args.communityId }),
        },
      },
      signal: args.signal,
    }),
  )
  return assertPostPage(data)
}

/**
 * 读取一页帖子。第一页沿用普通读取的一次自动重试；追加页失败交给调用方手动重试。
 * 响应返回前若该视图已重置或删除，丢弃这一页，避免旧页回填。
 */
export async function loadPostListPage(
  args: {
    page: number
    order: PostOrder
    communityId: number | null
    signal?: AbortSignal
  },
  memory: PostListMemory,
  viewKey: string,
): Promise<PostPage> {
  const generation = postListGeneration(memory, viewKey)
  const read = () => fetchPostPage(args)
  const page = args.page === 1 ? await getWithRetry(read) : await read()
  if (!isPostListGenerationCurrent(memory, viewKey, generation)) {
    throw new ApiError('aborted', '请求已取消')
  }
  return page
}

export async function fetchPost(postId: number, signal?: AbortSignal): Promise<PostDetail> {
  const data = await getWithRetry(() =>
    unwrap<unknown>(
      client.GET('/api/v1/posts/{postID}', {
        params: { path: { postID: postId } },
        signal,
      }),
    ),
  )
  return assertPostDetail(data)
}

/** 只返回新建帖子的 ID，不写入列表缓存。 */
export async function createPost(accessToken: string, input: NewPostInput): Promise<{ id: number }> {
  const data = await unwrap<unknown>(
    client.POST('/api/v1/posts', {
      body: input,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )
  return assertCreatedId(data)
}

/** 成功为 204。不自动重试。 */
export async function deletePost(accessToken: string, postId: number): Promise<void> {
  await unwrap<void>(
    client.DELETE('/api/v1/posts/{postID}', {
      params: { path: { postID: postId } },
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )
}

export function postsListQueryOptions(
  communityId: number | null,
  order: PostOrder,
  memory: PostListMemory = postListMemory,
) {
  const viewKey = postListViewKey(communityId, order)
  return infiniteQueryOptions({
    queryKey: queryKeys.posts.list(communityId, order),
    initialPageParam: 1,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ pageParam, signal }) =>
      loadPostListPage({ page: pageParam, order, communityId, signal }, memory, viewKey),
    getNextPageParam: (lastPage) => nextPostPage(lastPage),
  })
}

export function postQueryOptions(postId: number) {
  return queryOptions({
    queryKey: queryKeys.posts.detail(postId),
    queryFn: ({ signal }) => fetchPost(postId, signal),
  })
}

/** 票数只属于详情。更新已缓存详情，不重取或重排异步帖子列表。 */
export function patchPostVotes(
  queryClient: QueryClient,
  postId: number,
  votes: { up_votes: number; down_votes: number },
): void {
  queryClient.setQueryData<PostDetail>(queryKeys.posts.detail(postId), (post) =>
    post ? { ...post, up_votes: votes.up_votes, down_votes: votes.down_votes } : post,
  )
}

function listContains(data: InfiniteData<PostPage> | undefined, postId: number): boolean {
  return data?.pages.some((page) => page.items.some((item) => item.id === postId)) ?? false
}

/**
 * 服务端已确认这篇帖子不在之后调用：从已加载列表去掉目标，清掉详情、评论和投票缓存。
 * 来源列表以及同样载有该帖的列表暂停追加，进行中的旧页作废。
 * 204 和 404 都走这里；是不是本次删除成功由页面上的说明区分。
 */
export function applyDeletedPost(
  queryClient: QueryClient,
  memory: PostListMemory,
  postId: number,
  sourceViewKey: string | null,
): void {
  rememberDeletedPost(memory, postId)
  const paused = new Set<string>()
  if (sourceViewKey) paused.add(sourceViewKey)
  for (const [queryKey, data] of queryClient.getQueriesData<InfiniteData<PostPage>>({
    queryKey: queryKeys.posts.lists,
  })) {
    if (!listContains(data, postId)) continue
    const viewKey = postListViewKeyFromQueryKey(queryKey)
    if (viewKey) paused.add(viewKey)
  }
  for (const viewKey of paused) {
    pausePostListAppend(memory, viewKey)
    bumpPostListGeneration(memory, viewKey)
  }
  queryClient.setQueriesData<InfiniteData<PostPage>>({ queryKey: queryKeys.posts.lists }, (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== postId),
      })),
    }
  })
  queryClient.removeQueries({ queryKey: queryKeys.posts.detail(postId) })
  queryClient.removeQueries({ queryKey: queryKeys.comments.list(postId) })
  queryClient.removeQueries({ queryKey: queryKeys.votes.byPost(postId) })
}
