import { createBrowserRouter } from 'react-router'
import { AuthLayout } from './layouts/auth-layout'
import { ContentLayout } from './layouts/content-layout'
import { RequireAuth } from './session'
import { CommunityPage } from '@/pages/community-page'
import { HomePage } from '@/pages/home-page'
import { LoginPage } from '@/pages/login-page'
import { NewPostPage } from '@/pages/new-post-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { RegisterPage } from '@/pages/register-page'
import { RouteErrorPage } from '@/pages/route-error-page'

// React Router Data Mode：路由负责匹配、布局、访问控制与错误边界，
// 不使用 loader 预取业务数据；页面通过 TanStack Query 加载。
export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ContentLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/communities/:communityId', element: <CommunityPage /> },
      { path: '/posts/new', element: (
          <RequireAuth>
            <NewPostPage />
          </RequireAuth>
        ),
      },
      {
        path: '/posts/:postId',
        // 正文的 Markdown 解析依赖随详情页加载，不进入首页包。
        lazy: async () => ({ Component: (await import('@/pages/post-page')).PostPage }),
        hydrateFallbackElement: (
          <p role="status" className="py-10 text-sm text-muted">正在加载帖子页面…</p>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
