import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, RATE_LIMITED_MESSAGE } from '@/api/errors'
import { applyDeletedPost, deletePost, parsePostId, postQueryOptions } from '@/api/posts'
import { useAuthActions, useSession, AuthRequiredError, RenewUnavailableError } from '@/app/session'
import { CommentThread } from '@/components/comment-thread'
import { PostMarkdown } from '@/components/post-markdown'
import { StatusNotice } from '@/components/status-notice'
import { DeleteConfirm } from '@/components/delete-confirm'
import { VoteControls } from '@/components/vote-controls'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'
import {
  postListMemory,
  postListTargetFromPath,
  postListViewKey,
} from '@/lib/post-list'
import { safeRedirectTarget } from '@/lib/validation'

function deleteFailureMessage(error: unknown): string {
  if (error instanceof AuthRequiredError || error instanceof RenewUnavailableError) {
    return error instanceof RenewUnavailableError
      ? '暂时无法续期，请稍后重试。'
      : '登录已失效，请重新登录。'
  }
  if (error instanceof ApiError) {
    if (error.kind === 'forbidden') return '无权删除这篇帖子。'
    if (error.kind === 'rate-limited') return `没有删除，${RATE_LIMITED_MESSAGE}。`
    if (error.kind === 'network' || error.kind === 'server') {
      return '删除结果未确认，请稍后查看。不要重复删除。'
    }
    if (error.kind === 'auth') return '登录已失效，请重新登录。'
  }
  return '删除失败，请稍后重试。'
}

function PostView({ postId }: { postId: number }) {
  const session = useSession()
  const actions = useAuthActions()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as { from?: unknown; justCreated?: unknown }
  const from = safeRedirectTarget(state.from)
  const justCreated = state.justCreated === true
  const postQuery = useQuery(postQueryOptions(postId))
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function leaveAfterDelete(notice?: string) {
    const target = from ?? '/'
    const listTarget = postListTargetFromPath(target)
    applyDeletedPost(
      queryClient,
      postListMemory,
      postId,
      listTarget ? postListViewKey(listTarget.communityId, listTarget.order) : null,
    )
    navigate(target, notice ? { replace: true, state: { notice } } : { replace: true })
  }

  async function onDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await actions.runProtected((token) => deletePost(token, postId), 'write')
      leaveAfterDelete('帖子已删除。')
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'not-found') {
        leaveAfterDelete('这篇帖子已经不存在。')
        return
      }
      setDeleteError(deleteFailureMessage(error))
      setDeleting(false)
    }
  }

  if (postQuery.error instanceof ApiError && postQuery.error.kind === 'not-found') {
    return <StatusNotice title="帖子不存在" detail="没有找到这篇帖子。" />
  }
  if (postQuery.error instanceof ApiError && postQuery.error.kind === 'params') {
    return <StatusNotice title="帖子地址无效" detail="地址中的帖子编号不正确。" />
  }

  const post = postQuery.data
  const canDelete =
    post !== undefined &&
    session.status === 'authenticated' &&
    session.identity?.userUuid === post.author_id

  return (
    <article className="post-detail">
      {post ? (
        <>
          <nav aria-label="帖子位置" className="detail-breadcrumb">
            <Link to={from ?? '/'}><ChevronLeft aria-hidden className="size-4" />返回帖子列表</Link>
            <span aria-hidden="true">/</span>
            <Link to={`/communities/${post.community_id}`}>{post.community_name}</Link>
          </nav>
          {postQuery.isError ? (
            <p role="alert" className="mt-4 text-sm text-muted">
              暂时无法刷新，已保留当前正文。
            </p>
          ) : null}
          <header>
            <h1 className="detail-title">{post.title}</h1>
            <div className="detail-byline">
              <div>
                <span className="detail-author">{post.author_username}</span>
                <time dateTime={post.created_at} className="detail-time">{formatTimestamp(post.created_at)}</time>
              </div>
              {canDelete ? (
                <Button type="button" variant="ghost" className="px-2.5 font-normal hover:text-danger" onClick={() => { setDeleteError(null); setConfirming(true) }}>
                  删除帖子
                </Button>
              ) : null}
            </div>
          </header>
          {canDelete && confirming ? (
            <DeleteConfirm title="删除这篇帖子？" description={`「${post.title}」删除后无法恢复。`} deleting={deleting} error={deleteError} onConfirm={() => void onDelete()} onCancel={() => setConfirming(false)} />
          ) : null}
          <div className="detail-content">
            <PostMarkdown content={post.content} />
          </div>
          <VoteControls postId={postId} upVotes={post.up_votes} downVotes={post.down_votes} />
        </>
      ) : postQuery.isPending ? (
        <p role="status" className="text-sm text-muted">
          {justCreated ? '帖子已发布，正在打开正文…' : '正在加载帖子…'}
        </p>
      ) : (
        <section>
          <h1 className="page-title">{justCreated ? '帖子已发布' : '帖子加载失败'}</h1>
          <p role="alert" className="mt-2 text-sm text-muted">
            {justCreated
              ? '帖子已经发布，但暂时无法读取正文。不要重复发布。'
              : '暂时无法读取这篇帖子。'}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={postQuery.isFetching}
            onClick={() => void postQuery.refetch()}
          >
            {postQuery.isFetching ? '重试中…' : '重试'}
          </Button>
        </section>
      )}
      <CommentThread postId={postId} />
    </article>
  )
}

export function PostPage() {
  const { postId } = useParams()
  const id = parsePostId(postId)
  if (id === null) {
    return <StatusNotice title="帖子地址无效" detail="地址中的帖子编号不正确。" />
  }
  return <PostView postId={id} />
}
