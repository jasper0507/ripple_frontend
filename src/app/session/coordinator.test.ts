import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { createAuthStorage } from '@/lib/auth-storage'
import type { AuthSyncMessage } from '@/lib/tab-sync'
import {
  AuthRequiredError,
  RenewUnavailableError,
  SessionCoordinator,
  type AuthTransport,
  type CoordinatorDeps,
} from './coordinator'

// ---------- 测试替身 ----------

function makeToken(sub: string, expSeconds: number): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, exp: expSeconds, iat: 1, iss: 'bluebell' })}.sig`
}

export const FAR_FUTURE = 4_000_000_000
export const EXPIRED = 1_000

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

function createTransport(overrides: Partial<AuthTransport> = {}) {
  const transport = {
    login: vi.fn<AuthTransport['login']>(),
    refresh: vi.fn<AuthTransport['refresh']>(),
    logout: vi.fn<AuthTransport['logout']>().mockResolvedValue(undefined),
  }
  return Object.assign(transport, overrides) as typeof transport
}

interface Harness {
  coordinator: SessionCoordinator
  transport: ReturnType<typeof createTransport>
  storage: ReturnType<typeof createAuthStorage>
  rawStorage: MemoryStorage
  posted: AuthSyncMessage[]
  cacheReset: string[]
  draftsClear: string[]
  sessionIds: string[]
  nowMs: { value: number }
  emit(message: AuthSyncMessage): void
}

function createHarness(
  overrides: Partial<AuthTransport> = {},
  depsOverrides: Partial<CoordinatorDeps> = {},
): Harness {
  const transport = createTransport(overrides)
  const rawStorage = new MemoryStorage()
  const storage = createAuthStorage(rawStorage)
  const posted: AuthSyncMessage[] = []
  const cacheReset: string[] = []
  const draftsClear: string[] = []
  const sessionIds: string[] = []
  const nowMs = { value: 1_000_000 }

  // 串行执行的锁，模拟 Web Locks 的互斥语义
  let queue: Promise<unknown> = Promise.resolve()
  const lock = {
    runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      const run = queue.then(fn)
      queue = run.catch(() => {})
      return run
    },
  }

  const coordinator = new SessionCoordinator({
    transport,
    storage,
    lock,
    channel: {
      post: (message) => posted.push(message),
      subscribe: () => () => {},
    },
    newSessionId: () => {
      const id = `session-${sessionIds.length + 1}`
      sessionIds.push(id)
      return id
    },
    now: () => nowMs.value,
    onAccountCacheReset: (uuid) => cacheReset.push(uuid),
    onAccountDraftsClear: (uuid) => draftsClear.push(uuid),
    ...depsOverrides,
  })
  coordinator.subscribe(() => {})
  // 与 React 绑定一致：频道消息进入协调器
  const emit = (message: AuthSyncMessage) => coordinator.handleSyncMessage(message)
  return {
    coordinator,
    transport,
    storage,
    rawStorage,
    posted,
    cacheReset,
    draftsClear,
    sessionIds,
    nowMs,
    emit,
  }
}

function networkError(): ApiError {
  return new ApiError('network', '网络故障')
}

function authError(): ApiError {
  return new ApiError('auth', '未登录或登录已过期', { httpStatus: 401, code: 'UNAUTHORIZED' })
}

function serverError(): ApiError {
  return new ApiError('server', '服务器内部错误', { httpStatus: 500, code: 'INTERNAL_ERROR' })
}

function rateLimitedError(): ApiError {
  return new ApiError('rate-limited', '请求过于频繁，请稍后再试', {
    httpStatus: 429,
    code: 'TOO_MANY_REQUESTS',
  })
}

// ---------- 冷启动恢复 ----------

describe('冷启动恢复', () => {
  it('刷新成功：按令牌 UUID 与持久用户名建立会话', async () => {
    const h = createHarness({
      refresh: vi.fn().mockResolvedValue({ accessToken: makeToken('uuid-1', FAR_FUTURE) }),
    })
    h.storage.writeUsername('alice')
    h.coordinator.subscribe(() => {})
    await h.coordinator.restore()

    const snapshot = h.coordinator.getSnapshot()
    expect(snapshot.status).toBe('authenticated')
    expect(snapshot.identity).toMatchObject({ username: 'alice', userUuid: 'uuid-1' })
    expect(snapshot.identity?.sessionId).toBe('session-1')
  })

  it('401：确定的未登录，清持久用户名，进入游客', async () => {
    const h = createHarness({ refresh: vi.fn().mockRejectedValue(authError()) })
    h.storage.writeUsername('alice')
    await h.coordinator.restore()

    expect(h.coordinator.getSnapshot()).toMatchObject({ status: 'guest', issue: null })
    expect(h.storage.readUsername()).toBeNull()
    expect(h.transport.refresh).toHaveBeenCalledTimes(1)
  })

  it('网络故障由协调者重试一次，第二次成功则恢复', async () => {
    const h = createHarness({
      refresh: vi
        .fn()
        .mockRejectedValueOnce(networkError())
        .mockResolvedValueOnce({ accessToken: makeToken('uuid-1', FAR_FUTURE) }),
    })
    h.storage.writeUsername('alice')
    await h.coordinator.restore()

    expect(h.coordinator.getSnapshot().status).toBe('authenticated')
    expect(h.transport.refresh).toHaveBeenCalledTimes(2)
  })

  it('连续网络故障：临时故障标记，不冒充确定的未登录，保留持久用户名', async () => {
    const h = createHarness({ refresh: vi.fn().mockRejectedValue(networkError()) })
    h.storage.writeUsername('alice')
    await h.coordinator.restore()

    expect(h.coordinator.getSnapshot()).toMatchObject({
      status: 'guest',
      identity: null,
      issue: 'renew-unavailable',
    })
    expect(h.storage.readUsername()).toBe('alice')
    expect(h.transport.refresh).toHaveBeenCalledTimes(2)
  })

  it('500 同样按临时故障处理', async () => {
    const h = createHarness({ refresh: vi.fn().mockRejectedValue(serverError()) })
    await h.coordinator.restore()
    expect(h.coordinator.getSnapshot().issue).toBe('renew-unavailable')
  })

  it('429 限流：按临时故障处理且不立即重试，保留持久用户名', async () => {
    const h = createHarness({ refresh: vi.fn().mockRejectedValue(rateLimitedError()) })
    h.storage.writeUsername('alice')
    await h.coordinator.restore()

    expect(h.coordinator.getSnapshot()).toMatchObject({
      status: 'guest',
      identity: null,
      issue: 'renew-unavailable',
    })
    expect(h.storage.readUsername()).toBe('alice')
    expect(h.transport.refresh).toHaveBeenCalledTimes(1)
  })

  it('临时故障后可再次恢复', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ accessToken: makeToken('uuid-1', FAR_FUTURE) })
    const h = createHarness({ refresh })
    await h.coordinator.restore()
    expect(h.coordinator.getSnapshot().issue).toBe('renew-unavailable')

    await h.coordinator.restore()
    expect(h.coordinator.getSnapshot().status).toBe('authenticated')
  })
})

// ---------- 登录 ----------

describe('登录', () => {
  it('成功：建立会话、持久用户名、代次递增并广播', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')

    expect(h.coordinator.getSnapshot().identity).toMatchObject({
      username: 'alice',
      userUuid: 'uuid-1',
    })
    expect(h.storage.readUsername()).toBe('alice')
    expect(h.storage.readEpoch()).toBe(1)
    expect(h.posted).toEqual([{ type: 'login', epoch: 1 }])
  })

  it('凭据错误原样上抛，不写持久状态、不广播、不触发续期', async () => {
    const h = createHarness({
      login: vi
        .fn()
        .mockRejectedValue(
          new ApiError('auth', '用户名或密码错误', { httpStatus: 401, code: 'INVALID_CREDENTIALS' }),
        ),
    })
    await expect(h.coordinator.login('alice', 'wrong')).rejects.toMatchObject({
      kind: 'auth',
      code: 'INVALID_CREDENTIALS',
    })
    expect(h.storage.readUsername()).toBeNull()
    expect(h.posted).toEqual([])
    expect(h.transport.refresh).not.toHaveBeenCalled()
  })

  it('换账号：清理旧账号缓存，保留草稿', async () => {
    const h = createHarness({
      login: vi
        .fn()
        .mockResolvedValueOnce({ username: 'alice', accessToken: makeToken('uuid-1', FAR_FUTURE) })
        .mockResolvedValueOnce({ username: 'bob', accessToken: makeToken('uuid-2', FAR_FUTURE) }),
    })
    await h.coordinator.login('alice', 'Example123')
    await h.coordinator.login('bob', 'Example123')

    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual([])
    expect(h.coordinator.getSnapshot().identity?.userUuid).toBe('uuid-2')
    // 本人或换账号重新登录都建立新会话标识
    expect(h.coordinator.getSnapshot().identity?.sessionId).toBe('session-2')
  })
})

// ---------- 退出 ----------

describe('退出', () => {
  async function loggedIn(h: Harness, uuid = 'uuid-1') {
    h.transport.login.mockResolvedValue({
      username: 'alice',
      accessToken: makeToken(uuid, FAR_FUTURE),
    })
    await h.coordinator.login('alice', 'Example123')
  }

  it('204：清身份、持久用户名、账号缓存与该账号草稿，代次递增并广播', async () => {
    const h = createHarness()
    await loggedIn(h)
    await h.coordinator.logout()

    expect(h.coordinator.getSnapshot()).toMatchObject({ status: 'guest', identity: null })
    expect(h.storage.readUsername()).toBeNull()
    expect(h.storage.readEpoch()).toBe(2)
    expect(h.posted).toContainEqual({ type: 'logout', epoch: 2 })
    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual(['uuid-1'])
  })

  it('500/网络故障：上抛错误，不宣称退出完成，本地状态不变', async () => {
    const h = createHarness()
    await loggedIn(h)
    h.transport.logout.mockRejectedValueOnce(serverError())

    await expect(h.coordinator.logout()).rejects.toMatchObject({ kind: 'server' })
    expect(h.coordinator.getSnapshot().status).toBe('authenticated')
    expect(h.storage.readUsername()).toBe('alice')
    expect(h.posted.filter((m) => m.type === 'logout')).toEqual([])
    expect(h.draftsClear).toEqual([])
  })

  it('退出等待在途刷新结束后再发送 logout', async () => {
    const order: string[] = []
    let releaseRefresh!: () => void
    const h = createHarness({
      refresh: vi.fn().mockImplementation(
        () =>
          new Promise<{ accessToken: string }>((resolve) => {
            releaseRefresh = () => resolve({ accessToken: makeToken('uuid-1', FAR_FUTURE) })
          }),
      ),
      logout: vi.fn().mockImplementation(async () => {
        order.push('logout')
      }),
    })
    h.storage.writeUsername('alice')
    const restoring = h.coordinator.restore().then(() => {
      order.push('restore-done')
    })
    // 等 restore 进入锁内刷新
    await vi.waitFor(() => expect(h.transport.refresh).toHaveBeenCalledTimes(1))
    // 恢复未完成前身份未建立；先手动放入身份以测试 logout 路径
    const logging = h.coordinator.login('alice', 'Example123')
    h.transport.login.mockResolvedValue({
      username: 'alice',
      accessToken: makeToken('uuid-1', FAR_FUTURE),
    })
    releaseRefresh()
    await restoring
    await logging
    const loggingOut = h.coordinator.logout()
    await loggingOut
    expect(order).toEqual(['restore-done', 'logout'])
  })
})

// ---------- 续期与受保护操作 ----------

describe('续期与受保护操作', () => {
  async function loggedInExpired(h: Harness) {
    h.transport.login.mockResolvedValue({
      username: 'alice',
      accessToken: makeToken('uuid-1', EXPIRED),
    })
    await h.coordinator.login('alice', 'Example123')
  }

  it('同标签页并发续期合并为一次刷新', async () => {
    const h = createHarness()
    await loggedInExpired(h)
    h.transport.refresh.mockResolvedValue({ accessToken: makeToken('uuid-1', FAR_FUTURE) })

    const [a, b] = await Promise.all([
      h.coordinator.getValidAccessToken(),
      h.coordinator.getValidAccessToken(),
    ])
    expect(a).toBe(b)
    expect(h.transport.refresh).toHaveBeenCalledTimes(1)
  })

  it('令牌有效时不刷新', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')
    await h.coordinator.getValidAccessToken()
    expect(h.transport.refresh).not.toHaveBeenCalled()
  })

  it('临时续期故障：保留会话与身份，标记故障并抛 RenewUnavailableError', async () => {
    const h = createHarness()
    await loggedInExpired(h)
    h.transport.refresh.mockRejectedValue(networkError())

    await expect(h.coordinator.getValidAccessToken()).rejects.toBeInstanceOf(
      RenewUnavailableError,
    )
    const snapshot = h.coordinator.getSnapshot()
    expect(snapshot.status).toBe('authenticated')
    expect(snapshot.issue).toBe('renew-unavailable')
    expect(h.cacheReset).toEqual([])
  })

  it('续期被限流：保留会话与身份，不重试、不判定失效', async () => {
    const h = createHarness()
    await loggedInExpired(h)
    h.transport.refresh.mockRejectedValue(rateLimitedError())

    await expect(h.coordinator.getValidAccessToken()).rejects.toBeInstanceOf(
      RenewUnavailableError,
    )
    expect(h.coordinator.getSnapshot()).toMatchObject({
      status: 'authenticated',
      issue: 'renew-unavailable',
    })
    expect(h.transport.refresh).toHaveBeenCalledTimes(1)
    expect(h.cacheReset).toEqual([])
    expect(h.posted.some((message) => message.type === 'expired')).toBe(false)
  })

  it('401 续期失败：最终失效，清身份与账号缓存、保留草稿并广播', async () => {
    const h = createHarness()
    await loggedInExpired(h)
    h.transport.refresh.mockRejectedValue(authError())

    await expect(h.coordinator.getValidAccessToken()).rejects.toBeInstanceOf(AuthRequiredError)
    expect(h.coordinator.getSnapshot().status).toBe('guest')
    expect(h.storage.readUsername()).toBeNull()
    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual([])
    expect(h.posted).toContainEqual({ type: 'expired', epoch: 1 })
  })

  it('写操作：令牌到期先续期再首次发送', async () => {
    const h = createHarness()
    await loggedInExpired(h)
    const freshToken = makeToken('uuid-1', FAR_FUTURE)
    h.transport.refresh.mockResolvedValue({ accessToken: freshToken })

    const seen: string[] = []
    await h.coordinator.runProtected(async (token) => {
      seen.push(token)
      return 'ok'
    }, 'write')
    expect(seen).toEqual([freshToken])
    expect(h.transport.refresh).toHaveBeenCalledTimes(1)
  })

  it('写操作：已发出收到 401 不自动重放', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')
    const fn = vi.fn().mockRejectedValue(authError())

    await expect(h.coordinator.runProtected(fn, 'write')).rejects.toMatchObject({ kind: 'auth' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(h.transport.refresh).not.toHaveBeenCalled()
  })

  it('读操作：401 后续期并重发一次', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')
    const freshToken = makeToken('uuid-1', FAR_FUTURE)
    h.transport.refresh.mockResolvedValue({ accessToken: freshToken })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(authError())
      .mockResolvedValueOnce('data')

    await expect(h.coordinator.runProtected(fn, 'read')).resolves.toBe('data')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[1]?.[0]).toBe(freshToken)
  })

  it('读操作：401 后续期确定失效则最终失效并上抛原错误', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')
    h.transport.refresh.mockRejectedValue(authError())
    const fn = vi.fn().mockRejectedValue(authError())

    await expect(h.coordinator.runProtected(fn, 'read')).rejects.toMatchObject({ kind: 'auth' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(h.coordinator.getSnapshot().status).toBe('guest')
  })

  it('读操作：网络错误不触发续期', async () => {
    const h = createHarness({
      login: vi.fn().mockResolvedValue({
        username: 'alice',
        accessToken: makeToken('uuid-1', FAR_FUTURE),
      }),
    })
    await h.coordinator.login('alice', 'Example123')
    const fn = vi.fn().mockRejectedValue(networkError())
    await expect(h.coordinator.runProtected(fn, 'read')).rejects.toMatchObject({ kind: 'network' })
    expect(h.transport.refresh).not.toHaveBeenCalled()
  })
})

// ---------- 跨标签页同步与代次隔离 ----------

describe('跨标签页同步', () => {
  async function loggedIn(h: Harness, uuid = 'uuid-1') {
    h.transport.login.mockResolvedValue({
      username: 'alice',
      accessToken: makeToken(uuid, FAR_FUTURE),
    })
    await h.coordinator.login('alice', 'Example123')
  }

  it('logout 消息：清本地会话、账号缓存与该账号草稿', async () => {
    const h = createHarness()
    await loggedIn(h)
    // 模拟其他标签页退出（代次 2）
    h.emit({ type: 'logout', epoch: 2 })

    expect(h.coordinator.getSnapshot().status).toBe('guest')
    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual(['uuid-1'])
    expect(h.storage.readUsername()).toBe('alice') // 本标签页不动持久存储，由退出方清理
  })

  it('旧代次消息被忽略', async () => {
    const h = createHarness()
    await loggedIn(h)
    h.emit({ type: 'logout', epoch: 1 })
    expect(h.coordinator.getSnapshot().status).toBe('authenticated')
  })

  it('login 消息：清旧账号缓存并经刷新恢复新会话', async () => {
    const h = createHarness()
    await loggedIn(h)
    h.storage.writeUsername('bob') // 登录方已写入新用户名
    h.transport.refresh.mockResolvedValue({ accessToken: makeToken('uuid-2', FAR_FUTURE) })

    h.emit({ type: 'login', epoch: 2 })
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().identity?.userUuid).toBe('uuid-2'),
    )
    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual([])
  })

  it('expired 消息：代次匹配时按最终失效处理，保留草稿', async () => {
    const h = createHarness()
    await loggedIn(h)
    h.emit({ type: 'expired', epoch: 1 })

    expect(h.coordinator.getSnapshot().status).toBe('guest')
    expect(h.cacheReset).toEqual(['uuid-1'])
    expect(h.draftsClear).toEqual([])
  })

  it('expired 消息：代次不匹配（此后有新登录）被忽略', async () => {
    const h = createHarness()
    await loggedIn(h)
    h.storage.writeEpoch(2) // 另一标签页已登录
    h.emit({ type: 'expired', epoch: 1 })
    expect(h.coordinator.getSnapshot().status).toBe('authenticated')
  })

  it('刷新期间代次变化：迟到刷新结果被丢弃，重试后按最新会话定论', async () => {
    let releaseRefresh!: () => void
    const h = createHarness({
      refresh: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<{ accessToken: string }>((resolve) => {
              releaseRefresh = () => resolve({ accessToken: makeToken('uuid-1', FAR_FUTURE) })
            }),
        )
        // 退出方已清 Cookie：重试刷新得到 401
        .mockRejectedValueOnce(authError()),
    })
    h.storage.writeUsername('alice')
    const restoring = h.coordinator.restore()
    await vi.waitFor(() => expect(h.transport.refresh).toHaveBeenCalledTimes(1))
    h.storage.writeEpoch(5) // 其他标签页退出时写入的代次
    h.emit({ type: 'logout', epoch: 5 })
    releaseRefresh()
    await restoring

    expect(h.coordinator.getSnapshot().status).toBe('guest')
    expect(h.coordinator.getSnapshot().identity).toBeNull()
  })

  it('恢复在途时其他标签页登录：不卡在 unknown，经重试建立新会话', async () => {
    let releaseFirst!: () => void
    const h = createHarness({
      refresh: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<{ accessToken: string }>((resolve) => {
              releaseFirst = () => resolve({ accessToken: makeToken('uuid-1', FAR_FUTURE) })
            }),
        )
        .mockResolvedValueOnce({ accessToken: makeToken('uuid-2', FAR_FUTURE) }),
    })
    const restoring = h.coordinator.restore()
    await vi.waitFor(() => expect(h.transport.refresh).toHaveBeenCalledTimes(1))
    // 其他标签页登录为 bob：写入持久身份与代次后广播
    h.storage.writeUsername('bob')
    h.storage.writeEpoch(1)
    h.emit({ type: 'login', epoch: 1 })
    releaseFirst()
    await restoring
    await vi.waitFor(() =>
      expect(h.coordinator.getSnapshot().status).toBe('authenticated'),
    )

    expect(h.coordinator.getSnapshot().identity).toMatchObject({
      username: 'bob',
      userUuid: 'uuid-2',
    })
    expect(h.transport.refresh).toHaveBeenCalledTimes(2)
  })

  it('休眠标签页恢复操作前核对代次并重新恢复', async () => {
    const h = createHarness()
    await loggedIn(h)
    // 休眠期间其他标签页退出并重新登录为 bob
    h.storage.writeEpoch(3)
    h.storage.writeUsername('bob')
    h.transport.refresh.mockResolvedValue({ accessToken: makeToken('uuid-2', FAR_FUTURE) })

    await h.coordinator.getValidAccessToken()
    expect(h.coordinator.getSnapshot().identity?.userUuid).toBe('uuid-2')
    expect(h.cacheReset).toEqual(['uuid-1'])
  })
})
