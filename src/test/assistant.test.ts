import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ed from '../store/editor';
import { createDeck } from '../model/factory';
import { runAssistant, setApiKey, undoAssistant, useAssistant } from '../ai/assistant';

function sse(events: object[]): Response {
  const body = events.map(e => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}

const start = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } };
const toolTurn = (name: string, input: object) => sse([
  start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
]);
const textTurn = (text: string) => sse([
  start,
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: 'message_stop' },
]);

describe('AI assistant loop', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    ed.loadDeck(createDeck(), { resetHistory: true });
    setApiKey('sk-ant-test');
    useAssistant.setState({ items: [], running: false, undoMark: null });
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('runs tools against the deck and reports back, as one undo step', async () => {
    const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const replies = [
      toolTurn('add_slides', { markdown: '# Results\n- Revenue up 12%\n- Churn down\n\n---\n\n# Next steps\n## Q4 plan', after: 1 }),
      toolTurn('set_notes', { slide: 2, notes: 'Lead with revenue.' }),
      textTurn('Added two slides with notes.'),
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return replies.shift()!;
    }) as typeof fetch;

    const depth = ed.useEditor.getState().past.length;
    await runAssistant('Add a results slide and a next-steps slide');

    const deck = ed.useEditor.getState().deck;
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1].notes).toBe('Lead with revenue.');
    expect(ed.useEditor.getState().past.length).toBe(depth + 1);

    const items = useAssistant.getState().items;
    expect(items.map(i => i.kind)).toEqual(['user', 'activity', 'activity', 'assistant']);
    expect(items[3].text).toBe('Added two slides with notes.');

    // Request shape: model, effort, server-side fallback, cached system prompt, tools
    const first = requests[0];
    expect(first.url).toContain('/v1/messages');
    expect(first.body.model).toBe('claude-opus-5-5');
    expect(first.body.output_config).toEqual({ effort: 'medium' });
    expect(first.body.fallbacks).toBe('default');
    expect(first.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(first.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect((first.body.system as { cache_control?: object }[])[0].cache_control).toEqual({ type: 'ephemeral' });
    expect((first.body.tools as { name: string }[]).map(t => t.name)).toContain('replace_slide');
    expect(requests).toHaveLength(3);

    undoAssistant();
    expect(ed.useEditor.getState().deck.slides).toHaveLength(1);
  });

  it('turns API errors into a readable message', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await runAssistant('Hello');
    const last = useAssistant.getState().items.at(-1)!;
    expect(last.kind).toBe('error');
    expect(last.text).toMatch(/API key was rejected/);
    expect(useAssistant.getState().running).toBe(false);
  });
});
