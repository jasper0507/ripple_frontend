import { ApiError } from '@/api/errors'
import { isAccessTokenFresh, readAccessTokenClaims } from '@/lib/auth-token'
import type { AuthStorage } from '@/lib/auth-storage'
import type { AuthChannel, AuthLock, AuthSyncMessage } from '@/lib/tab-sync'

// 会话协调器（纯 TS，与 React 分离）：冷启动恢复、续期、登录、退出、
// 跨标签页同步与代次隔离。决策与残留边界见 docs/adr/0001。
//
// 关键规则：
// - 所有触碰共享 Cookie 的操作（refresh/login/logout）经浏览器级锁串行，
//   匹配一次性轮换契约；标签页内续期 single-flight。
// - 刷新网络故障/5xx 由协调者重试一次；仍失败为临时故障，401 为最终失效。
// - 登录、退出、最终失效只清理账号相关状态；草稿仅主动退出时清理。
// - 每次登录/退出递增持久代次；旧代次的迟到响应一律丢弃。

export interface AuthIdentity {
  username: string | null
  userUuid: string
  sessionId: string
}

export interface SessionSnapshot {
  status: 'unknown' | 'guest' | 'authenticated'
  identity: AuthIdentity | null
  /** 临时续期故障：不是确定的未登录，保留输入并提示稍后重试 */
  issue: 'renew-unavailable' | null
}

export class AuthRequiredError extends Error {
  override name = 'AuthRequiredError'
  constructor(message = '需要登录') {
    super(message)
  }
}

export class RenewUnavailableError extends Error {
  override name = 'RenewUnavailableError'
  constructor(message = '暂时无法续期，请稍后重试') {
    super(message)
  }
}

export interface AuthTransport {
  login(input: { username: string; password: string }): Promise<{ username: string; accessToken: string }>
  refresh(): Promise<{ accessToken: string }>
  logout(): Promise<void>
}

export interface CoordinatorDeps {
  transport: AuthTransport
  storage: AuthStorage
  lock: AuthLock
  channel: AuthChannel
  newSessionId(): string
  now(): number
  /** 账号相关查询缓存清理（最终失效、退出、换账号、本人重新登录）；保留公共缓存 */
  onAccountCacheReset?(userUuid: string): void
  /** 仅主动退出：清理该账号在本标签页的草稿 */
  onAccountDraftsClear?(userUuid: string): void
}

type RenewOutcome = 'ok' | 'invalid' | 'temporary' | 'stale'

interface AccessTokenState {
  token: string
  expiresAtMs: number
  userUuid: string
}

export class SessionCoordinator {
  private readonly deps: CoordinatorDeps
  private identity: AuthIdentity | null = null
  private accessToken: AccessTokenState | null = null
  private issue: 'renew-unavailable' | null = null
  private status: 'unknown' | 'guest' | 'authenticated' = 'unknown'
  private memoryEpoch = 0
  private renewPromise: Promise<RenewOutcome> | null = null
  private restorePromise: Promise<void> | null = null
  private readonly listeners = new Set<() => void>()
  private snapshot: SessionSnapshot = { status: 'unknown', identity: null, issue: null }

  constructor(deps: CoordinatorDeps) {
    this.deps = deps
    this.memoryEpoch = deps.storage.readEpoch()
  }

  /** 返回缓存快照：引用仅在状态变化时更新，可直接用于 useSyncExternalStore */
  getSnapshot(): SessionSnapshot {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(partial: {
    status?: SessionSnapshot['status']
    identity?: AuthIdentity | null
    issue?: 'renew-unavailable' | null
  }): void {
    if (partial.status !== undefined) this.status = partial.status
    if (partial.identity !== undefined) this.identity = partial.identity
    if (partial.issue !== undefined) this.issue = partial.issue
    this.snapshot = { status: this.status, identity: this.identity, issue: this.issue }
    for (const listener of this.listeners) listener()
  }

  private clearLocalSession(): void {
    this.identity = null
    this.accessToken = null
    this.issue = null
  }

  // ---------- 恢复 ----------

  /** 冷启动与临时故障后的重试恢复；已在恢复中则复用在途过程 */
  restore(): Promise<void> {
    if (this.restorePromise) return this.restorePromise
    if (this.status === 'authenticated') return Promise.resolve()
    this.restorePromise = this.doRestore().finally(() => {
      this.restorePromise = null
    })
    return this.restorePromise
  }

  private async doRestore(): Promise<void> {
    // stale 表示刷新在途期间浏览器会话已变化（如其他标签页登录）：
    // 重读代次后再次尝试，避免会话永远停在 unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // 代次在内存中单调不回退（其他标签页可能尚未写入持久代次）
      this.memoryEpoch = Math.max(this.deps.storage.readEpoch(), this.memoryEpoch)
      const outcome = await this.renew()
      if (outcome === 'ok') {
        this.establishSessionFromToken()
        return
      }
      if (outcome === 'stale') continue
      this.clearLocalSession()
      if (outcome === 'invalid') {
        // 最终失效：清身份与持久用户名，保留草稿与公共阅读
        this.deps.storage.clearUsername()
        this.setState({ status: 'guest', identity: null, issue: null })
      } else {
        // 临时故障：不当成确定的未登录；保留持久用户名，稍后或下次操作重试
        this.setState({ status: 'guest', identity: null, issue: 'renew-unavailable' })
      }
      return
    }
    // 连续被会话变化打断：按临时故障处理，由用户重试
    this.setState({ status: 'guest', identity: null, issue: 'renew-unavailable' })
  }

