import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, InlineLoading, Link, PasswordInput, Select, SelectItem, TextArea, TextInput } from '@carbon/react';
import { Close, Send, StopFilledAlt, Undo, Settings, MagicWand } from '@carbon/icons-react';
import { setPanel } from '../store/ui';
import { useEditor } from '../store/editor';
import { MODEL, runAssistant, setApiKey, stopAssistant, undoAssistant, useAssistant } from '../ai/assistant';
import { THEMES } from '../model/themes';

function KeySetup({ onDone }: { onDone?: () => void }) {
  const current = useAssistant(s => s.apiKey);
  const [key, setKey] = useState(current);
  return (
    <div className="sc-ai-setup">
      <p className="sc-prop-hint">
        The assistant uses Claude ({MODEL}) with your own Anthropic API key. The key is kept in this browser and sent only to api.anthropic.com.
        {' '}<Link href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get a key</Link>
      </p>
      <PasswordInput id="sc-ai-key" labelText="Anthropic API key" placeholder="sk-ant-…" size="sm" value={key} onChange={e => setKey(e.target.value)} />
      <div className="sc-dialog-row">
        <Button size="sm" disabled={!key.trim()} onClick={() => { setApiKey(key); onDone?.(); }}>Save key</Button>
        {current && <Button size="sm" kind="ghost" onClick={() => { setApiKey(''); setKey(''); }}>Remove key</Button>}
      </div>
    </div>
  );
}

function GenerateForm({ onClose }: { onClose: () => void }) {
  const theme = useEditor(s => s.deck.themeName);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [slides, setSlides] = useState('8');
  const [themeName, setThemeName] = useState(theme);
  const submit = () => {
    onClose();
    void runAssistant(
      `Create a new ${slides}-slide presentation${audience ? ` for ${audience}` : ''} in the ${themeName} theme. ` +
      `Replace the current deck. Use tables or charts where numbers appear, and add speaker notes to every slide.\n\nTopic, outline or source material:\n${topic}`,
    );
  };
  return (
    <div className="sc-ai-generate">
      <TextArea id="sc-ai-topic" labelText="What is the presentation about?" rows={6} value={topic}
        placeholder="Paste an outline, notes or a document — or describe the topic" onChange={e => setTopic(e.target.value)} />
      <TextInput id="sc-ai-audience" size="sm" labelText="Audience (optional)" placeholder="e.g. the board, new hires, customers" value={audience} onChange={e => setAudience(e.target.value)} />
      <div className="sc-prop-grid">
        <Select id="sc-ai-count" size="sm" labelText="Slides" value={slides} onChange={e => setSlides(e.target.value)}>
          {['5', '8', '10', '12', '15'].map(n => <SelectItem key={n} value={n} text={n} />)}
        </Select>
        <Select id="sc-ai-theme" size="sm" labelText="Theme" value={themeName} onChange={e => setThemeName(e.target.value)}>
          {THEMES.map(t => <SelectItem key={t.name} value={t.name} text={t.name} />)}
        </Select>
      </div>
      <div className="sc-dialog-row">
        <Button size="sm" renderIcon={MagicWand} disabled={!topic.trim()} onClick={submit}>Generate deck</Button>
        <Button size="sm" kind="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

const QUICK = [
  { label: 'Improve this slide', prompt: (n: number) => `Improve slide ${n}: sharper headline that states the takeaway, tighter wording, better structure. Keep the facts.` },
  { label: 'Write speaker notes', prompt: () => 'Write concise speaker notes (3–5 sentences) for every slide that has none, based on its content.' },
  { label: 'Make it concise', prompt: () => 'Tighten the wording on every slide: shorter bullets, no filler, same meaning.' },
  { label: 'Fix design issues', prompt: () => 'Check the design and fix every issue, including ones without an automatic fix (split crowded slides, add missing titles, separate overlapping text).' },
  { label: 'Add a summary slide', prompt: () => 'Add a closing summary slide with the three key takeaways and a clear next step.' },
];

export function AssistantPanel() {
  const { apiKey, items, running, undoMark } = useAssistant();
  const current = useEditor(s => s.slideIndex);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'chat' | 'settings' | 'generate'>('chat');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [items]);

  const send = (text = draft) => {
    if (!text.trim() || running) return;
    setDraft('');
    void runAssistant(text.trim());
  };

  return (
    <aside className="sc-properties sc-ai" aria-label="AI assistant">
      <header className="sc-check-head">
        <h2>Assistant</h2>
        <div>
          {apiKey && <IconButton kind="ghost" size="sm" label="API key" align="left" onClick={() => setMode(mode === 'settings' ? 'chat' : 'settings')}><Settings /></IconButton>}
          <IconButton kind="ghost" size="sm" label="Close" align="left" onClick={() => setPanel('assistant')}><Close /></IconButton>
        </div>
      </header>

      {!apiKey || mode === 'settings' ? (
        <KeySetup onDone={() => setMode('chat')} />
      ) : mode === 'generate' ? (
        <GenerateForm onClose={() => setMode('chat')} />
      ) : (
        <>
          <div className="sc-ai-quick">
            <Button size="sm" kind="primary" renderIcon={MagicWand} disabled={running} onClick={() => setMode('generate')}>Generate a deck…</Button>
            {QUICK.map(q => <Button key={q.label} size="sm" kind="tertiary" disabled={running} onClick={() => send(q.prompt(current + 1))}>{q.label}</Button>)}
          </div>
          <div className="sc-ai-log" ref={logRef} aria-live="polite">
            {!items.length && <p className="sc-prop-hint">Ask for anything: “turn slide 3 into a chart”, “translate the deck to Spanish”, “make a 10-slide pitch from these notes”…</p>}
            {items.map((it, i) => (
              <div key={i} className={`sc-ai-item is-${it.kind}`}>{it.text}</div>
            ))}
            {running && <InlineLoading description="Working…" />}
          </div>
          {undoMark != null && !running && (
            <Button kind="ghost" size="sm" renderIcon={Undo} onClick={undoAssistant}>Undo the assistant’s changes</Button>
          )}
          <div className="sc-ai-input">
            <TextArea
              id="sc-ai-input" labelText="Message" hideLabel rows={3} value={draft} placeholder="Ask the assistant…"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            {running
              ? <Button size="sm" kind="danger--tertiary" renderIcon={StopFilledAlt} onClick={stopAssistant}>Stop</Button>
              : <Button size="sm" renderIcon={Send} disabled={!draft.trim()} onClick={() => send()}>Send</Button>}
          </div>
        </>
      )}
    </aside>
  );
}
