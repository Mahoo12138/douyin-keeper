import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const productionServices = [
  'postgres',
  'redis',
  'migrate',
  'backend',
  'scheduler',
  'worker-interactive',
  'worker-browser',
  'worker-light',
]

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator < 1) throw new Error(`invalid env line: ${line}`)
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

export function assertEnvTemplatesSynchronized(rootTemplate, deployTemplate) {
  const rootValues = parseEnv(rootTemplate)
  const deployValues = parseEnv(deployTemplate)
  const rootKeys = Object.keys(rootValues).sort()
  const deployKeys = Object.keys(deployValues).sort()
  if (JSON.stringify(rootKeys) !== JSON.stringify(deployKeys)) {
    throw new Error('root .env.example and deploy/.env.example have different keys')
  }
  for (const key of rootKeys) {
    if (rootValues[key] !== deployValues[key]) {
      throw new Error(`env template value differs for ${key}`)
    }
  }
}

export function assertRuntimeEnvContract(rootTemplate) {
  const values = parseEnv(rootTemplate)
  const requiredRuntimeKeys = [
    'PROTOCOL_SIDECAR_COMMAND',
    'PROTOCOL_SIDECAR_BUNDLE_DIR',
    'WORKER_BROWSER_CONCURRENCY',
    'MAX_GLOBAL_BROWSERS',
    'BROWSER_SEMAPHORE_TTL',
    'OUTBOX_BATCH_SIZE',
    'OUTBOX_POLL_INTERVAL',
    'SCHEDULE_BATCH_SIZE',
    'SCHEDULE_INTERVAL',
  ]
  for (const key of requiredRuntimeKeys) {
    if (!(key in values)) throw new Error(`env template is missing runtime key ${key}`)
  }
}

export function assertProductionComposeContract(composeText) {
  for (const service of productionServices) {
    if (!new RegExp(`^  ${service}:$`, 'm').test(composeText)) {
      throw new Error(`production Compose is missing service ${service}`)
    }
  }
  if (!composeText.includes('env_file: ../../.env')) {
    throw new Error('production Compose must load the repository root .env')
  }
  if (!composeText.includes('keeper-internal')) {
    throw new Error('production Compose must use the internal keeper network')
  }
  const publishedPorts = [...composeText.matchAll(/^\s+ports:\n((?:\s+- .*\n)+)/gm)]
    .map(([, block]) => block)
  if (publishedPorts.length !== 1 || !publishedPorts[0].includes('KEEPER_HTTP_PORT')) {
    throw new Error('only backend may publish the configurable HTTP port')
  }
}

export function assertDockerfileContract(backendDockerfile, workerDockerfile) {
  const backendRequirements = [
    'FROM node:alpine AS frontend',
    'pnpm --filter @douyin-keeper/web build',
    'COPY --from=frontend /src/apps/web/dist ./backend/internal/transport/webassets/dist/web',
    'go build -trimpath -o /out/backend ./cmd/api',
    'USER keeper',
  ]
  const workerRequirements = [
    'COPY sidecars/playwright-node ./sidecars/playwright-node',
    'npx playwright install --with-deps chromium',
    '/app/scheduler',
    '/app/worker-interactive',
    '/app/worker-browser',
    '/app/worker-light',
    'USER node',
  ]
  for (const requirement of backendRequirements) {
    if (!backendDockerfile.includes(requirement)) throw new Error(`backend Dockerfile missing: ${requirement}`)
  }
  for (const requirement of workerRequirements) {
    if (!workerDockerfile.includes(requirement)) throw new Error(`worker Dockerfile missing: ${requirement}`)
  }
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else if (code !== 0) reject(new Error(`${command} exited with status ${code}`))
      else resolveRun()
    })
  })
}

export async function validateDeployment({ checkDocker = true, projectRoot = rootDir } = {}) {
  const [rootEnv, deployEnv, compose, devCompose, backendDockerfile, workerDockerfile] = await Promise.all([
    readFile(join(projectRoot, '.env.example'), 'utf8'),
    readFile(join(projectRoot, 'deploy/.env.example'), 'utf8'),
    readFile(join(projectRoot, 'deploy/compose/docker-compose.yml'), 'utf8'),
    readFile(join(projectRoot, 'deploy/compose/docker-compose.dev.yml'), 'utf8'),
    readFile(join(projectRoot, 'deploy/docker/backend.Dockerfile'), 'utf8'),
    readFile(join(projectRoot, 'deploy/docker/worker.Dockerfile'), 'utf8'),
  ])
  assertEnvTemplatesSynchronized(rootEnv, deployEnv)
  assertRuntimeEnvContract(rootEnv)
  assertProductionComposeContract(compose)
  assertDockerfileContract(backendDockerfile, workerDockerfile)

  if (!checkDocker) return

  const tempRoot = await mkdtemp(join(tmpdir(), 'douyin-keeper-deployment-'))
  try {
    const tempComposeDir = join(tempRoot, 'deploy/compose')
    await mkdir(tempComposeDir, { recursive: true })
    await cp(join(projectRoot, 'deploy/compose/docker-compose.yml'), join(tempComposeDir, 'docker-compose.yml'))
    await writeFile(join(tempRoot, '.env'), rootEnv)
    await run('docker', ['compose', '-f', join(projectRoot, 'deploy/compose/docker-compose.dev.yml'), 'config', '--quiet'], {
      cwd: projectRoot,
    })
    await run('docker', [
      'compose',
      '--env-file',
      join(tempRoot, '.env'),
      '-f',
      join(tempComposeDir, 'docker-compose.yml'),
      'config',
      '--quiet',
    ], { cwd: tempRoot })
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await validateDeployment()
    console.log('deployment contract: ok')
  } catch (error) {
    console.error(`deployment contract: ${error.message}`)
    process.exitCode = 1
  }
}
