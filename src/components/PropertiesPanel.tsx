import { Button, Checkbox, IconButton, Select, SelectItem, Slider, TextArea } from '@carbon/react';
import { Add, ChartBar, Subtract } from '@carbon/icons-react';
import { addTableColumn, addTableRow, removeTableColumn, removeTableRow } from './objectOps';
import { contrastText } from '../model/color';
import {
  AlignHorizontalCenter, AlignHorizontalLeft, AlignHorizontalRight, AlignVerticalBottom, AlignVerticalCenter,
  AlignVerticalTop, ColorPalette, DistributeHorizontalCenter, DistributeVerticalCenter, Image as ImageIcon, Template,
} from '@carbon/icons-react';
import type { BorderStyle, ChartType, ObjectFit, Shadow, Transition, VerticalAlign } from '../model/types';
import * as ed from '../store/editor';
import { endCoalesce } from '../store/editor';
import { openDialog } from '../store/ui';
import { ColorButton, NumField } from './fields';
import { formatSelection, styleSelection } from './formatting';
import type { AlignMode } from '../model/geometry';

const TRANSITIONS: { value: Transition; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide left' }, { value: 'slide-right', label: 'Slide right' },
  { value: 'slide-up', label: 'Slide up' }, { value: 'slide-down', label: 'Slide down' },
  { value: 'zoom-in', label: 'Zoom in' }, { value: 'zoom-out', label: 'Zoom out' },
];

const ALIGN_BUTTONS: { mode: AlignMode; label: string; Icon: React.ElementType }[] = [
  { mode: 'left', label: 'Align left', Icon: AlignHorizontalLeft },
  { mode: 'center', label: 'Align center', Icon: AlignHorizontalCenter },
  { mode: 'right', label: 'Align right', Icon: AlignHorizontalRight },
  { mode: 'top', label: 'Align top', Icon: AlignVerticalTop },
  { mode: 'middle', label: 'Align middle', Icon: AlignVerticalCenter },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignVerticalBottom },
];

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="sc-prop-section">
      <header className="sc-prop-title"><h2>{title}</h2>{aside}</header>
      {children}
    </section>
  );
}