  private establishSessionFromToken(): void {
    const token = this.accessToken
    if (!token) return
    this.setState({
      status: 'authenticated',
      identity: {
        username: this.deps.storage.readUsername(),
        userUuid: token.userUuid,
        sessionId: this.deps.newSessionId(),
      },
      issue: null,
    })
  }

  // ---------- 续期 ----------

  private renew(): Promise<RenewOutcome> {
    this.renewPromise ??= this.renewExclusive().finally(() => {
      this.renewPromise = null
    })
    return this.renewPromise
  }

  private renewExclusive(): Promise<RenewOutcome> {
    return this.deps.lock.runExclusive(async () => {
      const epochAtStart = this.memoryEpoch
      const outcome = await this.attemptRefresh()
      if (outcome !== 'ok') return outcome
      // 代次隔离：刷新期间浏览器会话已变化，丢弃本次结果（Cookie 已被轮换，
      // 后续恢复仍可使用，本标签页不得据此建立或延续旧会话）
      if (this.memoryEpoch !== epochAtStart) return 'stale'
      // 共享 Cookie 已属于其他账号：同样按会话变化丢弃
      if (this.identity && this.identity.userUuid !== this.accessToken?.userUuid) {
        return 'stale'
      }
      if (this.issue !== null) this.setState({ issue: null })
      return 'ok'
    })
  }

  /**
   * 协调者重试一次（用户已确认）：仅网络故障与 5xx；401 为最终失效，不重试。
   * 429 被限流拒绝、未轮换 Cookie，按临时故障处理；立即重试只会再次被限流。
   */
  private async attemptRefresh(): Promise<'ok' | 'invalid' | 'temporary'> {
    const first = await this.refreshOnce()
    if (first === 'throttled') return 'temporary'
    if (first !== 'temporary') return first
    const second = await this.refreshOnce()
    return second === 'throttled' ? 'temporary' : second
  }

