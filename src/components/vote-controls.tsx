import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp, Undo2, AlertTriangle, CheckCircle2, LoaderCircle, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError, RATE_LIMITED_MESSAGE } from '@/api/errors'
import {
  applyConfirmedVote,
  fetchPostVote,
  shouldReadVote,
  submitVote,
  voteQueryKey,
  voteRead,
  voteSubmitError,
  voteViewStillCurrent,
  type VoteDirection,
  type VoteRead,
} from '@/api/votes'
import { AuthRequiredError, RenewUnavailableError, useAuthActions, useSession } from '@/app/session'
import { Button } from '@/components/ui/button'
import { safeRedirectTarget } from '@/lib/validation'

const voteActions: readonly { direction: VoteDirection; label: string; icon: LucideIcon }[] = [
  { direction: 1, label: '赞成', icon: ThumbsUp },
  { direction: -1, label: '反对', icon: ThumbsDown },
  { direction: 0, label: '取消投票', icon: Undo2 },
]

const unconfirmedNotice = {
  text: '本次提交结果未确认，已重新查询当前选择。',
  alert: true,
} as const

function voteStatusText(input: {
  sessionStatus: 'unknown' | 'guest' | 'authenticated'
  read: VoteRead
  failed: boolean
}): string {
  if (input.sessionStatus === 'unknown') return '正在确认登录状态…'
  if (input.sessionStatus !== 'authenticated') return '登录后可以投票。'
  if (input.read.status === 'known') {
    if (input.read.direction === 1) return '你已赞成'
    if (input.read.direction === -1) return '你已反对'
    return '未投票或已取消'
  }
  if (input.failed) {
    return '暂时无法确认你之前的投票，可以重新选择或取消。'
  }
  return '正在读取你的投票…'
}

