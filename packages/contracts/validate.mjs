// Contract checks (docs/11 §15): parses the OpenAPI document and validates the
// sidecar JSON Schema against its own $schema meta-schema.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import YAML from 'yaml'
import Ajv2020 from 'ajv/dist/2020.js'

const here = dirname(fileURLToPath(import.meta.url))
let failures = 0

function check(name, fn) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (err) {
    failures++
    console.error(`FAIL ${name}: ${err.message}`)
  }
}

check('openapi.yaml parses + has /api/v1 security', () => {
  const doc = YAML.parse(readFileSync(join(here, 'openapi.yaml'), 'utf8'))
  if (doc.openapi !== '3.1.0') throw new Error('not OpenAPI 3.1.0')
  if (doc.info.title !== 'Douyin Keeper Next API') throw new Error('wrong title')
  if (!doc.paths['/auth/login'] || !doc.paths['/entitlements/redeem']) {
    throw new Error('missing frozen MVP endpoints')
  }
  if (!doc.components?.securitySchemes?.bearerAuth) throw new Error('missing bearerAuth')
})

check('sidecar schema is valid JSON Schema draft-2020-12', () => {
  const schema = JSON.parse(readFileSync(join(here, 'sidecar', 'v1.schema.json'), 'utf8'))
  const validate = new Ajv2020({ strict: false }).compile(schema)
  const ops = schema.$defs.request.properties.op.enum
  if (!ops.includes('health.check') || !ops.includes('message.send_text')) {
    throw new Error('missing frozen sidecar ops')
  }
  const validFirstMessage = {
    protocol_version: 1,
    request_id: 'contract-test',
    op: 'message.send_first',
    deadline_ms: 30000,
    input: {
      session: {kind: 'playwright_storage_state_file', path: '/run/session.json'},
      target: {platform_user_id: 'user-1'},
      message: {text: 'hello'},
    },
  }
  if (!validate(validFirstMessage)) throw new Error('valid message.send_first input rejected')
  const invalidFirstMessage = structuredClone(validFirstMessage)
  invalidFirstMessage.input.target.platform_conversation_id = 'conversation-1'
  if (validate(invalidFirstMessage)) throw new Error('message.send_first accepted conversation target')
})

check('every sidecar schema file parses', () => {
  for (const f of readdirSync(join(here, 'sidecar'))) {
    if (f.endsWith('.json')) JSON.parse(readFileSync(join(here, 'sidecar', f), 'utf8'))
  }
})

process.exit(failures === 0 ? 0 : 1)
