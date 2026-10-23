import { Button, IconButton, Tag } from '@carbon/react';
import { Close, View } from '@carbon/icons-react';
import { useUi, setPanel } from '../store/ui';
import { useEditor } from '../store/editor';
import { RULES, type LintIssue, type Severity } from '../model/lint';
import { fixAll, fixOne, showIssue } from './lintActions';


const TAG: Record<Severity, 'red' | 'warm-gray' | 'blue'> = { error: 'red', warning: 'warm-gray', info: 'blue' };
const LABEL: Record<Severity, string> = { error: 'Error', warning: 'Warning', info: 'Tip' };

function IssueRow({ issue }: { issue: LintIssue }) {
  const current = useEditor(s => s.slideIndex);
  return (
    <li className={`sc-issue${issue.slide === current ? ' is-current' : ''}`}>
      <div className="sc-issue-head">
        <Tag size="sm" type={TAG[issue.severity]}>{LABEL[issue.severity]}</Tag>
        <strong>{RULES[issue.rule].title}</strong>
        <span className="sc-issue-slide">{issue.slide >= 0 ? `Slide ${issue.slide + 1}` : 'Deck'}</span>
      </div>
      <p className="sc-issue-msg">{issue.message}</p>
      <div className="sc-issue-actions">
        {issue.slide >= 0 && <Button kind="ghost" size="sm" renderIcon={View} onClick={() => showIssue(issue)}>Show</Button>}
        {issue.fix && <Button kind="tertiary" size="sm" onClick={() => fixOne(issue)}>{issue.fix}</Button>}
        {issue.rule === 'crowded' && (
          <Button kind="tertiary" size="sm" onClick={() => void import('../ai/assistant').then(m => m.askAssistant(`Slide ${issue.slide + 1} is crowded. Split it into two or more clear slides, keeping every point.`))}>Split with AI</Button>
        )}
      </div>
    </li>
  );
}

export function DesignCheckPanel() {
  const issues = useUi(s => s.issues);
  const fixable = issues.filter(i => i.fix).length;
  const counts = (['error', 'warning', 'info'] as Severity[]).map(sev => [sev, issues.filter(i => i.severity === sev).length] as const);
  return (
    <aside className="sc-properties sc-check" aria-label="Design check">
      <header className="sc-check-head">
        <h2>Design check</h2>
        <IconButton kind="ghost" size="sm" label="Close" align="left" onClick={() => setPanel('check')}><Close /></IconButton>
      </header>
      {issues.length === 0 ? (
        <div className="sc-check-empty">
          <p className="sc-check-ok">✓ No issues found</p>
          <p className="sc-prop-hint">Checks: text overflow, off-slide objects, contrast (WCAG AA), tiny text, font count, alignment, empty boxes, crowding, overlapping text and slide titles.</p>
        </div>
      ) : (
        <>
          <div className="sc-check-summary">
            {counts.filter(([, n]) => n).map(([sev, n]) => <Tag key={sev} size="sm" type={TAG[sev]}>{n} {LABEL[sev].toLowerCase()}{n !== 1 ? 's' : ''}</Tag>)}
            <Button kind="primary" size="sm" disabled={!fixable} onClick={() => fixAll()}>Fix all ({fixable})</Button>
          </div>
          <ul className="sc-issue-list">{issues.map(i => <IssueRow key={i.key} issue={i} />)}</ul>
        </>
      )}
    </aside>
  );
}