function ObjectProperties() {
  const obj = ed.useEditor(s => ed.primaryObject(s));
  const count = ed.useEditor(s => s.selection.length);
  if (!obj) return null;
  const setBox = (key: 'x' | 'y' | 'w' | 'h' | 'rotation') => (v: number) => {
    const id = obj.id;
    ed.commitSlide(slide => {
      const o = slide.objects.find(x => x.id === id);
      if (o) o[key] = key === 'rotation' ? ((Math.round(v) % 360) + 360) % 360 : key === 'w' || key === 'h' ? Math.max(4, Math.round(v)) : Math.round(v);
    });
  };
  const typeLabel = { text: 'Text box', shape: 'Shape', image: 'Image', icon: 'Icon', table: 'Table', chart: 'Chart' }[obj.type];

  return (
    <>
      <Section title={count > 1 ? `${count} objects` : typeLabel} aside={count > 1 ? <span className="sc-prop-badge">aligns to selection</span> : null}>
        <div className="sc-align-row" role="group" aria-label="Align">
          {ALIGN_BUTTONS.map(({ mode, label, Icon }) => (
            <IconButton key={mode} kind="ghost" size="sm" label={count > 1 ? label : `${label} to slide`} onClick={() => ed.alignSelection(mode)}><Icon /></IconButton>
          ))}
          <IconButton kind="ghost" size="sm" label="Distribute horizontally" disabled={count < 3} onClick={() => ed.distributeSelection('h')}><DistributeHorizontalCenter /></IconButton>
          <IconButton kind="ghost" size="sm" label="Distribute vertically" disabled={count < 3} onClick={() => ed.distributeSelection('v')}><DistributeVerticalCenter /></IconButton>
        </div>
        <div className="sc-prop-grid">
          <NumField label="X" value={obj.x} onCommit={setBox('x')} />
          <NumField label="Y" value={obj.y} onCommit={setBox('y')} />
          <NumField label="Width" value={obj.w} min={4} onCommit={setBox('w')} />
          <NumField label="Height" value={obj.h} min={4} onCommit={setBox('h')} />
          <NumField label="Rotation (°)" value={obj.rotation} onCommit={setBox('rotation')} />
        </div>
      </Section>

      <Section title="Appearance">
        <Slider
          id="sc-opacity" labelText="Opacity" min={0} max={100} step={1} value={obj.opacity}
          formatLabel={v => `${v}%`} hideTextInput={false}
          onChange={({ value }) => styleSelection({ opacity: Math.round(value ?? 100) }, 'opacity')}
          onRelease={endCoalesce}
        />
        <div className="sc-prop-grid">
          <Select id="sc-border-style" size="sm" labelText="Border" value={obj.borderStyle}
            onChange={e => ed.commitSelection(o => { o.borderStyle = e.target.value as BorderStyle; if (o.borderStyle !== 'none' && !o.borderWidth) o.borderWidth = 2; })}>
            <SelectItem value="none" text="None" /><SelectItem value="solid" text="Solid" />
            <SelectItem value="dashed" text="Dashed" /><SelectItem value="dotted" text="Dotted" />
          </Select>
          <NumField label="Border width" value={obj.borderWidth} min={0} max={40}
            onCommit={v => ed.commitSelection(o => { o.borderWidth = v; if (v && o.borderStyle === 'none') o.borderStyle = 'solid'; })} />
          <NumField label="Corner radius" value={obj.borderRadius} min={0} onCommit={v => styleSelection({ borderRadius: v })} />
          <Select id="sc-shadow" size="sm" labelText="Shadow" value={obj.shadow} onChange={e => styleSelection({ shadow: e.target.value as Shadow })}>
            <SelectItem value="none" text="None" /><SelectItem value="sm" text="Small" />
            <SelectItem value="md" text="Medium" /><SelectItem value="lg" text="Large" />
          </Select>
          <Button kind="ghost" size="sm" className="sc-span-2" onClick={() => styleSelection({ backgroundColor: 'transparent' })}>Remove fill</Button>
        </div>
      </Section>

      {obj.type === 'text' && (
        <Section title="Text">
          <div className="sc-prop-grid">
            <Select id="sc-valign" size="sm" labelText="Vertical align" value={obj.verticalAlign}
              onChange={e => ed.commitSelection(o => { if (o.type === 'text') o.verticalAlign = e.target.value as VerticalAlign; })}>
              <SelectItem value="top" text="Top" /><SelectItem value="middle" text="Middle" /><SelectItem value="bottom" text="Bottom" />
            </Select>
            <NumField label="Line height" value={obj.lineHeight} min={0.8} max={3} step={0.1} onCommit={v => formatSelection({ lineHeight: v })} />
          </div>
        </Section>
      )}

      {obj.type === 'table' && (
        <Section title="Table" aside={<span className="sc-prop-badge">{obj.rows.length} × {obj.colWidths.length}</span>}>
          <div className="sc-prop-grid">
            <Button kind="tertiary" size="sm" renderIcon={Add} onClick={addTableRow}>Row</Button>
            <Button kind="tertiary" size="sm" renderIcon={Subtract} disabled={obj.rows.length <= 1} onClick={removeTableRow}>Row</Button>
            <Button kind="tertiary" size="sm" renderIcon={Add} onClick={addTableColumn}>Column</Button>
            <Button kind="tertiary" size="sm" renderIcon={Subtract} disabled={obj.colWidths.length <= 1} onClick={removeTableColumn}>Column</Button>
          </div>
          <Checkbox id="sc-table-header" labelText="Header row" checked={obj.headerRow}
            onChange={(_, { checked }) => ed.commitSelection(o => { if (o.type === 'table') o.headerRow = checked; })} />
          <Checkbox id="sc-table-bands" labelText="Banded rows" checked={obj.bandedRows}
            onChange={(_, { checked }) => ed.commitSelection(o => { if (o.type === 'table') o.bandedRows = checked; })} />
          <div className="sc-prop-colors">
            <ColorButton label="Header fill" icon={<span className="sc-color-label">Header</span>} value={obj.headerFill}
              onPick={c => ed.commitSelection(o => { if (o.type === 'table') { o.headerFill = c; o.headerColor = contrastText(c); } }, undefined, { coalesce: 'table-header' })} />
            <ColorButton label="Band fill" icon={<span className="sc-color-label">Bands</span>} value={obj.bandFill}
              onPick={c => ed.commitSelection(o => { if (o.type === 'table') o.bandFill = c; }, undefined, { coalesce: 'table-band' })} />
          </div>
          <Button kind="ghost" size="sm" onClick={() => ed.setEditing(obj.id)}>Edit cells (Enter)</Button>
        </Section>
      )}

      {obj.type === 'chart' && (
        <Section title="Chart">
          <div className="sc-prop-grid">
            <Select id="sc-chart-kind" size="sm" labelText="Type" value={obj.chartType}
              onChange={e => ed.commitSelection(o => { if (o.type === 'chart') o.chartType = e.target.value as ChartType; })}>
              <SelectItem value="column" text="Column" /><SelectItem value="bar" text="Bar" /><SelectItem value="line" text="Line" />
              <SelectItem value="area" text="Area" /><SelectItem value="pie" text="Pie" /><SelectItem value="doughnut" text="Doughnut" />
            </Select>
            <Button kind="tertiary" size="sm" renderIcon={ChartBar} onClick={() => openDialog('chart')}>Edit data</Button>
          </div>
          <Checkbox id="sc-chart-legend-p" labelText="Legend" checked={obj.showLegend}
            onChange={(_, { checked }) => ed.commitSelection(o => { if (o.type === 'chart') o.showLegend = checked; })} />
          <Checkbox id="sc-chart-values-p" labelText="Data labels" checked={obj.showValues}
            onChange={(_, { checked }) => ed.commitSelection(o => { if (o.type === 'chart') o.showValues = checked; })} />
        </Section>
      )}

      {obj.type === 'image' && (
        <Section title="Image">
          <div className="sc-prop-grid">
            <Select id="sc-fit" size="sm" labelText="Fit" value={obj.objectFit}
              onChange={e => ed.commitSelection(o => { if (o.type === 'image') o.objectFit = e.target.value as ObjectFit; })}>
              <SelectItem value="cover" text="Fill frame (crop)" /><SelectItem value="contain" text="Fit inside" /><SelectItem value="fill" text="Stretch" />
            </Select>
            <Button kind="tertiary" size="sm" renderIcon={ImageIcon} onClick={() => window.dispatchEvent(new CustomEvent('slidecraft:replace-image', { detail: obj.id }))}>Replace</Button>
          </div>
        </Section>
      )}
    </>
  );
}

