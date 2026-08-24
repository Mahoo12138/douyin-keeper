import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { join } from 'node:path'
import {
  assertDockerfileContract,
  assertEnvTemplatesSynchronized,
  assertProductionComposeContract,
  rootDir,
  validateDeployment,
} from './validate-deployment.mjs'

test('deployment source files satisfy the frozen production contract', async () => {
  await validateDeployment({ checkDocker: false })
})

test('environment templates reject missing or changed keys', () => {
  assert.throws(
    () => assertEnvTemplatesSynchronized('A=1\nB=2\n', 'A=1\n'),
    /different keys/,
  )
  assert.throws(
    () => assertEnvTemplatesSynchronized('A=1\n', 'A=2\n'),
    /value differs for A/,
  )
})

test('production topology rejects an extra published port', async () => {
  const compose = await readFile(join(rootDir, 'deploy/compose/docker-compose.yml'), 'utf8')
  assert.throws(
    () => assertProductionComposeContract(`${compose}\n  extra:\n    ports:\n      - "9999:9999"\n`),
    /only backend may publish/,
  )
})

test('image contracts require embedded SPA and sidecar runtime', () => {
  assert.throws(
    () => assertDockerfileContract('FROM node:alpine AS frontend', 'FROM python:3.13-slim'),
    /backend Dockerfile missing/,
  )
})
