import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="py-10 text-center">
      <h1 className="page-title">页面不存在</h1>
      <p className="mt-2 text-sm text-muted">访问的地址没有对应的内容。</p>
      <Link
        to="/"
        className="text-link mt-4 inline-flex min-h-11 items-center text-sm"
      >
        返回首页
      </Link>
    </section>
  )
}
