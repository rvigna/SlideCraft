import { commit, select, goToSlide, useEditor, toast } from '../store/editor';
import { useUi } from '../store/ui';
import { fixIssue, lintDeck, type LintContext, type LintIssue } from '../model/lint';
import { getTheme } from '../model/themes';
import { measureTextHeightCached } from '../io/measure';

export function lintContext(): LintContext {
  return { measureText: measureTextHeightCached, theme: getTheme(useEditor.getState().deck.themeName) };
}

export function relint() {
  useUi.setState({ issues: lintDeck(useEditor.getState().deck, lintContext()) });
}

export function showIssue(issue: LintIssue) {
  if (issue.slide < 0) return;
  goToSlide(issue.slide);
  if (issue.objectIds.length) select(issue.objectIds.slice(0, 1).concat(issue.objectIds.slice(1)), issue.objectIds[0]);
}

export function fixOne(issue: LintIssue) {
  const ctx = lintContext();
  commit(d => { fixIssue(d, issue, ctx); });
  relint();
}

/** Apply every available fix as one undo step */
export function fixAll(issues = useUi.getState().issues) {
  const fixable = issues.filter(i => i.fix);
  if (!fixable.length) return 0;
  const ctx = lintContext();
  commit(d => fixable.forEach(i => fixIssue(d, i, ctx)));
  relint();
  toast('success', `Fixed ${fixable.length} issue${fixable.length !== 1 ? 's' : ''}`, 'Undo with Ctrl+Z if you prefer the original.');
  return fixable.length;
}
