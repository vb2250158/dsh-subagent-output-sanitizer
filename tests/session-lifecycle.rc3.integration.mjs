// DSH_SOURCE_ROOT names the rc.3 source checkout whose lifecycle and query service are exercised.
import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as sanitizer from '../lib/index.js'

const root = process.env.DSH_SOURCE_ROOT
if (!root) throw new Error('DSH_SOURCE_ROOT must name the rc.3 source checkout.')
await mkdir('.tmp-tests', { recursive: true })
const output = resolve('.tmp-tests/lifecycle-rc3.mjs')
await build({ stdin: { contents: `export { Context } from '@deepseek-ai/cordis'; export { default as SessionStore } from '@deepseek-ai/dsh-session'; export { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: output, tsconfig: resolve(root, 'tsconfig.base.json'), bundle: true, platform: 'node', format: 'esm', target: 'es2022' })
const { Context, SessionStore, SessionQueryEngine } = await import(pathToFileURL(output))

test('real rc.3 agent creation repairs logged child deliveries after session announcement and remains idempotent', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SessionStore)
    // Concrete exact-read methods are independent of the full-text backend.
    class ExactQuery extends SessionQueryEngine {}
    await ctx.plugin(ExactQuery)
    await ctx.plugin(sanitizer)
    let announced = false
    ctx.on('session/created', session => {
      announced = true
      assert.throws(() => session.append('user/message', {}), /creat|announc|read.only/i)
    })
    const session = ctx.sessions.create('sanitizer-lifecycle')
    assert.equal(announced, true)
    const unsafe = { id: 'original', role: 'user', source: { kind: 'subagent-settled', form: 'notice', summary: 'child' }, content: [{ type: 'tool-call', id: 'report', name: 'report', arguments: '{"output":"finished"}' }] }
    session.append('user/message', unsafe, { surfaceOp: 'append' })
    const before = session.seq
    await ctx.serial('agent/created', { agent: { session } })
    assert.equal(session.seq, before + 1)
    assert.deepEqual(session.deriveMessages()[0].content, [{ type: 'text', text: '[Child report]\nfinished' }])
    const surface = await ctx.sessionQuery.readSurface(session.id)
    assert.equal(surface.events.length, 1)
    assert.deepEqual(surface.events[0].sourceEventSeqs, [before - 1])
    await ctx.serial('agent/created', { agent: { session } })
    assert.equal(session.seq, before + 1)
  } finally {
    await ctx.fiber.dispose()
  }
})
