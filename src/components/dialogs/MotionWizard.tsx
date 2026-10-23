import { useEffect, useMemo, useState } from 'react';
import {
  Button, ComposedModal, ContentSwitcher, ModalBody, ModalFooter, ModalHeader, ProgressIndicator, ProgressStep,
  RadioButton, RadioButtonGroup, Switch, Toggle,
} from '@carbon/react';
import { Restart } from '@carbon/icons-react';
import { produce } from 'immer';
import type { Slide } from '../../model/types';
import { applyMotion, applyMotionToSlide, buildSteps, detectPreset, MOTION_PRESETS, type MotionOptions, type MotionSpeed } from '../../model/motion';
import * as ed from '../../store/editor';
import { closeDialog } from '../../store/ui';
import { AnimatedSlide, autoDuration } from '../AnimatedSlide';

/** A slide that keeps replaying its transition and entrance animations */
function MotionPreview({ slide, width, playing = true, replayKey = 0 }: { slide: Slide; width: number; playing?: boolean; replayKey?: number }) {
  const [loop, setLoop] = useState(0);
  const cycle = autoDuration(slide) + 1.4;
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setLoop(n => n + 1), cycle * 1000);
    return () => window.clearInterval(t);
  }, [cycle, playing]);
  const scale = width / 960;
  const transition = slide.transition !== 'none' ? `sc-trans-${slide.transition}` : '';
  return (
    <div className="sc-motion-preview" style={{ width, height: width * 540 / 960 }}>
      <div key={`${loop}-${replayKey}`} className={`sc-show-slide ${transition}`} style={{ width, height: width * 540 / 960, animationDuration: `${slide.transitionDuration}s` }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <AnimatedSlide slide={slide} mode="auto" />
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Style', 'Options', 'Preview'];

export function MotionWizard() {
  const deck = ed.useEditor(s => s.deck);
  const slideIndex = ed.useEditor(s => s.slideIndex);
  const current = deck.slides[slideIndex];
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [opts, setOpts] = useState<MotionOptions>(() => {
    const preset = detectPreset(current);
    return {
      preset: preset === 'none' ? 'subtle' : preset,
      scope: 'all',
      slideIndex,
      animateContent: true,
      revealOnClick: current.objects.some(o => o.animation?.onClick),
      speed: 'normal',
    };
  });
  const set = (patch: Partial<MotionOptions>) => setOpts(o => ({ ...o, ...patch }));

  // The current slide with the chosen motion applied — used by every preview
  const previewFor = useMemo(() => (presetId: MotionOptions['preset'], withOpts = opts) =>
    produce(current, s => { applyMotionToSlide(s as Slide, { ...withOpts, preset: presetId }); }), [current, opts]);
  const preview = previewFor(opts.preset);
  const preset = MOTION_PRESETS.find(p => p.id === opts.preset)!;
  const clickSteps = buildSteps(preview).length;
  const count = opts.scope === 'all' ? deck.slides.length : 1;

  const apply = () => {
    ed.commit(d => { applyMotion(d, opts); });
    closeDialog();
    ed.toast('success', opts.preset === 'none' ? 'Motion removed' : `“${preset.name}” motion applied to ${count} slide${count !== 1 ? 's' : ''}`, 'Press F5 to see it. Undo with Ctrl+Z.');
  };

  const summary = opts.preset === 'none'
    ? `No transitions or animations on ${count === 1 ? 'this slide' : `all ${count} slides`}.`
    : [
      `${preset.name}: ${preset.transition.replace('-', ' ')} transition (${preview.transitionDuration}s)`,
      opts.animateContent && preset.content ? `content ${preset.content.effect}s in${opts.revealOnClick ? `, one item per click (${clickSteps} on this slide)` : ' automatically'}` : 'content appears with the slide',
      `on ${count === 1 ? 'this slide' : `all ${count} slides`}.`,
    ].join(' · ');

  return (
    <ComposedModal open size="lg" onClose={closeDialog} className="sc-motion">
      <ModalHeader title="Transitions & animation" label="Motion wizard" />
      <ModalBody>
        <ProgressIndicator currentIndex={step} spaceEqually className="sc-motion-steps" onChange={i => setStep(i)}>
          {STEPS.map((label, i) => <ProgressStep key={label} label={label} complete={i < step} current={i === step} />)}
        </ProgressIndicator>

        {step === 0 && (
          <div className="sc-motion-grid" role="radiogroup" aria-label="Motion style">
            {MOTION_PRESETS.map(p => (
              <button key={p.id} role="radio" aria-checked={opts.preset === p.id}
                className={`sc-motion-card${opts.preset === p.id ? ' is-selected' : ''}`}
                onClick={() => set({ preset: p.id })} onDoubleClick={() => { set({ preset: p.id }); setStep(1); }}>
                <MotionPreview slide={previewFor(p.id)} width={200} playing={opts.preset === p.id} />
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="sc-motion-options">
            <div className="sc-motion-fields">
              <RadioButtonGroup legendText="Apply to" name="sc-motion-scope" valueSelected={opts.scope} orientation="vertical"
                onChange={v => set({ scope: v as MotionOptions['scope'] })}>
                <RadioButton labelText={`All slides (${deck.slides.length})`} value="all" id="sc-motion-all" />
                <RadioButton labelText={`This slide only (slide ${slideIndex + 1})`} value="current" id="sc-motion-current" />
              </RadioButtonGroup>
              <Toggle id="sc-motion-content" labelText="Animate slide content" labelA="Off" labelB="On" size="sm"
                disabled={opts.preset === 'none'} toggled={opts.animateContent && opts.preset !== 'none'} onToggle={v => set({ animateContent: v })} />
              <Toggle id="sc-motion-click" labelText="Reveal one item per click" labelA="Off — plays automatically" labelB="On — bullets build on click" size="sm"
                disabled={opts.preset === 'none' || !opts.animateContent} toggled={opts.revealOnClick} onToggle={v => set({ revealOnClick: v })} />
              <div>
                <p className="cds--label">Speed</p>
                <ContentSwitcher size="sm" selectedIndex={['slow', 'normal', 'fast'].indexOf(opts.speed)}
                  onChange={({ name }) => set({ speed: name as MotionSpeed })}>
                  <Switch name="slow" text="Relaxed" />
                  <Switch name="normal" text="Normal" />
                  <Switch name="fast" text="Brisk" />
                </ContentSwitcher>
              </div>
            </div>
            <MotionPreview slide={preview} width={380} />
          </div>
        )}

        {step === 2 && (
          <div className="sc-motion-final">
            <MotionPreview slide={preview} width={640} replayKey={replay} />
            <div className="sc-motion-summary">
              <p>{summary}</p>
              <Button kind="ghost" size="sm" renderIcon={Restart} onClick={() => setReplay(r => r + 1)}>Replay</Button>
              <p className="sc-dialog-hint">Fine-tune any object later under Properties › Animation. Viewers who prefer reduced motion see slides without animation.</p>
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={() => (step === 0 ? closeDialog() : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 2
          ? <Button kind="primary" onClick={() => setStep(step + 1)}>Next</Button>
          : <Button kind="primary" onClick={apply}>Apply</Button>}
      </ModalFooter>
    </ComposedModal>
  );
}
