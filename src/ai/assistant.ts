/* ========================================================
   AI assistant: Claude edits the deck through tools.
   Runs in the browser with the user's own API key.
   ======================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import * as ed from '../store/editor';
import { useUi } from '../store/ui';
import { THEMES } from '../model/themes';
import { buildTools, describeDeck } from './tools';

export const MODEL = 'claude-opus-5-5';
const KEY_STORAGE = 'slidecraft-anthropic-key';

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'activity'; text: string }
  | { kind: 'error'; text: string };

interface AssistantState {
  apiKey: string;
  items: ChatItem[];
  running: boolean;
  /** Undo depth before the last run, so its changes can be reverted in one click */
  undoMark: number | null;
}

function loadKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) ?? ''; } catch { return ''; }
}

export const useAssistant = create<AssistantState>(() => ({ apiKey: loadKey(), items: [], running: false, undoMark: null }));

export function setApiKey(key: string) {
  const apiKey = key.trim();
  try { if (apiKey) localStorage.setItem(KEY_STORAGE, apiKey); else localStorage.removeItem(KEY_STORAGE); } catch { /* storage blocked */ }
  useAssistant.setState({ apiKey });
}

const push = (item: ChatItem) => useAssistant.setState(s => ({ items: [...s.items, item] }));
const appendText = (delta: string) => useAssistant.setState(s => {
  const items = [...s.items];
  const last = items[items.length - 1];
  if (last?.kind === 'assistant') items[items.length - 1] = { ...last, text: last.text + delta };
  else items.push({ kind: 'assistant', text: delta });
  return { items };
});

const SYSTEM = `You are the design assistant inside SlideCraft, a presentation editor. You change the user's deck by calling tools; the user sees every change live and can undo the whole run with one click.

How to work:
- Read the deck (get_deck or get_slides_markdown) before changing existing slides.
- Write slides in SlideCraft Markdown; layout is automatic, so don't position things by hand unless asked. Prefer replace_slide / add_slides / create_deck over many small update_object calls.
- Presentation craft: one idea per slide, a clear headline that states the takeaway, at most 5–6 short bullets, numbers in tables or charts rather than prose, and speaker notes (Note: …) that carry the detail the slide leaves out.
- Keep the user's facts, numbers and names. Don't invent statistics; if data is missing, use clearly labeled placeholders.
- After structural edits, run check_design and fix what it reports.
- Reply in one or two short sentences describing what you changed. No Markdown headings in chat.

Available themes: ${THEMES.map(t => t.name).join(', ')}.`;

let abort: AbortController | null = null;

export function stopAssistant() {
  abort?.abort();
}

export function undoAssistant() {
  const mark = useAssistant.getState().undoMark;
  if (mark == null) return;
  while (ed.useEditor.getState().past.length > mark) ed.undo();
  useAssistant.setState({ undoMark: null });
  push({ kind: 'activity', text: 'Reverted the assistant’s changes' });
}

/** Open the assistant panel and run a request */
export function askAssistant(prompt: string) {
  useUi.setState({ panel: 'assistant' });
  if (useAssistant.getState().apiKey) void runAssistant(prompt);
  else push({ kind: 'user', text: prompt });
}

export async function runAssistant(prompt: string) {
  const { apiKey, running } = useAssistant.getState();
  if (running || !prompt.trim()) return;
  if (!apiKey) { push({ kind: 'error', text: 'Add your Anthropic API key first.' }); return; }

  push({ kind: 'user', text: prompt });
  ed.setEditing(null);
  useAssistant.setState({ running: true, undoMark: ed.useEditor.getState().past.length });
  abort = new AbortController();

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const state = ed.useEditor.getState();
  // Previous turns give the model conversational context; tool results stay out to keep requests small
  const history: Anthropic.Beta.BetaMessageParam[] = useAssistant.getState().items
    .slice(0, -1)
    .filter((i): i is Extract<ChatItem, { kind: 'user' | 'assistant' }> => i.kind === 'user' || i.kind === 'assistant')
    .slice(-10)
    .map(i => ({ role: i.kind, content: i.text }));
  // The API needs alternating turns that start with the user
  while (history.length && history[0].role !== 'user') history.shift();
  const merged: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content}\n\n${m.content}`;
    else merged.push({ ...m });
  }

  // Everything this run changes becomes a single undo step
  ed.beginBatch();
  try {
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 32000,
      stream: true,
      max_iterations: 20,
      output_config: { effort: 'medium' },
      // Re-run on Anthropic's recommended model if a safety classifier declines
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: buildTools(text => push({ kind: 'activity', text })),
      messages: [
        ...merged,
        {
          role: 'user',
          content: `Current deck:\n${describeDeck(state.deck, state.slideIndex)}\n\nRequest: ${prompt}`,
        },
      ],
    }, { signal: abort.signal });

    for await (const stream of runner) {
      stream.on('text', appendText);
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') {
        push({ kind: 'error', text: 'Claude declined this request. Try rephrasing it.' });
        break;
      }
      if (message.stop_reason === 'max_tokens') {
        push({ kind: 'error', text: 'The response was cut off before it finished. Try a smaller request.' });
        break;
      }
      // Separate consecutive replies with a fresh chat bubble
      useAssistant.setState(s => (s.items[s.items.length - 1]?.kind === 'assistant' ? { items: [...s.items, { kind: 'activity', text: '' }] } : s));
    }
  } catch (err) {
    if (abort?.signal.aborted) push({ kind: 'activity', text: 'Stopped' });
    else if (err instanceof Anthropic.AuthenticationError) push({ kind: 'error', text: 'Your API key was rejected. Check it in the assistant settings.' });
    else if (err instanceof Anthropic.RateLimitError) push({ kind: 'error', text: 'Rate limited by the API. Wait a moment and try again.' });
    else if (err instanceof Anthropic.APIError) push({ kind: 'error', text: `API error ${err.status ?? ''}: ${err.message}` });
    else push({ kind: 'error', text: (err as Error).message || 'Something went wrong.' });
  } finally {
    ed.endBatch();
    abort = null;
    useAssistant.setState(s => ({
      running: false,
      items: s.items.filter(i => !(i.kind === 'activity' && !i.text)),
      undoMark: ed.useEditor.getState().past.length > (s.undoMark ?? Infinity) ? s.undoMark : null,
    }));
  }
}