export function VoteControls({
  postId,
  upVotes,
  downVotes,
}: {
  postId: number
  upVotes: number
  downVotes: number
}) {
  const session = useSession()
  const actions = useAuthActions()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const identity = session.status === 'authenticated' ? session.identity : null
  const scope = identity ? `${postId}:${identity.userUuid}:${identity.sessionId}` : `${postId}:guest`
  const viewRef = useRef({ postId, identity })
  viewRef.current = { postId, identity }
  const voteQuery = useQuery({
    queryKey: identity ? voteQueryKey(postId, identity) : ['votes', 'idle', postId],
    enabled: identity !== null && shouldReadVote(session.status),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ signal }) =>
      actions.runProtected((token) => fetchPostVote(token, postId, signal), 'read'),
  })
  const [scopeKey, setScopeKey] = useState(scope)
  const [submitting, setSubmitting] = useState(false)
  const [pendingDirection, setPendingDirection] = useState<VoteDirection | null>(null)
  const [notice, setNotice] = useState<{ text: string; alert: boolean } | null>(null)
  if (scope !== scopeKey) {
    setScopeKey(scope)
    setSubmitting(false)
    setPendingDirection(null)
    setNotice(null)
  }

  const read = voteRead({
    enabled: identity !== null,
    pending: voteQuery.isPending,
    failed: voteQuery.isError,
    direction: voteQuery.data?.direction,
  })
  const from = location.pathname + location.search
  const authState = { from, listFrom: safeRedirectTarget((location.state as { from?: unknown } | null)?.from) ?? undefined }
  const busy = submitting || session.status === 'unknown'
  const statusText = voteStatusText({
    sessionStatus: session.status,
    read,
    failed: identity !== null && voteQuery.isError,
  })

  function sameSession(snapshot: { userUuid: string; sessionId: string }): boolean {
    const current = actions.currentIdentity()
    return current?.userUuid === snapshot.userUuid && current.sessionId === snapshot.sessionId
  }

  function stillThisView(snapshot: { postId: number; userUuid: string; sessionId: string }): boolean {
    return voteViewStillCurrent(snapshot, viewRef.current)
  }

  function markUnconfirmed(snapshot: { postId: number; userUuid: string; sessionId: string }) {
    // 丢弃已过时的个人方向，防止离开再返回后把旧选择显示成当前事实。
    // 写请求不重放；重新读取本人方向，读取失败仍保持未知。
    void queryClient.resetQueries({ queryKey: voteQueryKey(snapshot.postId, snapshot), exact: true })
    setNotice(unconfirmedNotice)
  }

  async function choose(direction: VoteDirection) {
    if (submitting || session.status === 'unknown') return
    if (!identity) {
      navigate('/login', { state: authState })
      return
    }
    const snapshot = { postId, userUuid: identity.userUuid, sessionId: identity.sessionId }
    setSubmitting(true)
    setPendingDirection(direction)
    setNotice(null)
    try {
      const confirmed = await actions.runProtected(
        (token) => submitVote(token, postId, direction),
        'write',
      )
      const outcome = await applyConfirmedVote(queryClient, {
        postId,
        confirmed,
        identity: snapshot,
        stillCurrent: () => sameSession(snapshot),
      })
      if (!stillThisView(snapshot)) return
      if (outcome === 'updated') return
      if (outcome === 'counts-unavailable') {
        setNotice({ text: '投票已记录。票数暂时没有更新。', alert: false })
        return
      }
      markUnconfirmed(snapshot)
    } catch (error) {
      if (!stillThisView(snapshot)) return
      if (error instanceof RenewUnavailableError) {
        setNotice({ text: '暂时无法续期，请稍后重试。', alert: true })
        return
      }
      if (error instanceof AuthRequiredError || (error instanceof ApiError && error.kind === 'auth')) {
        navigate('/login', { state: authState })
        return
      }
      const kind = voteSubmitError(error)
      if (kind === 'unconfirmed') {
        markUnconfirmed(snapshot)
        return
      }
      if (kind === 'missing') {
        setNotice({ text: '这篇帖子已经不存在。', alert: true })
        return
      }
      if (kind === 'rate-limited') {
        setNotice({ text: `投票没有提交，${RATE_LIMITED_MESSAGE}。`, alert: true })
        return
      }
      setNotice({ text: '投票没有提交，请稍后重试。', alert: true })
    } finally {
      if (stillThisView(snapshot)) {
        setSubmitting(false)
        setPendingDirection(null)
      }
    }
  }

  const pressed = (direction: VoteDirection) => read.status === 'known' && read.direction === direction

  return (
    <section aria-label="投票" className="vote-section">
      <div role="group" aria-label="投票操作" className="vote-actions">
        {voteActions.map((action) => {
          const Icon = action.icon
          const selected = pressed(action.direction)
          return (
            <Button
              key={action.direction}
              type="button"
              variant={action.direction === 0 ? 'ghost' : 'outline'}
              className={action.direction === 0
                ? 'rounded-full px-3 font-normal aria-pressed:text-primary'
                : 'rounded-full px-4 hover:border-primary hover:bg-primary-soft hover:text-primary aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary'}
              aria-label={action.direction === 0 ? action.label : `${action.label}，${action.direction === 1 ? upVotes : downVotes} 票`}
              aria-pressed={selected}
              aria-describedby="vote-status"
              disabled={busy}
              aria-busy={submitting && pendingDirection === action.direction}
              onClick={() => void choose(action.direction)}
            >
              {submitting && pendingDirection === action.direction
                ? <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                : <Icon aria-hidden="true" />}
              {action.label}
              {selected && action.direction !== 0 ? <CheckCircle2 aria-hidden className="size-3.5" /> : null}
              {action.direction !== 0 ? <span className="vote-count" aria-hidden="true">{action.direction === 1 ? upVotes : downVotes}</span> : null}
            </Button>
          )
        })}
      </div>
      <p id="vote-status" role="status" className="vote-note">
        {submitting ? '正在提交投票…' : statusText}
      </p>
      {notice ? (
        <p role={notice.alert ? 'alert' : 'status'} className={`feedback mt-3 ${notice.alert ? 'feedback-warning' : 'feedback-success'}`}>
          {notice.alert ? <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0" /> : <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0" />}
          {notice.text}
        </p>
      ) : null}
    </section>
  )
}
