// 跨标签页认证协调：Web Locks 浏览器级互斥 + BroadcastChannel 会话同步。
// 选型与一次性轮换契约匹配，见 docs/adr/0001。
//
// - 锁串行化刷新与退出：同一浏览器任一时刻只有一个标签页使用共享 Cookie
//   调用 refresh/logout，避免并发轮换导致的误判失效与退出竞态。
// - 频道同步登录与退出：登录/退出的标签页广播代次，其他标签页据此
//   重新恢复或清理本地会话；不广播访问令牌本体。

export type AuthSyncMessage =
  | { type: 'login'; epoch: number }
  | { type: 'logout'; epoch: number }
  | { type: 'expired'; epoch: number }

export interface AuthLock {
  runExclusive<T>(fn: () => Promise<T>): Promise<T>
}

export interface AuthChannel {
  post(message: AuthSyncMessage): void
  subscribe(listener: (message: AuthSyncMessage) => void): () => void
}

export const AUTH_LOCK_NAME = 'bluebell:auth:lock'
export const AUTH_CHANNEL_NAME = 'bluebell:auth'

/** 不支持 Web Locks 时退化为标签页内直接执行（主浏览器 Chrome/Edge 均支持，降级记入验证文档） */
export function createWebAuthLock(): AuthLock {
  return {
    runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(AUTH_LOCK_NAME, fn) as Promise<T>
      }
      return fn()
    },
  }
}

export function createBroadcastAuthChannel(): AuthChannel {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, subscribe: () => () => {} }
  }
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
  return {
    post: (message) => channel.postMessage(message),
    subscribe: (listener) => {
      const handler = (event: MessageEvent) => listener(event.data as AuthSyncMessage)
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
  }
}
