import { Link, Outlet, useLocation } from 'react-router'
import { safeRedirectTarget } from '@/lib/validation'

// 登录/注册使用的独立简洁布局
export function AuthLayout() {
  const location = useLocation()
  const state = location.state as { from?: unknown; listFrom?: unknown } | null
  const from = safeRedirectTarget(state?.from)
  const listFrom = safeRedirectTarget(state?.listFrom)
  const back = from === '/posts/new' ? listFrom ?? '/' : from && from !== '/login' && from !== '/register' ? from : '/'
  return (
    <div className="font-sans bg-background text-foreground flex min-h-svh flex-col items-center justify-center px-4 py-10 md:py-16">
      <div className="auth-shell">
        <header className="mb-6 text-center">
          <Link to="/" className="brand" aria-label="Bluebell 首页">
            <span className="invisible" aria-hidden="true">Bluebell</span>
            <img className="brand-wordmark" src="/wordmark.svg" alt="" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-sm text-muted">按社区组织的讨论平台</p>
        </header>
        <main id="main-content" tabIndex={-1} className="auth-main">
          <Outlet />
        </main>
        <p className="mt-6 text-center text-sm"><Link to={back} state={listFrom ? { from: listFrom } : undefined} className="text-link inline-flex min-h-11 items-center">{back.startsWith('/posts/') ? '返回帖子' : '返回帖子列表'}</Link></p>
      </div>
    </div>
  )
}
