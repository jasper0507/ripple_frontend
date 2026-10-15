// 认证相关的浏览器持久存储与草稿键约定。
//
// localStorage（浏览器级，跨标签页共享）：
// - bluebell:auth:username — 已确认的用户名（用户已批准持久化，见 docs/adr/0001）
// - bluebell:auth:epoch — 浏览器会话代次，登录/退出递增；休眠标签页据此核对会话
//
// sessionStorage（标签页级）：草稿按用户 UUID 隔离，键前缀 bluebell:draft:{uuid}:
// 具体草稿读写随业务模块落地，本模块只约定前缀并提供退出时的按账号清理。

const USERNAME_KEY = 'bluebell:auth:username'
const EPOCH_KEY = 'bluebell:auth:epoch'

export interface AuthStorage {
  readUsername(): string | null
  writeUsername(username: string): void
  clearUsername(): void
  readEpoch(): number
  writeEpoch(epoch: number): void
}

export function createAuthStorage(storage: Storage): AuthStorage {
  return {
    readUsername: () => storage.getItem(USERNAME_KEY),
    writeUsername: (username) => storage.setItem(USERNAME_KEY, username),
    clearUsername: () => storage.removeItem(USERNAME_KEY),
    readEpoch: () => {
      const raw = storage.getItem(EPOCH_KEY)
      const epoch = raw === null ? 0 : Number.parseInt(raw, 10)
      return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0
    },
    writeEpoch: (epoch) => storage.setItem(EPOCH_KEY, String(epoch)),
  }
}

export function draftKeyPrefix(userUuid: string): string {
  return `bluebell:draft:${userUuid}:`
}

/** 主动退出时清理该账号在本标签页的全部草稿；公共内容与最终失效场景不调用 */
export function clearDraftsForUser(storage: Storage, userUuid: string): void {
  const prefix = draftKeyPrefix(userUuid)
  const keys: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key !== null && key.startsWith(prefix)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}
