import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'backend/internal/transport/webassets/dist')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(resolve(root, 'apps/web/dist'), resolve(target, 'web'), { recursive: true })
await cp(resolve(root, 'apps/admin/dist'), resolve(target, 'admin'), { recursive: true })

console.log(`staged SPA assets in ${target}`)
