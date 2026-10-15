import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router'
import { apiLogin, apiLogout, apiRefresh } from '@/api/auth'
import { isAccountQuery } from '@/api/query-keys'
import { clearDraftsForUser, createAuthStorage } from '@/lib/auth-storage'
import { safeRedirectTarget } from '@/lib/validation'
import { createBroadcastAuthChannel, createWebAuthLock } from '@/lib/tab-sync'
import {
  AuthRequiredError,
  RenewUnavailableError,
  SessionCoordinator,
  type AuthIdentity,
} from './session/coordinator'

// 会话状态由 React Context 维护（唯一会话来源）；协调逻辑在纯 TS 的
// SessionCoordinator 中，本文件负责 React 绑定与账号缓存/草稿清理接线。

export interface SessionState {
  status: 'unknown' | 'guest' | 'authenticated'
  identity: AuthIdentity | null
  /** 临时续期故障：不是确定的未登录，保留输入并提示稍后重试 */
  issue: 'renew-unavailable' | null
}

export interface AuthActions {
  login(username: string, password: string): Promise<void>
  logout(): Promise<void>
  /** 令牌到期先续期；写操作已发出不重放，读操作 401 续期后重发一次 */
  runProtected<T>(fn: (accessToken: string) => Promise<T>, kind: 'read' | 'write'): Promise<T>
  getValidAccessToken(): Promise<string>
  /** 临时故障后由用户主动重试恢复 */
  retryRestore(): Promise<void>
  /** 回调当时的登录身份。不要用提交开始时的副本判断晚到结果。 */
  currentIdentity(): AuthIdentity | null
}

const SessionContext = createContext<SessionState>({
  status: 'unknown',
  identity: null,
  issue: null,
})
const AuthActionsContext = createContext<AuthActions | null>(null)

function createCoordinator(queryClient: QueryClient): SessionCoordinator {
  const storage = createAuthStorage(window.localStorage)
  const channel = createBroadcastAuthChannel()
  const coordinator = new SessionCoordinator({
    transport: { login: apiLogin, refresh: apiRefresh, logout: apiLogout },
    storage,
    lock: createWebAuthLock(),
    channel,
    newSessionId: () => crypto.randomUUID(),
    now: () => Date.now(),
    // 公共查询缓存不随账号变化清空；草稿仅主动退出时清理
    onAccountCacheReset: (userUuid) => {
      queryClient.removeQueries({
        predicate: (query) => isAccountQuery(query.queryKey, userUuid),
      })
    },
    onAccountDraftsClear: (userUuid) => {
      clearDraftsForUser(window.sessionStorage, userUuid)
    },
  })
  channel.subscribe((message) => coordinator.handleSyncMessage(message))
  return coordinator
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [coordinator] = useState(() => createCoordinator(queryClient))
  const snapshot = useSyncExternalStore(
    (listener) => coordinator.subscribe(listener),
    () => coordinator.getSnapshot(),
  )

  useEffect(() => {
    // 冷启动恢复：与公开查询并行，身份未确定时不执行受保护操作
    void coordinator.restore()
  }, [coordinator])

  const [actions] = useState<AuthActions>(() => ({
    login: (username, password) => coordinator.login(username, password),
    logout: () => coordinator.logout(),
    runProtected: (fn, kind) => coordinator.runProtected(fn, kind),
    getValidAccessToken: () => coordinator.getValidAccessToken(),
    retryRestore: () => coordinator.restore(),
    currentIdentity: () => coordinator.getSnapshot().identity,
  }))

  return (
    <SessionContext.Provider value={snapshot}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </SessionContext.Provider>
  )
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}

export function useAuthActions(): AuthActions {
  const actions = useContext(AuthActionsContext)
  if (!actions) throw new Error('useAuthActions 必须在 SessionProvider 内使用')
  return actions
}

export { AuthRequiredError, RenewUnavailableError }

/** 受保护页面接线：身份未确定时等待，游客进入登录并保留原站内目标。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'unknown') {
    return <p className="text-sm text-muted">正在确认登录状态…</p>
  }
  if (session.status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
          listFrom: safeRedirectTarget((location.state as { from?: unknown } | null)?.from) ?? undefined,
        }}
      />
    )
  }
  return children
}
