import { draftKeyPrefix } from './auth-storage'

// 每个账号、每个帖子一份评论草稿，存在当前标签页的 sessionStorage。
// 键前缀与退出清理约定见 auth-storage.ts。主动退出会清掉该前缀下的全部草稿。

export interface CommentDraft {
  content: string
  replyToCommentId: number | null
  /** 服务端拒绝了这个回复目标。这不是列表上的「已删除」标记。 */
  replyTargetRejected: boolean
}

export interface CommentSubmitSnapshot {
  userUuid: string
  sessionId: string
  postId: number
  draft: CommentDraft
}

export function commentDraftStorageKey(userUuid: string, postId: number): string {
  return `${draftKeyPrefix(userUuid)}comment:${postId}`
}

export function isReplyId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

function isCommentDraft(value: unknown): value is CommentDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as CommentDraft
  return (
    typeof draft.content === 'string' &&
    isReplyId(draft.replyToCommentId) &&
    typeof draft.replyTargetRejected === 'boolean'
  )
}

export function readCommentDraft(
  storage: Storage,
  userUuid: string,
  postId: number,
): CommentDraft | null {
  const raw = storage.getItem(commentDraftStorageKey(userUuid, postId))
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isCommentDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeCommentDraft(
  storage: Storage,
  userUuid: string,
  postId: number,
  draft: CommentDraft,
): void {
  storage.setItem(commentDraftStorageKey(userUuid, postId), JSON.stringify(draft))
}

export function clearCommentDraft(storage: Storage, userUuid: string, postId: number): void {
  storage.removeItem(commentDraftStorageKey(userUuid, postId))
}

/** 按提交时去掉首尾空白的正文计 Unicode 字符，与后端校验一致。 */
export function validateCommentDraft(input: CommentDraft): string | null {
  const content = input.content.trim()
  if (content.length === 0) return '请填写评论'
  if ([...content].length > 2000) return '评论不超过 2,000 个字符'
  if (input.replyTargetRejected || !isReplyId(input.replyToCommentId)) {
    return '这个回复目标已经不能使用。请重新选择，或改为直接评论。'
  }
  return null
}

export function normalizedCommentDraft(input: CommentDraft): CommentDraft | null {
  if (validateCommentDraft(input)) return null
  return {
    content: input.content.trim(),
    replyToCommentId: input.replyToCommentId,
    replyTargetRejected: false,
  }
}

function sameDraft(left: CommentDraft, right: CommentDraft): boolean {
  return (
    left.content === right.content &&
    left.replyToCommentId === right.replyToCommentId &&
    left.replyTargetRejected === right.replyTargetRejected
  )
}

/**
 * 同一次登录里，草稿还和提交时一致才清理。
 * 人已经改了新内容时保留草稿，调用方仍可记下这次已发布的回显。
 * 账号或会话对不上时整段回调都不处理。
 */
export function commentSubmitOutcome(
  storage: Storage,
  snapshot: CommentSubmitSnapshot,
  current: { userUuid: string; sessionId: string } | null,
): 'commit' | 'echo-only' | 'ignore' {
  if (!current) return 'ignore'
  if (current.userUuid !== snapshot.userUuid || current.sessionId !== snapshot.sessionId) {
    return 'ignore'
  }
  const stored = readCommentDraft(storage, snapshot.userUuid, snapshot.postId)
  if (!stored || !sameDraft(stored, snapshot.draft)) return 'echo-only'
  return 'commit'
}

export type CommentCreateFailure =
  | 'target-rejected'
  | 'params'
  | 'unconfirmed'
  | 'post-missing'
  | 'auth'
  | 'rate-limited'
  | 'other'

/**
 * 带了回复目标且业务码明确是 INVALID_PARAMS，才视为目标不能用。
 * 其他参数错误保持参数错误，调用方不能据此把目标标成已删除。
 */
export function commentCreateFailure(
  error: { kind?: string; code?: string },
  sentReplyTarget: boolean,
): CommentCreateFailure {
  if (error.kind === 'network' || error.kind === 'server') return 'unconfirmed'
  if (error.kind === 'not-found') return 'post-missing'
  if (error.kind === 'auth') return 'auth'
  if (error.kind === 'rate-limited') return 'rate-limited'
  if (error.kind === 'params') {
    if (sentReplyTarget && error.code === 'INVALID_PARAMS') return 'target-rejected'
    return 'params'
  }
  return 'other'
}
