import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

// 路由错误边界：区分可预期的路由响应错误与未处理异常
export function RouteErrorPage() {
  const error = useRouteError()

  let title = '页面出错了'
  let detail = '发生未预期的错误，请稍后重试。'
  if (isRouteErrorResponse(error)) {
    title = `${error.status}`
    detail = error.statusText || detail
  } else if (error instanceof Error) {
    detail = error.message
  }

  return (
    <section className="mx-auto max-w-[760px] px-4 py-16 text-center">
      <h1 className="page-title">{title}</h1>
      <p className="mt-2 text-sm text-muted">{detail}</p>
      <Link
        to="/"
        className="text-link mt-4 inline-flex min-h-11 items-center text-sm"
      >
        返回首页
      </Link>
    </section>
  )
}
