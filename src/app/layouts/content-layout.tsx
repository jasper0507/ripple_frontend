import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { LogOut, Menu, SquarePen, X } from 'lucide-react'
import { ApiError, RATE_LIMITED_MESSAGE } from '@/api/errors'
import { useAuthActions, useSession } from '@/app/session'
import { CommunityNav } from '@/components/community-nav'
import { ForumSidebar } from '@/components/forum-sidebar'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { safeRedirectTarget } from '@/lib/validation'
import {
  markListPreserve,
  postListMemory,
  postListSourceFromLocation,
  postListTargetFromPath,
  postListViewKey,
} from '@/lib/post-list'

// 内容布局：首页、社区页、帖子详情与发帖页共用。
// 布局本身不统一要求登录；发帖页与需登录的操作分别检查会话。
// 列表顶部放发布入口，右侧放最热帖子；详情和发帖采用单列阅读，窄屏使用模态菜单。

function AccountEntry() {
  const session = useSession()
  const actions = useAuthActions()
  const location = useLocation()
  const authState = {
    from: location.pathname + location.search,
    listFrom: safeRedirectTarget((location.state as { from?: unknown } | null)?.from) ?? undefined,
  }
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  function preserveList() {
    const target = postListTargetFromPath(authState.from)
    if (target) markListPreserve(postListMemory, postListViewKey(target.communityId, target.order), window.scrollY)
  }

  if (session.status === 'unknown') {
    return <span className="text-sm text-muted">正在确认登录状态…</span>
  }

  if (session.status !== 'authenticated') {
    return (
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-3 text-sm">
          <Button asChild variant="outline" size="sm"><Link to="/login" state={authState} onClick={preserveList}>登录</Link></Button>
          <Link to="/register" state={authState} onClick={preserveList} className="inline-flex min-h-11 items-center px-2 text-foreground hover:text-primary">
            注册
          </Link>
        </span>
        {/* 临时续期故障不是确定的未登录：提示但不冒充已退出 */}
        {session.issue === 'renew-unavailable' ? (
          <span className="text-xs text-muted">
            暂时无法确认登录状态，
            <button
              type="button"
              onClick={() => void actions.retryRestore()}
              className="bg-transparent transition-all duration-150 underline underline-offset-2 hover:text-foreground"
            >
              重试
            </button>
          </span>
        ) : null}
      </span>
    )
  }

  async function onLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await actions.logout()
    } catch (error) {
      // 网络、服务器或限流失败：服务端退出未完成，保留会话并允许重试
      setLogoutError(
        error instanceof ApiError && error.kind === 'rate-limited'
          ? `退出未完成，${RATE_LIMITED_MESSAGE}`
          : '退出未完成，请重试',
      )
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-3 text-sm">
        <span className="max-w-40 truncate" title={session.identity?.username ?? undefined}>
          {session.identity?.username ?? '已登录'}
        </span>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          aria-label="退出登录"
          className="inline-flex min-h-11 items-center gap-2 bg-transparent transition-all duration-150 px-2 text-muted hover:text-foreground disabled:cursor-not-allowed"
        >
          <LogOut aria-hidden className="size-4" />
          {loggingOut ? '退出中…' : '退出'}
        </button>
      </span>
      {session.issue === 'renew-unavailable' ? (
        <span className="text-xs text-muted">暂时无法续期，操作前请稍后重试</span>
      ) : null}
      {logoutError ? (
        <span role="alert" className="text-xs text-danger">
          {logoutError}
        </span>
      ) : null}
    </span>
  )
}

function MobileMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const here = `${location.pathname}${location.search}`
  const publishFrom = postListSourceFromLocation(
    here,
    safeRedirectTarget((location.state as { from?: unknown } | null)?.from),
  )
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media.matches) setOpen(false) }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])
  return (
    <div className="lg:hidden">
      <Button type="button" variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Menu aria-hidden />菜单
      </Button>
      {open ? (
        <Modal sheet title="菜单" onClose={() => setOpen(false)}>
          <Button type="button" variant="ghost" size="icon" data-initial-focus aria-label="关闭菜单" className="absolute right-3 top-3" onClick={() => setOpen(false)}><X aria-hidden /></Button>
          <div className="menu-section">
            <Button asChild variant="outline" size="sm" className="bg-hover text-association font-normal hover:bg-line hover:text-foreground">
              <Link to="/posts/new" state={publishFrom ? { from: publishFrom } : undefined}
                onClick={() => {
                  const target = postListTargetFromPath(here)
                  if (target) markListPreserve(postListMemory, postListViewKey(target.communityId, target.order), window.scrollY)
                  setOpen(false)
                }}><SquarePen aria-hidden />发布帖子</Link>
            </Button>
          </div>
          <section className="menu-section" aria-labelledby="menu-communities">
            <h3 id="menu-communities" className="menu-heading">社区</h3>
            <CommunityNav className="menu-communities" onNavigate={() => setOpen(false)} />
          </section>
          <section className="menu-section" aria-labelledby="menu-account" onClick={(event) => { if ((event.target as HTMLElement).closest('a')) setOpen(false) }}>
            <h3 id="menu-account" className="menu-heading">账号</h3>
            <AccountEntry />
          </section>
        </Modal>
      ) : null}
    </div>
  )
}

export function ContentLayout() {
  const location = useLocation()
  const reading = /^\/posts\/[^/]+\/?$/.test(location.pathname)

  return (
    <div className="flex min-h-svh flex-col font-sans bg-background text-foreground">
      <a className="skip-link" href="#main-content">跳到内容</a>
      <header className="site-header">
        <div className="site-container header-inner">
          <Link to="/" className="brand" aria-label="Bluebell 首页">
            <span className="invisible" aria-hidden="true">Bluebell</span>
            <img className="brand-wordmark" src="/wordmark.svg" alt="" aria-hidden="true" />
          </Link>
          <CommunityNav className="header-communities hidden md:block" />
          <div className="header-actions">
            <div className="hidden lg:block"><AccountEntry /></div>
            <MobileMenu key={location.key} />
          </div>
        </div>
      </header>
      <div className={`site-container content-grid flex-1${reading ? ' content-grid-reading' : ''}`}>
        <main id="main-content" tabIndex={-1} className="reading-surface min-w-0 self-start">
          <Outlet />
        </main>
        {!reading ? <ForumSidebar /> : null}
      </div>
      <footer className="site-container"><div className="site-footer"><span>Bluebell</span><span>按社区组织的讨论平台</span></div></footer>
    </div>
  )
}
