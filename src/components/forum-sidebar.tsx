import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { postsListQueryOptions } from '@/api/posts'
import { Button } from '@/components/ui/button'
import {
  markListPreserve,
  postListMemory,
  postListSourceFromLocation,
  postListTargetFromPath,
  postListViewKey,
  visiblePosts,
} from '@/lib/post-list'
import { safeRedirectTarget } from '@/lib/validation'
import { formatRelativeTimestamp, formatTimestamp } from '@/lib/format'

export function ForumSidebar() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // 小屏没有侧栏，也不为隐藏的最热列表发请求。
  return desktop ? (
    <aside aria-label="论坛侧栏" className="forum-sidebar">
      <HotPosts />
    </aside>
  ) : null
}

function HotPosts() {
  const location = useLocation()
  const here = `${location.pathname}${location.search}`
  const from = postListSourceFromLocation(
    here,
    safeRedirectTarget((location.state as { from?: unknown } | null)?.from),
  )
  // 与主列表共用公开热度缓存，删除走同一更新路径。
  // 只取现有第一页前五项，不主动追加，不按票数重新排序。
  const list = useInfiniteQuery(postsListQueryOptions(null, 'hot'))
  const posts = visiblePosts([list.data?.pages[0]?.items ?? []], postListMemory.deletedIds).slice(0, 5)

  function preserveList() {
    const target = postListTargetFromPath(here)
    if (target) markListPreserve(postListMemory, postListViewKey(target.communityId, target.order), window.scrollY)
  }

  return (
    <section aria-label="最热帖子" className="sidebar-hot">
      <h2 className="sidebar-heading">热门讨论</h2>
      {list.isPending ? <p role="status" className="mt-4 text-sm text-muted">正在加载…</p> : null}
      {list.isError && posts.length === 0 ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-muted">暂时无法读取最热帖子。</p>
          <Button type="button" variant="link" className="px-0" disabled={list.isFetching} onClick={() => void list.refetch()}>重试</Button>
        </div>
      ) : !list.isPending && posts.length === 0 ? <p className="mt-4 text-sm text-muted">暂无帖子</p> : null}
      {posts.length > 0 ? (
        <ol className="hot-list">
          {posts.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`} state={from ? { from } : undefined} onClick={preserveList} className="hot-post-title">{post.title}</Link>
              <div className="hot-post-meta">
                <span>{post.community_name}</span>
                <time dateTime={post.created_at} title={formatTimestamp(post.created_at)}>{formatRelativeTimestamp(post.created_at)}</time>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
