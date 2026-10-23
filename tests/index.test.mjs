import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apply,
  repairSubagentSurface,
  reportText,
  sanitizeSubagentMessage,
  textForSubagentBlock,
} from '../lib/index.js'

const settledSource = {
  kind: 'subagent-settled',
  form: 'notice',
  summary: 'Child finished.',
  senderSessionId: 'child-1',
}

const unsafeMessage = {
  id: 'original-message',
  role: 'user',
  source: settledSource,
  content: [
    { type: 'text', text: 'Its closing message:' },
    { type: 'tool-call', id: 'call-report', name: 'report', arguments: '{"output":"completed safely"}' },
  ],
}

test('extracts report output and preserves malformed arguments as text', () => {
  assert.equal(reportText('{"output":"done"}'), 'done')
  assert.equal(reportText('{bad json'), '{bad json')
})

test('turns child-only tool blocks into plain parent text', () => {
  assert.equal(textForSubagentBlock(unsafeMessage.content[1]), '[Child report]\ncompleted safely')
  assert.equal(textForSubagentBlock({ type: 'tool-result', content: [{ type: 'text', text: 'ok' }] }), '[Child tool result]\nok')
})

test('sanitizes only subagent delivery messages with non-text content', () => {
  const sanitized = sanitizeSubagentMessage(unsafeMessage)
  assert.notEqual(sanitized, unsafeMessage)
  assert.notEqual(sanitized.id, unsafeMessage.id)
  assert.deepEqual(sanitized.content, [
    { type: 'text', text: 'Its closing message:' },
    { type: 'text', text: '[Child report]\ncompleted safely' },
  ])
  const ordinaryMessage = { ...unsafeMessage, source: { kind: 'user' } }
  assert.equal(sanitizeSubagentMessage(ordinaryMessage), ordinaryMessage)
})

test('repairs an unsafe delivery already visible in a session', async () => {
  const appended = []
  const session = {
    surface: { nodes: [4] },
    id: 'fixture-session',
    append(type, data, options) { appended.push({ type, data, options }) },
  }
  const query = { readSurface: async id => {
    assert.equal(id, session.id)
    return { events: [{ seq: 4, type: 'user/message', data: unsafeMessage }] }
  } }
  assert.equal(await repairSubagentSurface(session, query), 1)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].type, 'user/message')
  assert.deepEqual(appended[0].options, {
    surfaceOp: { op: 'replace', startSeq: 4, endSeq: 4 },
    sourceEventSeqs: [4],
  })
  assert.ok(appended[0].data.content.every(block => block.type === 'text'))
})

test('registers public lifecycle and pre-step extensions', async () => {
  const listeners = []
  const ctx = { on(name, listener) { listeners.push({ name, listener }); return () => {} } }
  apply(ctx)
  assert.deepEqual(listeners.map(listener => listener.name), ['agent/created', 'agent/pre-step'])
  const preStep = listeners.find(listener => listener.name === 'agent/pre-step').listener
  const decision = await preStep({}, async () => ({ kind: 'enter', messages: [unsafeMessage] }))
  assert.ok(decision.messages[0].content.every(block => block.type === 'text'))
})

test('does not restore nodes replaced during a pending surface read or write after a failed read', async () => {
  const session = { id: 'fixture', surface: { nodes: [4] }, append() { assert.fail('must not append') } }
  let release
  const pending = repairSubagentSurface(session, { readSurface: () => new Promise(resolve => { release = resolve }) })
  session.surface.nodes = [5]
  release({ events: [{ seq: 4, type: 'user/message', data: unsafeMessage }] })
  assert.equal(await pending, 0)
  await assert.rejects(repairSubagentSurface(session, { readSurface: async () => { throw new Error('read failed') } }), /read failed/)
})
