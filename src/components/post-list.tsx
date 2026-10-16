import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { MessageSquare, CheckCircle2, SquarePen } from 'lucide-react'
import { postsListQueryOptions } from '@/api/posts'
import { queryKeys } from '@/api/query-keys'
import { Button } from '@/components/ui/button'
import { formatRelativeTimestamp, formatTimestamp } from '@/lib/format'
import {
  clearPostListPause,
  isPostListAppendPaused,
  markListPreserve,
  postListMemory,
  postListViewKey,
  resetPostListView,
  takeListPreserve,
  visiblePosts,
  type PostOrder,
} from '@/lib/post-list'

function OrderLinks({ order }: { order: PostOrder }) {
  const { pathname } = useLocation()
  return (
    <nav aria-label="排序" className="flex flex-wrap gap-8 text-sm">
      <Link
        to={{ pathname, search: '' }}
        aria-current={order === 'time' ? 'page' : undefined}
        className="order-link"
      >
        最新
      </Link>
      <Link
        to={{ pathname, search: '?order=hot' }}
        aria-current={order === 'hot' ? 'page' : undefined}
        className="order-link"
      >
        最热
      </Link>
    </nav>
  )
}

export function PostList({
  communityId,
  order,
  heading,
  headingLevel = 'h1',
  scopeLabel = heading,
}: {
  communityId: number | null
  order: PostOrder
  heading: string
  headingLevel?: 'h1' | 'h2'
  scopeLabel?: string
}) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const viewKey = postListViewKey(communityId, order)
  const list = useInfiniteQuery(postsListQueryOptions(communityId, order))
  const sentinelRef = useRef<HTMLDivElement>(null)
  const appliedView = useRef<string | null>(null)
  const Heading = headingLevel

  const notice =
    typeof (location.state as { notice?: unknown } | null)?.notice === 'string'
      ? (location.state as { notice: string }).notice
      : null

  useLayoutEffect(() => {
    if (appliedView.current === viewKey) return
    appliedView.current = viewKey

    // 对不上的标记在这里丢掉，包括同一页改了排序、以及中途去过别的列表。
    const preservedY = takeListPreserve(postListMemory, viewKey)
    if (preservedY !== null) {
      window.scrollTo(0, preservedY)
      return
    }

    const key = queryKeys.posts.list(communityId, order)
    if (queryClient.getQueryData(key)) {
      resetPostListView(postListMemory, viewKey)
      void queryClient.resetQueries({ queryKey: key })
    } else {
      clearPostListPause(postListMemory, viewKey)
    }
    window.scrollTo(0, 0)
  }, [communityId, order, queryClient, viewKey])

  const paused = isPostListAppendPaused(postListMemory, viewKey)
  const items = visiblePosts(
    list.data?.pages.map((page) => page.items) ?? [],
    postListMemory.deletedIds,
  )

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || paused) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (isPostListAppendPaused(postListMemory, viewKey)) return
        if (!list.hasNextPage || list.isFetchingNextPage || list.isFetchNextPageError) return
        void list.fetchNextPage()
      },
      { rootMargin: '240px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [
    list.fetchNextPage,
    list.hasNextPage,
    list.isFetchNextPageError,
    list.isFetchingNextPage,
    paused,
    viewKey,
  ])

  function refresh() {
    resetPostListView(postListMemory, viewKey)
    window.scrollTo(0, 0)
    void queryClient.resetQueries({ queryKey: queryKeys.posts.list(communityId, order) })
  }

  const from = `${location.pathname}${location.search}`

  return (
    <section aria-label={heading} className={`post-list ${headingLevel === 'h2' ? 'post-list-inset' : ''}`}>
      <Heading className="sr-only">{heading}</Heading>
      <div className="list-toolbar">
        <span className="list-scope" title={scopeLabel}>{scopeLabel}</span>
        <OrderLinks order={order} />
        <Button asChild variant="outline" size="sm" className="list-publish rounded-full px-3.5 bg-hover text-association font-normal hover:bg-line hover:text-foreground">
          <Link to="/posts/new" state={{ from }} onClick={() => markListPreserve(postListMemory, viewKey, window.scrollY)}>
            <SquarePen aria-hidden />发布帖子
          </Link>
        </Button>
      </div>
      {notice ? (
        <p role="status" className="feedback feedback-success mx-4 mt-4">
          <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0" />{notice}
        </p>
      ) : null}

      {list.isPending ? (
        <div role="status">
          <span className="sr-only">正在加载帖子…</span>
          {[0, 1, 2].map((item) => (
            <div key={item} aria-hidden className="post-row">
              <div className="post-row-heading"><div className="skeleton h-6 w-3/5" /><div className="skeleton h-4 w-12" /></div>
              <div className="skeleton h-5 w-2/5" />
              <div className="skeleton h-5 w-16" />
            </div>
          ))}
        </div>
      ) : list.isError && items.length === 0 && !list.isFetchNextPageError ? (
        <div className="list-message">
          <p role="alert" className="text-sm text-muted">
            暂时无法读取帖子。
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            {list.isFetching ? '重试中…' : '重试'}
          </Button>
        </div>
      ) : items.length === 0 && !list.hasNextPage && !list.isFetchNextPageError ? (
        <div role="status" className="list-message py-12 text-center">
          <MessageSquare aria-hidden className="mx-auto mb-4 size-8 text-primary" />
          <p className="font-medium">还没有帖子</p>
          <p className="mt-2 text-sm text-muted">发起一个话题，开始这个社区的讨论。</p>
        </div>
      ) : (
        <ul>
          {items.map((post) => (
            <li key={post.id} className="post-row">
              <div className="post-row-heading">
                <Link
                  to={`/posts/${post.id}`}
                  state={{ from }}
                  onClick={() => markListPreserve(postListMemory, viewKey, window.scrollY)}
                  className="post-row-title hover:text-primary"
                >
                  {post.title}
                </Link>
              </div>
              <div className="post-row-meta">
                <span>{post.author_username}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.created_at} title={formatTimestamp(post.created_at)}>{formatRelativeTimestamp(post.created_at)}</time>
              </div>
              <Link to={`/communities/${post.community_id}`} className="community-tag post-row-community">{post.community_name}</Link>
            </li>
          ))}
        </ul>
      )}

      {list.isFetchNextPageError ? (
        <div className="list-message">
          <p role="alert" className="text-sm text-muted">
            这一批没有加载成功，已保留上面的帖子。
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? '重试中…' : '重试'}
          </Button>
        </div>
      ) : null}

      {paused ? (
        <div className="list-message">
          <p role="status" className="text-sm text-muted">
            继续加载可能漏掉帖子。请刷新后再浏览。
          </p>
          <Button type="button" variant="outline" className="mt-3" onClick={refresh}>
            从第一批刷新
          </Button>
        </div>
      ) : null}

      {!paused && list.isFetchingNextPage ? (
        <p role="status" className="list-tail">
          正在加载更多…
        </p>
      ) : null}

      {items.length > 0 && !paused && !list.hasNextPage && !list.isFetchNextPageError ? (
        <p role="status" className="list-tail text-center">
          没有更多帖子
        </p>
      ) : null}

      <div ref={sentinelRef} className="h-px" aria-hidden />
    </section>
  )
}
