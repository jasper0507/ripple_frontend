import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { FileCheck2, SquarePen } from 'lucide-react'
import { communitiesQueryOptions, type CommunitySummary } from '@/api/communities'
import { ApiError, RATE_LIMITED_MESSAGE } from '@/api/errors'
import { createPost } from '@/api/posts'
import { AuthRequiredError, RenewUnavailableError, useAuthActions, useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DiscardDraftConfirm } from '@/components/discard-draft-confirm'
import { postListTargetFromPath } from '@/lib/post-list'
import {
  clearPostDraft,
  normalizedPostDraft,
  postSubmitOutcome,
  readPostDraft,
  validatePostForm,
  writePostDraft,
  type PostFieldErrors,
} from '@/lib/post-draft'
import { safeRedirectTarget } from '@/lib/validation'

function writeError(error: unknown): string {
  if (error instanceof RenewUnavailableError) return '暂时无法续期，请稍后重试。'
  if (error instanceof AuthRequiredError) return '登录已失效，请重新登录。'
  if (error instanceof ApiError) {
    if (error.kind === 'network' || error.kind === 'server') {
      return '结果未确认。请先查看帖子是否已发布，不要直接再次提交。'
    }
    if (error.kind === 'rate-limited') return `帖子没有发布，${RATE_LIMITED_MESSAGE}。`
    if (error.kind === 'not-found') return '所选社区不存在。'
    if (error.kind === 'params') return '标题、正文或社区不符合要求。'
    if (error.kind === 'auth') return '登录已失效，请重新登录。'
  }
  return '发布失败，请稍后重试。'
}