  private async refreshOnce(): Promise<'ok' | 'invalid' | 'temporary' | 'throttled'> {
    try {
      const result = await this.deps.transport.refresh()
      const claims = readAccessTokenClaims(result.accessToken)
      this.accessToken = {
        token: result.accessToken,
        expiresAtMs: claims.expiresAtMs,
        userUuid: claims.userUuid,
      }
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'auth') return 'invalid'
      if (error instanceof ApiError && error.kind === 'rate-limited') return 'throttled'
      if (error instanceof ApiError && (error.kind === 'network' || error.kind === 'server')) {
        return 'temporary'
      }
      throw error
    }
  }

  // ---------- 登录 / 退出 ----------

  /** 登录凭据错误等 ApiError 原样上抛，由表单分类展示；不触发续期 */
  async login(username: string, password: string): Promise<void> {
    await this.deps.lock.runExclusive(async () => {
      const result = await this.deps.transport.login({ username, password })
      const claims = readAccessTokenClaims(result.accessToken)
      const previous = this.identity
      const epoch = this.deps.storage.readEpoch() + 1
      this.deps.storage.writeEpoch(epoch)
      this.deps.storage.writeUsername(result.username)
      this.memoryEpoch = epoch
      this.accessToken = {
        token: result.accessToken,
        expiresAtMs: claims.expiresAtMs,
        userUuid: claims.userUuid,
      }
      // 换账号与本人重新登录都建立新隔离边界，清理旧账号缓存；草稿按 UUID 隔离保留
      if (previous) this.deps.onAccountCacheReset?.(previous.userUuid)
      this.setState({
        status: 'authenticated',
        identity: {
          username: result.username,
          userUuid: claims.userUuid,
          sessionId: this.deps.newSessionId(),
        },
        issue: null,
      })
      this.deps.channel.post({ type: 'login', epoch })
    })
  }

  /**
   * 主动退出：锁内等待在途刷新结束后调用真实接口。
   * 204 → 清本地身份、持久用户名、账号缓存与该账号草稿，广播同步；
   * 网络故障/500 → 上抛错误，不宣称退出完成，本地状态不变。
   */
  async logout(): Promise<void> {
    const identity = this.identity
    if (!identity) return
    await this.deps.lock.runExclusive(async () => {
      await this.deps.transport.logout()
      const epoch = this.deps.storage.readEpoch() + 1
      this.deps.storage.writeEpoch(epoch)
      this.deps.storage.clearUsername()
      this.memoryEpoch = epoch
      this.clearLocalSession()
      this.setState({ status: 'guest', identity: null, issue: null })
      this.deps.channel.post({ type: 'logout', epoch })
      this.deps.onAccountCacheReset?.(identity.userUuid)
      this.deps.onAccountDraftsClear?.(identity.userUuid)
    })
  }

  // ---------- 跨标签页同步 ----------

  handleSyncMessage(message: AuthSyncMessage): void {
    switch (message.type) {
      case 'logout': {
        if (message.epoch <= this.memoryEpoch) return
        const identity = this.identity
        this.memoryEpoch = message.epoch
        this.clearLocalSession()
        this.setState({ status: 'guest', identity: null, issue: null })
        if (identity) {
          this.deps.onAccountCacheReset?.(identity.userUuid)
          this.deps.onAccountDraftsClear?.(identity.userUuid)
        }
        return
      }
      case 'login': {
        if (message.epoch <= this.memoryEpoch) return
        const previous = this.identity
        this.memoryEpoch = message.epoch
        this.clearLocalSession()
        if (previous) this.deps.onAccountCacheReset?.(previous.userUuid)
        this.restorePromise = null
        this.setState({ status: 'unknown', identity: null, issue: null })
        void this.restore()
        return
      }
      case 'expired': {
        // 仅当浏览器会话未再变化时采纳其他标签页的最终失效结论
        if (message.epoch !== this.memoryEpoch || !this.identity) return
        if (this.deps.storage.readEpoch() !== this.memoryEpoch) return
        this.finalizeExpired(false)
      }
    }
  }

  /** 最终失效：清身份与账号缓存、保留草稿；阅读页留在原处 */
  private finalizeExpired(broadcast: boolean): void {
    const identity = this.identity
    if (!identity) return
    this.clearLocalSession()
    this.deps.storage.clearUsername()
    this.setState({ status: 'guest', identity: null, issue: null })
    this.deps.onAccountCacheReset?.(identity.userUuid)
    if (broadcast) this.deps.channel.post({ type: 'expired', epoch: this.memoryEpoch })
  }

  // ---------- 受保护操作 ----------

  /** 休眠标签页恢复操作前核对代次：浏览器会话已变化则丢弃本地状态并重新恢复 */
  private async ensureFreshEpoch(): Promise<void> {
    const persisted = this.deps.storage.readEpoch()
    if (persisted === this.memoryEpoch) return
    const previous = this.identity
    this.memoryEpoch = persisted
    this.clearLocalSession()
    if (previous) this.deps.onAccountCacheReset?.(previous.userUuid)
    this.restorePromise = null
    this.setState({ status: 'unknown', identity: null, issue: null })
    await this.restore()
  }

  /**
   * 获取可用访问令牌：到期先续期（写操作尚未发出时的合法首发路径）。
   * AuthRequiredError：确定的未登录或会话最终失效；
   * RenewUnavailableError：临时续期故障，保留会话与输入。
   */
  async getValidAccessToken(): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.ensureFreshEpoch()
      const identity = this.identity
      if (!identity) throw new AuthRequiredError()
      if (
        this.accessToken &&
        isAccessTokenFresh(this.accessToken.expiresAtMs, this.deps.now())
      ) {
        return this.accessToken.token
      }
      const outcome = await this.renew()
      if (outcome === 'ok') {
        if (this.identity?.sessionId !== identity.sessionId) continue
        return this.accessToken!.token
      }
      if (outcome === 'stale') continue
      if (outcome === 'temporary') {
        this.setState({ issue: 'renew-unavailable' })
        throw new RenewUnavailableError()
      }
      this.finalizeExpired(true)
      throw new AuthRequiredError('登录已失效，请重新登录')
    }
    throw new AuthRequiredError()
  }

  /**
   * 受保护请求接缝：
   * - 写：令牌到期先续期再首次发送；已发出的写收到鉴权错误不重放，错误上抛由用户重新提交。
   * - 读：收到 401 续期一次后重发一次（读重发安全）；仍失败上抛原错误。
   */
  async runProtected<T>(
    fn: (accessToken: string) => Promise<T>,
    kind: 'read' | 'write',
  ): Promise<T> {
    const token = await this.getValidAccessToken()
    const epoch = this.memoryEpoch
    const sessionId = this.identity?.sessionId
    try {
      return await fn(token)
    } catch (error) {
      if (!(error instanceof ApiError) || error.kind !== 'auth' || kind === 'write') {
        throw error
      }
      if (this.memoryEpoch !== epoch || this.identity?.sessionId !== sessionId) {
        throw error // 会话已变化：迟到的鉴权错误不触发续期与重发
      }
      const outcome = await this.renew()
      if (
        outcome === 'ok' &&
        this.memoryEpoch === epoch &&
        this.identity?.sessionId === sessionId
      ) {
        return fn(this.accessToken!.token)
      }
      if (outcome === 'invalid') this.finalizeExpired(true)
      if (outcome === 'temporary') this.setState({ issue: 'renew-unavailable' })
      throw error
    }
  }
}
