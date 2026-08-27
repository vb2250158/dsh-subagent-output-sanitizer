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

test('repairs an unsafe delivery already visible in a session', () => {
  const appended = []
  const session = {
    surface: { nodes: [4] },
    events: [undefined, undefined, undefined, undefined, { type: 'user/message', data: unsafeMessage }],
    append(type, data, options) { appended.push({ type, data, options }) },
  }
  assert.equal(repairSubagentSurface(session), 1)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].type, 'user/message')
  assert.deepEqual(appended[0].options, {
    surfaceOp: { op: 'replace', start: 4, end: 4 },
    sourceEventSeqs: [4],
  })
  assert.ok(appended[0].data.content.every(block => block.type === 'text'))
})

test('registers public lifecycle and pre-step extensions', async () => {
  const listeners = []
  const ctx = { on(name, listener) { listeners.push({ name, listener }); return () => {} } }
  apply(ctx)
  assert.deepEqual(listeners.map(listener => listener.name), ['agent/session-start', 'agent/pre-step'])
  const preStep = listeners.find(listener => listener.name === 'agent/pre-step').listener
  const decision = await preStep({}, async () => ({ kind: 'enter', messages: [unsafeMessage] }))
  assert.ok(decision.messages[0].content.every(block => block.type === 'text'))
})
