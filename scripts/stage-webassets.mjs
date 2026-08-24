import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'backend/internal/transport/webassets/dist')
const generatedWeb = resolve(target, 'web')

await rm(generatedWeb, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(resolve(root, 'apps/web/dist'), generatedWeb, { recursive: true })

console.log(`staged unified SPA assets in ${target}/web`)