function SlideProperties() {
  const slide = ed.useEditor(s => s.deck.slides[s.slideIndex]);
  const index = ed.useEditor(s => s.slideIndex);
  const total = ed.useEditor(s => s.deck.slides.length);
  return (
    <>
      <Section title={`Slide ${index + 1}`}>
        <div className="sc-prop-stack">
          <Button kind="tertiary" size="sm" renderIcon={ColorPalette} onClick={() => openDialog('background', index)}>Background</Button>
          <Button kind="tertiary" size="sm" renderIcon={Template} onClick={() => openDialog('layout', index)}>Layout</Button>
        </div>
      </Section>
      <Section title="Transition">
        <div className="sc-prop-grid">
          <Select id="sc-transition" size="sm" labelText="Effect" value={slide.transition}
            onChange={e => ed.commitSlide(s => { s.transition = e.target.value as Transition; })}>
            {TRANSITIONS.map(t => <SelectItem key={t.value} value={t.value} text={t.label} />)}
          </Select>
          <NumField label="Duration (s)" value={slide.transitionDuration} min={0.1} max={5} step={0.1}
            onCommit={v => ed.commitSlide(s => { s.transitionDuration = v; })} />
          <Button kind="ghost" size="sm" className="sc-span-2" disabled={total < 2}
            onClick={() => {
              ed.commit(d => d.slides.forEach(s => { s.transition = slide.transition; s.transitionDuration = slide.transitionDuration; }));
              ed.toast('success', `Transition applied to all ${total} slides`);
            }}>
            Apply to all slides
          </Button>
        </div>
      </Section>
      <Section title="Speaker notes">
        <TextArea
          id="sc-notes" labelText="Speaker notes" hideLabel rows={6}
          placeholder="Notes for this slide — shown in Presenter View"
          value={slide.notes}
          onChange={e => ed.commitSlide(s => { s.notes = e.target.value; }, { coalesce: `notes-${slide.id}` })}
          onBlur={endCoalesce}
        />
      </Section>
    </>
  );
}

export function PropertiesPanel() {
  return (
    <aside className="sc-properties" aria-label="Properties">
      <ObjectProperties />
      <SlideProperties />
      <p className="sc-prop-hint sc-prop-tip">Tip: drag on empty space to select several objects; Shift-click adds or removes one.</p>
    </aside>
  );
}