function NewPostForm({
  userUuid,
  sessionId,
  communities,
  sourceCommunityId,
}: {
  userUuid: string
  sessionId: string
  communities: CommunitySummary[]
  sourceCommunityId: number | null
}) {
  const actions = useAuthActions()
  const navigate = useNavigate()
  const location = useLocation()

  const [communityId, setCommunityId] = useState<number | null>(
    () => {
      const draft = readPostDraft(window.sessionStorage, userUuid)
      return draft ? draft.communityId : sourceCommunityId
    },
  )
  const [title, setTitle] = useState(
    () => readPostDraft(window.sessionStorage, userUuid)?.title ?? '',
  )
  const [content, setContent] = useState(
    () => readPostDraft(window.sessionStorage, userUuid)?.content ?? '',
  )
  const [errors, setErrors] = useState<PostFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [restored, setRestored] = useState(() => readPostDraft(window.sessionStorage, userUuid) !== null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  function persist(next: { communityId: number | null; title: string; content: string }) {
    writePostDraft(window.sessionStorage, userUuid, next)
  }

  function onCommunityChange(value: string) {
    const nextId = value === '' ? null : Number(value)
    setCommunityId(nextId)
    setErrors((current) => ({ ...current, communityId: undefined }))
    persist({ communityId: nextId, title, content })
  }

  function onTitleChange(value: string) {
    setTitle(value)
    setErrors((current) => ({ ...current, title: undefined }))
    persist({ communityId, title: value, content })
  }

  function onContentChange(value: string) {
    setContent(value)
    setErrors((current) => ({ ...current, content: undefined }))
    persist({ communityId, title, content: value })
  }

  function abandon() {
    clearPostDraft(window.sessionStorage, userUuid)
    setCommunityId(sourceCommunityId)
    setTitle('')
    setContent('')
    setErrors({})
    setFormError(null)
    setRestored(false)
    setConfirmingDiscard(false)
    requestAnimationFrame(() => document.getElementById('post-title')?.focus())
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    const normalized = normalizedPostDraft({ communityId, title, content })
    const knownCommunity =
      communityId !== null &&
      communities.some((community) => community.id === communityId)
    if (!normalized || !knownCommunity) {
      const nextErrors = {
        ...(validatePostForm({ communityId, title, content }) ?? {}),
        ...(knownCommunity ? {} : { communityId: '请选择社区' }),
      }
      setErrors(nextErrors)
      const field = nextErrors.communityId ? 'community' : nextErrors.title ? 'title' : 'content'
      document.getElementById(`post-${field}`)?.focus()
      return
    }

    const snapshot = { userUuid, sessionId, draft: normalized }
    writePostDraft(window.sessionStorage, snapshot.userUuid, normalized)
    setTitle(normalized.title)
    setContent(normalized.content)
    setErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      const created = await actions.runProtected(
        (token) =>
          createPost(token, {
            title: normalized.title,
            content: normalized.content,
            community_id: normalized.communityId as number,
          }),
        'write',
      )
      if (postSubmitOutcome(window.sessionStorage, snapshot, actions.currentIdentity()) !== 'commit') {
        setFormError('发布结果已经返回，但当前输入或登录状态已变化，没有自动跳转。')
        return
      }
      clearPostDraft(window.sessionStorage, snapshot.userUuid)
      const from = safeRedirectTarget((location.state as { from?: unknown } | null)?.from)
      navigate(`/posts/${created.id}`, {
        state: { from: from ?? undefined, justCreated: true },
      })
    } catch (error) {
      setFormError(writeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const selectedInList = communities.some((community) => community.id === communityId)

  return (
    <form className="mt-6 flex flex-col gap-6" onSubmit={onSubmit} noValidate>
      {restored ? <p role="status" className="feedback feedback-info"><FileCheck2 aria-hidden className="mt-1 size-4 shrink-0" />已恢复本标签页草稿</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-community" className="text-sm font-medium">
          社区
        </label>
        <select
          id="post-community"
          name="community"
          className="focus:outline-none form-control"
          aria-invalid={errors.communityId ? true : undefined}
          aria-describedby={errors.communityId ? 'post-community-error' : undefined}
          value={selectedInList && communityId !== null ? String(communityId) : ''}
          disabled={submitting}
          onChange={(event) => onCommunityChange(event.target.value)}
        >
          <option value="">选择社区</option>
          {communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
        {errors.communityId ? (
          <p id="post-community-error" className="text-sm text-danger">{errors.communityId}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-title" className="text-sm font-medium">
          标题
        </label>
        <Input
          id="post-title"
          name="title"
          value={title}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={`post-title-count${errors.title ? ' post-title-error' : ''}`}
          disabled={submitting}
          onChange={(event) => onTitleChange(event.target.value)}
        />
        <p id="post-title-count" className={`text-[13px] leading-5 ${[...title.trim()].length > 128 ? 'text-danger' : 'text-muted'}`}>{[...title.trim()].length} / 128 个字符</p>
        {errors.title ? <p id="post-title-error" className="text-sm text-danger">{errors.title}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-content" className="text-sm font-medium">
          正文
        </label>
        <textarea
          id="post-content"
          name="content"
          value={content}
          disabled={submitting}
          rows={10}
          className="focus:outline-none form-control disabled:bg-hover"
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={`post-content-hint post-content-count${errors.content ? ' post-content-error' : ''}`}
          onChange={(event) => onContentChange(event.target.value)}
        />
        <p id="post-content-hint" className="text-[13px] leading-5 text-muted">支持 Markdown：段落、列表、引用和代码。图片仅显示替代文字。</p>
        <p id="post-content-count" className={`text-[13px] leading-5 ${[...content.trim()].length > 10000 ? 'text-danger' : 'text-muted'}`}>{[...content.trim()].length} / 10,000 个字符</p>
        {errors.content ? <p id="post-content-error" className="text-sm text-danger">{errors.content}</p> : null}
      </div>
      {formError ? (
        <p role="alert" className="feedback feedback-warning">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={submitting}>
          <SquarePen aria-hidden />{submitting ? '发布中…' : '发布帖子'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirmingDiscard(true)} disabled={submitting || (!title && !content && !restored)}>
          清空草稿
        </Button>
      </div>
      {confirmingDiscard ? <DiscardDraftConfirm onConfirm={abandon} onCancel={() => setConfirmingDiscard(false)} /> : null}
    </form>
  )
}

export function NewPostPage() {
  const session = useSession()
  const location = useLocation()
  const from = safeRedirectTarget((location.state as { from?: unknown } | null)?.from)
  const { data, isPending, isError, isFetching, refetch } = useQuery(communitiesQueryOptions())
  const requestedCommunityId = from ? postListTargetFromPath(from)?.communityId ?? null : null
  const sourceCommunityId = data?.some((community) => community.id === requestedCommunityId) ? requestedCommunityId : null

  return (
    <section className="mx-auto max-w-[760px]">
      <Link to={from ?? '/'} className="text-link mb-4 inline-flex min-h-11 items-center text-sm">返回帖子列表</Link>
      <h1 className="page-title">发布帖子</h1>
      <p className="mt-2 text-sm leading-6 text-muted">选择社区，分享你的问题、想法或经验。</p>
      {isPending ? (
        <p role="status" className="mt-2 text-sm text-muted">
          正在确认可选社区…
        </p>
      ) : isError ? (
        <div className="mt-2">
          <p role="alert" className="text-sm text-muted">
            暂时无法读取社区列表，不能发布帖子。
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? '重试中…' : '重试'}
          </Button>
        </div>
      ) : data.length === 0 ? (
        <p role="status" className="mt-2 text-sm text-muted">
          当前没有可选社区，无法发布帖子。
        </p>
      ) : session.identity ? (
        <NewPostForm
          key={session.identity.userUuid}
          userUuid={session.identity.userUuid}
          sessionId={session.identity.sessionId}
          communities={data}
          sourceCommunityId={sourceCommunityId}
        />
      ) : null}
    </section>
  )
}
