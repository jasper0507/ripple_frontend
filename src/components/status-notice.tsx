import { Link } from 'react-router'
import { FileQuestion } from 'lucide-react'

export function StatusNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="py-10">
      <FileQuestion aria-hidden className="mb-5 size-9 text-primary" />
      <h1 className="page-title">{title}</h1>
      <p className="mt-2 text-sm text-muted">{detail}</p>
      <Link to="/" className="text-link mt-4 inline-flex min-h-11 items-center text-sm">
        返回首页
      </Link>
    </section>
  )
}
