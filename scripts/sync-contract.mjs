#!/usr/bin/env node
// 显式同步契约：从后端 openapi.yaml 复制快照并重新生成类型。
// 用法：pnpm contract:sync [后端 openapi.yaml 路径]
// 同步后请核对 SHA256、审阅 src/api/types.ts 差异，并更新 openapi/README.md 的来源记录。
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = resolve(
  process.argv[2] ?? join(root, '..', 'bluebell_backend', 'docs', 'openapi.yaml'),
)
if (!existsSync(source)) {
  console.error(`找不到契约来源：${source}`)
  process.exit(1)
}

const snapshot = join(root, 'openapi', 'openapi.yaml')
copyFileSync(source, snapshot)

const sha256 = createHash('sha256').update(readFileSync(snapshot)).digest('hex')

const bin = join(root, 'node_modules', '.bin', 'openapi-typescript')
execFileSync(bin, [snapshot, '-o', join(root, 'src', 'api', 'types.ts')], {
  stdio: 'inherit',
})

console.log(`已同步：${source}`)
console.log(`快照 SHA256：${sha256}`)
console.log('请记录后端来源提交，并更新 openapi/README.md 中的提交、SHA256 与日期。')
