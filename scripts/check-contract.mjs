#!/usr/bin/env node
// 契约一致性检查：从仓库快照重新生成类型到临时目录，与已提交类型比较。
// 只读取本仓库快照与本地锁定版本的 openapi-typescript，不访问后端目录或网络契约。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const snapshot = join(root, 'openapi', 'openapi.yaml')
const committed = join(root, 'src', 'api', 'types.ts')
const bin = join(root, 'node_modules', '.bin', 'openapi-typescript')

const outDir = mkdtempSync(join(tmpdir(), 'bluebell-contract-'))
const generated = join(outDir, 'types.ts')
try {
  execFileSync(bin, [snapshot, '-o', generated], { stdio: 'inherit' })
  const a = readFileSync(committed, 'utf8')
  const b = readFileSync(generated, 'utf8')
  if (a !== b) {
    console.error(
      '契约一致性检查失败：src/api/types.ts 与 openapi/openapi.yaml 的生成结果不一致。\n' +
        '请运行 pnpm contract:sync 显式同步并审阅差异。',
    )
    process.exit(1)
  }
  console.log('契约一致性检查通过：生成类型与快照一致。')
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
