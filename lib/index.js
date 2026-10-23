import { randomUUID } from 'node:crypto'

export const name = 'subagent-output-sanitizer'
export const inject = ['sessionQuery']

const SUBAGENT_MESSAGE_KINDS = new Set(['subagent-report', 'subagent-settled'])

/** Whether a parent-facing message originates from a child-agent delivery channel. */
export function isSubagentDelivery(message) {
  return SUBAGENT_MESSAGE_KINDS.has(message.source?.kind)
}

/** Extract the useful report text from a child report tool call. */
export function reportText(argumentsText) {
  try {
    const value = JSON.parse(argumentsText)
    if (typeof value?.output === 'string' && value.output.length > 0) return value.output
  } catch {
    // Keep the original arguments below when the child emitted malformed JSON.
  }
  return argumentsText.length > 0 ? argumentsText : '(no report text)'
}

/** Turn one child-only content block into safe parent-visible text. */
export function textForSubagentBlock(block) {
  switch (block.type) {
    case 'text':
      return block.text
    case 'tool-call':
      return block.name === 'report'
        ? `[Child report]\n${reportText(block.arguments)}`
        : `[Child tool request: ${block.name}]\n${block.arguments}`
    case 'tool-result': {
      const text = block.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n')
      return `[Child tool result]\n${text || '(no text result)'}`
    }
    case 'reasoning':
      return '[Child reasoning omitted from parent context]'
    case 'image':
      return '[Child image omitted from parent context]'
    default:
      return '[Unsupported child output omitted from parent context]'
  }
}

/** Replace child-delivery tool blocks with durable parent-facing text. */
export function sanitizeSubagentMessage(message) {
  if (!isSubagentDelivery(message) || message.content.every(block => block.type === 'text')) return message
  return {
    ...message,
    id: `private-subagent-output-${randomUUID()}`,
    content: message.content.map(block => ({ type: 'text', text: textForSubagentBlock(block) })),
  }
}

/** Replace already-recorded unsafe child deliveries in the current model-visible surface. */
export async function repairSubagentSurface(session, sessionQuery) {
  const observed = await sessionQuery.readSurface(session.id)
  const visible = new Set(session.surface.nodes)
  let repaired = 0
  for (const event of observed.events) {
    const seq = event.seq
    if (event?.type !== 'user/message') continue
    // An asynchronous read must not restore a node replaced while it was pending.
    if (!visible.has(seq)) continue
    const message = sanitizeSubagentMessage(event.data)
    if (message === event.data) continue
    session.append('user/message', message, {
      surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq },
      sourceEventSeqs: [seq],
    })
    repaired += 1
  }
  return repaired
}

/** Keep parent subagent reports provider-safe without modifying official continuation code. */
export function apply(ctx) {
  ctx.on('agent/created', async ({ agent }) => {
    await repairSubagentSurface(agent.session, ctx.sessionQuery)
  })
  ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const messages = decision.messages.map(sanitizeSubagentMessage)
    return messages.every((message, index) => message === decision.messages[index])
      ? decision
      : { ...decision, messages }
  })
}
