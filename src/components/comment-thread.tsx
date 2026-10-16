import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  applyDeletedComment,
  commentsQueryOptions,
  createComment,
  deleteComment,
  refreshCommentTail,
  type CommentItem,
} from '@/api/comments'
import { ApiError, RATE_LIMITED_MESSAGE } from '@/api/errors'
import { queryKeys } from '@/api/query-keys'
import { AuthRequiredError, RenewUnavailableError, useAuthActions, useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { DeleteConfirm } from '@/components/delete-confirm'
import { DiscardDraftConfirm } from '@/components/discard-draft-confirm'
import { CheckCircle2, Reply, RefreshCw, FileCheck2, SquarePen } from 'lucide-react'
import {
  commentCreateFailure,
  commentSubmitOutcome,
  clearCommentDraft,
  normalizedCommentDraft,
  readCommentDraft,
  validateCommentDraft,
  writeCommentDraft,
  type CommentCreateFailure,
  type CommentDraft,
  type CommentSubmitSnapshot,
} from '@/lib/comment-draft'
import {
  commentListMemory,
  dedupeComments,
  isCommentListAppendPaused,
  isCommentTailRunning,
  pendingEchoes,
  replyQuote,
  resetCommentList,
  visibleComments,
  type ReplyQuote,
} from '@/lib/comment-list'
import { formatTimestamp } from '@/lib/format'
import { safeRedirectTarget } from '@/lib/validation'

interface Echo {
  id: number
  content: string
  replyToCommentId: number | null
  userUuid: string
  sessionId: string
}

function createFailureMessage(failure: CommentCreateFailure): string {
  switch (failure) {
    case 'target-rejected':
      return '这个回复目标已经不能使用。请重新选择，或改为直接评论。'
    case 'params':
      return '评论内容不符合要求。'
    case 'unconfirmed':
      return '结果未确认。请先查看评论是否已出现，不要直接再次提交。'
    case 'post-missing':
      return '这篇帖子已经不存在。输入还在，不要重复发表。'
    case 'auth':
      return '登录已失效，请重新登录。'
    case 'rate-limited':
      return `评论没有发表，${RATE_LIMITED_MESSAGE}。`
    default:
      return '发表失败，请稍后重试。'
  }
}

const emptyDraft: CommentDraft = { content: '', replyToCommentId: null, replyTargetRejected: false }

function readInitialDraft(
  identity: { userUuid: string } | null | undefined,
  postId: number,
): CommentDraft {
  if (!identity) return emptyDraft
  return readCommentDraft(window.sessionStorage, identity.userUuid, postId) ?? emptyDraft
}

function deleteFailure(error: unknown): { message: string; gone: boolean } {
  if (error instanceof RenewUnavailableError) return { message: '暂时无法续期，请稍后重试。', gone: false }
  if (error instanceof AuthRequiredError) return { message: '登录已失效，请重新登录。', gone: false }
  if (error instanceof ApiError) {
    if (error.kind === 'forbidden') return { message: '无权删除这条评论。', gone: false }
    if (error.kind === 'not-found') return { message: '这条评论已经不存在。', gone: true }
    if (error.kind === 'rate-limited') return { message: `没有删除，${RATE_LIMITED_MESSAGE}。`, gone: false }
    if (error.kind === 'network' || error.kind === 'server') {
      return { message: '删除结果未确认，请稍后查看。不要重复删除。', gone: false }
    }
    if (error.kind === 'auth') return { message: '登录已失效，请重新登录。', gone: false }
  }
  return { message: '删除失败，请稍后重试。', gone: false }
}

function Quote({ quote }: { quote: ReplyQuote }) {
  if (quote.kind === 'none') return null
  if (quote.kind === 'deleted') {
    return <p className="reply-quote">回复目标 #{quote.id} 已删除</p>
  }
  if (quote.kind === 'number') {
    return <p className="reply-quote">回复评论 #{quote.id}</p>
  }
  return (
    <blockquote className="reply-quote">
      <p>
        <a href={`#comment-${quote.id}`} className="underline underline-offset-4">回复 #{quote.id} {quote.authorName}</a>
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{quote.content}</p>
    </blockquote>
  )
}

export function CommentThread({ postId }: { postId: number }) {
  const session = useSession()
  const actions = useAuthActions()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const list = useInfiniteQuery(commentsQueryOptions(postId))
  const sentinelRef = useRef<HTMLDivElement>(null)
  const from = `${location.pathname}${location.search}`
  const authState = { from, listFrom: safeRedirectTarget((location.state as { from?: unknown } | null)?.from) ?? undefined }
  const identity = session.identity
  const scope = identity ? `${identity.userUuid}:${identity.sessionId}` : 'guest'

  const [scopeKey, setScopeKey] = useState(scope)
  const [draft, setDraft] = useState(() => readInitialDraft(identity, postId))
  const [restored, setRestored] = useState(() => identity ? readCommentDraft(window.sessionStorage, identity.userUuid, postId) !== null : false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [echoes, setEchoes] = useState<Echo[]>([])
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: number; message: string } | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [composerActive, setComposerActive] = useState(false)

  if (scope !== scopeKey) {
    setScopeKey(scope)
    setDraft(readInitialDraft(identity, postId))
    setRestored(identity ? readCommentDraft(window.sessionStorage, identity.userUuid, postId) !== null : false)
    setFormError(null)
    setSubmitting(false)
    setEchoes([])
    setConfirmingId(null)
    setDeletingId(null)
    setDeleteError(null)
    setConfirmingDiscard(false)
    setComposerActive(false)
  }

  const loaded = dedupeComments(list.data?.pages.map((page) => page.items) ?? [])
  const loadedById = new Map(loaded.map((item) => [item.id, item]))
  const items = visibleComments([loaded], commentListMemory.deletedIds)
  const paused = isCommentListAppendPaused(commentListMemory, postId)
  const loadedIds = new Set(loaded.map((item) => item.id))
  const visibleEchoes = pendingEchoes(
    echoes.filter(
      (echo) => identity && echo.userUuid === identity.userUuid && echo.sessionId === identity.sessionId,
    ),
    loadedIds,
    commentListMemory.deletedIds,
  )
  const targetDeleted =
    draft.replyToCommentId !== null && commentListMemory.deletedIds.has(draft.replyToCommentId)
  const targetUnusable = draft.replyTargetRejected || targetDeleted

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || paused || composerActive || confirmingDiscard) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        // 跳到输入区会经过分页哨兵。编辑时追加会把输入区推出视口。
        if (document.activeElement?.closest('#comment-composer')) return
        if (isCommentListAppendPaused(commentListMemory, postId)) return
        if (isCommentTailRunning(commentListMemory, postId)) return
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
    composerActive,
    confirmingDiscard,
    postId,
  ])

  function persist(next: CommentDraft) {
    if (!identity) return
    setDraft(next)
    writeCommentDraft(window.sessionStorage, identity.userUuid, postId, next)
  }

  function focusComposer() {
    const composer = document.getElementById('comment-composer')
    composer?.scrollIntoView({ block: 'start' })
    // 输入框与游客登录提示都可通过键盘定位；不改变已有回复目标。
    const target = document.getElementById('comment-content') ?? composer
    target?.focus({ preventScroll: true })
  }

  function chooseReply(commentId: number) {
    if (!identity) {
      navigate('/login', { state: authState })
      return
    }
    persist({ ...draft, replyToCommentId: commentId, replyTargetRejected: false })
    focusComposer()
  }

  function commentDirectly() {
    persist({ ...draft, replyToCommentId: null, replyTargetRejected: false })
    focusComposer()
  }

  function abandon() {
    if (!identity || submitting) return
    clearCommentDraft(window.sessionStorage, identity.userUuid, postId)
    setDraft(emptyDraft)
    setRestored(false)
    setFormError(null)
    setConfirmingDiscard(false)
    requestAnimationFrame(() => document.getElementById('comment-content')?.focus())
  }

  function refreshFromStart() {
    resetCommentList(commentListMemory, postId)
    document.getElementById('comments')?.scrollIntoView({ block: 'start' })
    void queryClient.resetQueries({ queryKey: queryKeys.comments.list(postId) })
  }

  function sameSession(snapshot: CommentSubmitSnapshot): boolean {
    const current = actions.currentIdentity()
    return current?.userUuid === snapshot.userUuid && current.sessionId === snapshot.sessionId
  }

  async function onDelete(commentId: number) {
    if (deletingId !== null || !identity) return
    const snapshot = {
      userUuid: identity.userUuid,
      sessionId: identity.sessionId,
      postId,
      draft,
    }
    setDeletingId(commentId)
    setDeleteError(null)
    try {
      await actions.runProtected((token) => deleteComment(token, commentId), 'write')
      applyDeletedComment(queryClient, commentListMemory, postId, commentId)
      if (!sameSession(snapshot)) return
      setConfirmingId(null)
    } catch (error) {
      const failure = deleteFailure(error)
      if (failure.gone) applyDeletedComment(queryClient, commentListMemory, postId, commentId)
      if (!sameSession(snapshot)) return
      if (failure.gone) setConfirmingId(null)
      setDeleteError({ id: commentId, message: failure.message })
    } finally {
      if (sameSession(snapshot)) setDeletingId(null)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !identity) return
    if (targetDeleted) {
      setFormError('回复目标已删除。请重新选择，或改为直接评论。')
      return
    }
    const normalized = normalizedCommentDraft(draft)
    if (!normalized) {
      setFormError(validateCommentDraft(draft))
      document.getElementById('comment-content')?.focus()
      return
    }
    const snapshot: CommentSubmitSnapshot = {
      userUuid: identity.userUuid,
      sessionId: identity.sessionId,
      postId,
      draft: normalized,
    }
    writeCommentDraft(window.sessionStorage, identity.userUuid, postId, normalized)
    setDraft(normalized)
    setFormError(null)
    setSubmitting(true)
    try {
      const created = await actions.runProtected(
        (token) =>
          createComment(token, postId, {
            content: normalized.content,
            replyToCommentId: normalized.replyToCommentId,
          }),
        'write',
      )
      if (!sameSession(snapshot)) return
      const outcome = commentSubmitOutcome(window.sessionStorage, snapshot, actions.currentIdentity())
      if (outcome === 'ignore') {
        setFormError('发表结果已经返回，但当前登录状态已变化，没有改动现在的草稿。')
        return
      }
      if (outcome === 'commit') {
        clearCommentDraft(window.sessionStorage, snapshot.userUuid, postId)
        setDraft(emptyDraft)
        setRestored(false)
      }
      setEchoes((current) => [
        ...current.filter((item) => item.id !== created.id),
        {
          id: created.id,
          content: snapshot.draft.content,
          replyToCommentId: snapshot.draft.replyToCommentId,
          userUuid: snapshot.userUuid,
          sessionId: snapshot.sessionId,
        },
      ])
      const tail = await refreshCommentTail(queryClient, postId)
      if (!sameSession(snapshot)) return
      if (tail === 'unavailable') setFormError('评论已发布，但列表暂未更新。')
    } catch (error) {
      if (!sameSession(snapshot)) return
      if (error instanceof RenewUnavailableError) {
        setFormError('暂时无法续期，请稍后重试。')
        return
      }
      if (error instanceof AuthRequiredError) {
        setFormError('登录已失效，请重新登录。')
        return
      }
      if (error instanceof ApiError) {
        const failure = commentCreateFailure(error, snapshot.draft.replyToCommentId !== null)
        if (failure === 'target-rejected') {
          const stored = readCommentDraft(window.sessionStorage, snapshot.userUuid, postId)
          if (stored && stored.replyToCommentId === snapshot.draft.replyToCommentId) {
            const rejected = { ...stored, replyTargetRejected: true }
            writeCommentDraft(window.sessionStorage, snapshot.userUuid, postId, rejected)
            setDraft(rejected)
          }
        }
        setFormError(createFailureMessage(failure))
        return
      }
      setFormError('发表失败，请稍后重试。')
    } finally {
      if (sameSession(snapshot)) setSubmitting(false)
    }
  }

  const quoteFor = (replyTo: number | null) =>
    replyQuote(replyTo, loadedById, commentListMemory.deletedIds)

  let listBody: ReactNode
  if (list.isPending) {
    listBody = (
      <p role="status" className="mt-4 text-sm text-muted">
        正在加载评论…
      </p>
    )
  } else if (list.isError && items.length === 0) {
    const missing = list.error instanceof ApiError && list.error.kind === 'not-found'
    listBody = (
      <div className="mt-4">
        <p role="alert" className="text-sm text-muted">
          {missing ? '这篇帖子已经不存在，评论没有加载。' : '暂时无法读取评论。'}
        </p>
        {missing ? null : (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            {list.isFetching ? '重试中…' : '重试'}
          </Button>
        )}
      </div>
    )
  } else if (items.length === 0) {
    listBody = (
      <p role="status" className="mt-4 text-sm text-muted">
        还没有评论。
      </p>
    )
  } else {
    listBody = (
      <ol className="comment-list">
        {items.map((comment) => (
          <li key={comment.id} className="comment-row">
            <CommentEntry
              comment={comment}
              quote={quoteFor(comment.reply_to_comment_id)}
              canDelete={identity?.userUuid === comment.author_id}
              confirming={confirmingId === comment.id}
              deleting={deletingId === comment.id}
              error={deleteError?.id === comment.id ? deleteError.message : null}
              onReply={() => chooseReply(comment.id)}
              onAskDelete={() => {
                setConfirmingId(comment.id)
                setDeleteError(null)
              }}
              onCancelDelete={() => setConfirmingId(null)}
              onConfirmDelete={() => void onDelete(comment.id)}
            />
          </li>
        ))}
      </ol>
    )
  }

  const replyBanner = draft.replyToCommentId === null ? null : quoteFor(draft.replyToCommentId)

  return (
    <section id="comments" aria-label="评论" className="comment-thread">
      <div className="comment-heading">
        <h2 className="section-title">评论</h2>
        <div className="comment-heading-actions">
          <Button type="button" variant="outline" size="sm" className="rounded-full px-3.5" onClick={focusComposer}><SquarePen aria-hidden />写评论</Button>
          <Button type="button" variant="ghost" className="rounded-full px-3 font-normal" disabled={list.isFetching} onClick={refreshFromStart}>
            <RefreshCw aria-hidden />刷新
          </Button>
        </div>
      </div>
      {listBody}

      {items.length > 0 && !paused && list.isFetchNextPageError ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-muted">
            这一批评论没有加载成功，已保留上面的评论。
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

      {items.length > 0 && paused ? (
        <div className="mt-4">
          <p role="status" className="text-sm text-muted">
            继续加载可能漏掉评论。请从第一批刷新后再浏览。
          </p>
          <Button type="button" variant="outline" className="mt-3" onClick={refreshFromStart}>
            从第一批刷新
          </Button>
        </div>
      ) : null}

      {items.length > 0 && !paused && list.isFetchingNextPage ? (
        <p role="status" className="mt-4 text-sm text-muted">
          正在加载更多评论…
        </p>
      ) : null}

      {items.length > 0 && !paused && !list.hasNextPage && !list.isFetchNextPageError ? (
        <p role="status" className="mt-4 text-sm text-muted">
          没有更多评论
        </p>
      ) : null}

      <div ref={sentinelRef} className="h-px" aria-hidden />

      {visibleEchoes.length > 0 ? (
        <div className="mt-6 rounded-lg bg-success-soft px-4 py-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 aria-hidden className="size-4" />刚发表的</h3>
          <ul className="mt-2">
            {visibleEchoes.map((echo) => (
              <li key={echo.id} className="border-t border-line py-3 first:border-t-0">
                <p className="text-[13px] text-muted">#{echo.id} · 已发布</p>
                <div className="mt-2">
                  <Quote quote={quoteFor(echo.replyToCommentId)} />
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">{echo.content}</p>
                <p className="mt-1 text-sm text-muted">时间线还没读到这里。</p>
                <div className="comment-actions">
                  <Button type="button" variant="ghost" className="px-2.5 font-normal" onClick={() => chooseReply(echo.id)}>
                    回复
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2.5 font-normal hover:text-danger"
                    onClick={() => {
                      setConfirmingId(echo.id)
                      setDeleteError(null)
                    }}
                  >
                    删除
                  </Button>
                </div>
                {confirmingId === echo.id ? (
                  <DeleteConfirm
                    title="删除这条评论？"
                    description={`「${echo.content.slice(0, 80)}」删除后无法恢复，回复会保留。`}
                    deleting={deletingId === echo.id}
                    error={deleteError?.id === echo.id ? deleteError.message : null}
                    onConfirm={() => void onDelete(echo.id)}
                    onCancel={() => setConfirmingId(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div id="comment-composer" tabIndex={-1} className="comment-composer"
        onFocusCapture={() => setComposerActive(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setComposerActive(false)
        }}>
        {session.status === 'unknown' ? (
          <p role="status" className="text-sm text-muted">
            正在确认登录状态…
          </p>
        ) : identity ? (
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            {restored ? <p role="status" className="feedback feedback-info"><FileCheck2 aria-hidden className="mt-1 size-4 shrink-0" />已恢复本标签页草稿</p> : null}
            {draft.replyToCommentId !== null ? (
              <div className="reply-quote reply-target" role="status">
                {targetDeleted ? (
                  <p role="alert" className="text-sm">
                    回复目标已删除。请重新选择，或改为直接评论。
                  </p>
                ) : draft.replyTargetRejected ? (
                  <p role="alert" className="text-sm">
                    这个回复目标已经不能使用。请重新选择，或改为直接评论。
                  </p>
                ) : replyBanner?.kind === 'quote' ? (
                  <div className="text-sm">
                    <p>
                      正在回复 #{replyBanner.id} {replyBanner.authorName}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-muted">
                      {replyBanner.content}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm">
                    正在回复评论 #{draft.replyToCommentId}。这条评论还不在已加载的列表里。
                  </p>
                )}
                <Button type="button" variant="outline" className="mt-3" onClick={commentDirectly}>
                  改为直接评论
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="comment-content" className="text-sm font-medium">
                {draft.replyToCommentId !== null ? '写下回复' : '参与讨论'}
              </label>
              <textarea
                id="comment-content"
                name="content"
                value={draft.content}
                rows={4}
                placeholder="分享你的看法…"
                className="focus:outline-none form-control"
                aria-invalid={formError === '请填写评论' || formError === '评论不超过 2,000 个字符' ? true : undefined}
                aria-describedby={`comment-content-count${formError ? " comment-error" : ""}`}
                onChange={(event) => {
                  persist({ ...draft, content: event.target.value })
                  if (formError === '请填写评论' || formError === '评论不超过 2,000 个字符') setFormError(null)
                }}
              />
              <p id="comment-content-count" className={`text-[13px] leading-5 ${[...draft.content.trim()].length > 2000 ? 'text-danger' : 'text-muted'}`}>{[...draft.content.trim()].length} / 2,000 个字符</p>
            </div>
            {formError ? (
              <p id="comment-error" role="alert" className="feedback feedback-warning">
                {formError}
              </p>
            ) : null}
            <div className="comment-composer-actions">
              <Button type="submit" disabled={submitting || targetUnusable}>
                {submitting ? '发表中…' : draft.replyToCommentId !== null ? '发表回复' : '发表评论'}
              </Button>
              <Button type="button" variant="ghost" className="px-2.5 font-normal" onClick={() => setConfirmingDiscard(true)} disabled={submitting || (!draft.content && draft.replyToCommentId === null && !restored)}>
                清空草稿
              </Button>
            </div>
          </form>
        ) : (
          <div className="comment-guest">
            <h3 className="font-medium">参与讨论</h3>
            <p className="mt-2 text-sm text-muted">登录后可以发表评论和回复。</p>
            <p className="mt-3 flex gap-4 text-sm">
              <Button asChild size="sm"><Link to="/login" state={authState}>登录后评论</Link></Button>
              <Link to="/register" state={authState} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">
                注册
              </Link>
            </p>
          </div>
        )}
      </div>
      {identity && confirmingDiscard ? <DiscardDraftConfirm onConfirm={abandon} onCancel={() => setConfirmingDiscard(false)} /> : null}
    </section>
  )
}

function CommentEntry({
  comment,
  quote,
  canDelete,
  confirming,
  deleting,
  error,
  onReply,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  comment: CommentItem
  quote: ReplyQuote
  canDelete: boolean
  confirming: boolean
  deleting: boolean
  error: string | null
  onReply: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  return (
    <article id={`comment-${comment.id}`} tabIndex={-1} aria-labelledby={`comment-${comment.id}-meta`}>
      <p id={`comment-${comment.id}-meta`} className="comment-meta">
        <span className="comment-author">{comment.author_username}</span>
        <time dateTime={comment.created_at}>{formatTimestamp(comment.created_at)}</time>
        <span>#{comment.id}</span>
      </p>
      <div className="mt-2">
        <Quote quote={quote} />
      </div>
      <p className="comment-body">{comment.content}</p>
      <div className="comment-actions">
        <Button type="button" variant="ghost" className="px-2.5 font-normal" onClick={onReply}>
          <Reply aria-hidden />回复
        </Button>
        {canDelete ? (
          <Button type="button" variant="ghost" className="px-2.5 font-normal hover:text-danger" onClick={onAskDelete}>
            删除
          </Button>
        ) : null}
      </div>
      {canDelete && confirming ? (
        <DeleteConfirm title="删除这条评论？" description={`「${comment.content.slice(0, 80)}」删除后无法恢复，回复会保留。`} deleting={deleting} error={error} onConfirm={onConfirmDelete} onCancel={onCancelDelete} />
      ) : null}
    </article>
  )
}
