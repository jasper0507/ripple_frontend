import { draftKeyPrefix } from './auth-storage'

// 每个账号一份发帖草稿，只存在当前标签页的 sessionStorage。
// 键前缀与退出清理约定见 auth-storage.ts。

export interface PostDraft {
  communityId: number | null
  title: string
  content: string
}

export interface PostFieldErrors {
  title?: string
  content?: string
  communityId?: string
}

export interface PostSubmitSnapshot {
  userUuid: string
  sessionId: string
  draft: PostDraft
}

export function postDraftStorageKey(userUuid: string): string {
  return `${draftKeyPrefix(userUuid)}post`
}

function isPostDraft(value: unknown): value is PostDraft {
  if (typeof value !== 'object' || value === null) return false
  const draft = value as PostDraft
  const communityOk =
    draft.communityId === null ||
    (typeof draft.communityId === 'number' &&
      Number.isSafeInteger(draft.communityId) &&
      draft.communityId > 0)
  return communityOk && typeof draft.title === 'string' && typeof draft.content === 'string'
}

export function readPostDraft(storage: Storage, userUuid: string): PostDraft | null {
  const raw = storage.getItem(postDraftStorageKey(userUuid))
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPostDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writePostDraft(storage: Storage, userUuid: string, draft: PostDraft): void {
  storage.setItem(postDraftStorageKey(userUuid), JSON.stringify(draft))
}

export function clearPostDraft(storage: Storage, userUuid: string): void {
  storage.removeItem(postDraftStorageKey(userUuid))
}

/** 本地校验。通过时返回 null；标题按字符数计，不用字节数。 */
export function validatePostForm(input: PostDraft): PostFieldErrors | null {
  const errors: PostFieldErrors = {}
  const title = input.title.trim()
  const content = input.content.trim()
  if (title.length === 0) errors.title = '请填写标题'
  else if ([...title].length > 128) errors.title = '标题不超过 128 个字符'
  if (content.length === 0) errors.content = '请填写正文'
  else if ([...content].length > 10000) errors.content = '正文不超过 10,000 个字符'
  if (input.communityId === null) errors.communityId = '请选择社区'
  return errors.title || errors.content || errors.communityId ? errors : null
}

export function normalizedPostDraft(input: PostDraft): PostDraft | null {
  if (validatePostForm(input)) return null
  return {
    communityId: input.communityId,
    title: input.title.trim(),
    content: input.content.trim(),
  }
}

function sameDraft(left: PostDraft, right: PostDraft): boolean {
  return (
    left.communityId === right.communityId &&
    left.title === right.title &&
    left.content === right.content
  )
}

/**
 * 成功回调只在本次提交的草稿、账号和会话都还对得上时清理并跳转。
 * 对不上则保留现在的输入，也不要导航到新会话。
 */
export function postSubmitOutcome(
  storage: Storage,
  snapshot: PostSubmitSnapshot,
  current: { userUuid: string; sessionId: string } | null,
): 'commit' | 'ignore' {
  if (!current) return 'ignore'
  if (current.userUuid !== snapshot.userUuid || current.sessionId !== snapshot.sessionId) {
    return 'ignore'
  }
  const stored = readPostDraft(storage, snapshot.userUuid)
  if (!stored || !sameDraft(stored, snapshot.draft)) return 'ignore'
  return 'commit'
}
