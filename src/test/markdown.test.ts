import { describe, expect, it } from 'vitest';
import { deckToMarkdown, markdownToDeck } from '../model/markdown';
import type { ChartObject, TableObject, TextObject } from '../model/types';
import { htmlToPlain } from '../model/richtext';
import { defaultLintContext, lintDeck } from '../model/lint';

const SAMPLE = `---
title: Q3 Review
theme: Carbon Dark
---

# Q3 Business Review
## Prepared for the board

---

# Highlights
- Revenue up **12%**
  - EMEA led growth
- Churn down to *2.1%*

Note: Mention the EMEA team by name.

---

# Numbers
| Region | Q2 | Q3 |
|---|---|---|
| EMEA | 104 | 118 |
| APAC | 88 | 97 |

\`\`\`chart column
title: Revenue
categories: Q2, Q3
EMEA: 104, 118
APAC: 88, 97
\`\`\`

---

# Next steps

---

> Simplicity is the ultimate sophistication.

<!-- transition: fade 0.8 -->
`;

describe('Markdown decks', () => {
  const deck = markdownToDeck(SAMPLE);

  it('reads front matter and splits slides', () => {
    expect(deck.title).toBe('Q3 Review');
    expect(deck.themeName).toBe('Carbon Dark');
    expect(deck.slides).toHaveLength(5);
  });

  it('picks layouts from content', () => {
    const [title, highlights, numbers, section, quote] = deck.slides;
    expect((title.objects[0] as TextObject).text).toBe('Q3 Business Review');
    expect((title.objects[1] as TextObject).text).toBe('Prepared for the board');
    const list = highlights.objects[1] as TextObject;
    expect(list.text).toBe('<ul><li>Revenue up <b>12%</b><ul><li>EMEA led growth</li></ul></li><li>Churn down to <i>2.1%</i></li></ul>');
    expect(highlights.notes).toBe('Mention the EMEA team by name.');
    expect(numbers.objects.map(o => o.type)).toEqual(['text', 'table', 'chart']);
    expect((numbers.objects[1] as TableObject).rows[2].map(c => c.text)).toEqual(['APAC', '88', '97']);
    expect((numbers.objects[2] as ChartObject).series[1].values).toEqual([88, 97]);
    expect(section.background).toBe('#0f62fe'); // Carbon Dark section color
    expect((quote.objects[0] as TextObject).fontStyle).toBe('italic');
    expect(quote.transition).toBe('fade');
    expect(quote.transitionDuration).toBe(0.8);
  });

  it('keeps every object on the slide', () => {
    deck.slides.forEach(s => s.objects.forEach(o => {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y + o.h).toBeLessThanOrEqual(540);
    }));
  });

  it('round-trips through Markdown', () => {
    const md = deckToMarkdown(deck);
    const again = markdownToDeck(md);
    expect(again.slides).toHaveLength(5);
    expect(again.slides.map(s => s.objects.map(o => o.type))).toEqual(deck.slides.map(s => s.objects.map(o => o.type)));
    expect(deckToMarkdown(again)).toBe(md);
  });
});

describe('Markdown to slides: smarter conversion', () => {
  const texts = (s: { objects: unknown[] }) => (s.objects as TextObject[]).filter(o => o.type === 'text').map(o => htmlToPlain(o.text));

  it('splits documents without --- at headings', () => {
    const deck = markdownToDeck('# Plan\nA short intro\n\n## Goals\n- Ship it\n\n## Risks\n- Time\n');
    expect(deck.slides).toHaveLength(3);
    expect(texts(deck.slides[1])[0]).toBe('Goals');
    expect(markdownToDeck('# One\ntext\n\n# Two\ntext').slides).toHaveLength(2);
    // "##" right under the title is its subtitle; "###" inside a section stays a sub-heading (cards)
    const doc = markdownToDeck('# Launch\n## Out the door\n\n## Pillars\n### Fast\nQuick\n### Safe\nSure\n\n## Next\n- Ship');
    expect(doc.slides.map(s => texts(s)[0])).toEqual(['Launch', 'Pillars', 'Next']);
    expect(texts(doc.slides[0])[1]).toBe('Out the door');
    const cards = (doc.slides[1].objects as TextObject[]).slice(1);
    expect(cards[0].y).toBe(cards[2].y);
    // A title with a single subtitle stays one slide; tools can turn splitting off
    expect(markdownToDeck('# Title\n## Subtitle').slides).toHaveLength(1);
    expect(markdownToDeck('# A\n## x\ntext\n## y\ntext', { autoSplit: false }).slides).toHaveLength(1);
  });

  it('continues long lists on extra slides instead of shrinking them', () => {
    const items = Array.from({ length: 24 }, (_, i) => `- Point number ${i + 1} with a little explanation`).join('\n');
    const deck = markdownToDeck(`# Intro\n\n---\n\n# Everything\n${items}\n\nNote: say it`);
    expect(deck.slides.length).toBeGreaterThan(2);
    const cont = deck.slides[2];
    expect(texts(cont)[0]).toBe('Everything (continued)');
    expect((cont.objects[1] as TextObject).fontSize).toBeGreaterThanOrEqual(18);
    expect(deck.slides[1].notes).toBe('say it');
    expect(cont.notes).toBe('');
    // Nothing lost
    const all = deck.slides.slice(1).flatMap(texts).join('\n');
    expect(all).toContain('Point number 1 ');
    expect(all).toContain('Point number 24 ');
  });

  it('lays out columns, cards, code, big numbers and pictures', () => {
    const deck = markdownToDeck([
      '# Intro', '---',
      '# Compare', 'Left side', '|||', 'Right side', '---',
      '# Pillars', '### Fast', 'Quick to load', '### Safe', 'No surprises', '### Open', 'Plain files', '---',
      '# Install', 'Run this:', '```bash', 'npm install', '  npm run dev', '```', '---',
      '# 42%', 'of users came back', '---',
      '# Our team', '![bg left](https://example.com/team.jpg)', '- Remote first', '---',
      '![bg](https://example.com/bg.jpg)', '# Thanks',
    ].join('\n'));
    const [, compare, pillars, install, big, team, thanks] = deck.slides;
    const [l, r] = (compare.objects as TextObject[]).slice(1);
    expect(htmlToPlain(l.text)).toBe('Left side');
    expect(r.x).toBeGreaterThan(l.x + l.w);
    const heads = (pillars.objects as TextObject[]).filter(o => o.fontWeight === '700').slice(1);
    expect(heads.map(o => htmlToPlain(o.text))).toEqual(['Fast', 'Safe', 'Open']);
    expect(new Set(heads.map(o => o.y)).size).toBe(1);
    const code = (install.objects as TextObject[]).find(o => o.fontFamily === 'IBM Plex Mono')!;
    expect(htmlToPlain(code.text)).toBe('npm install\n  npm run dev');
    expect(code.backgroundColor).not.toBe('transparent');
    expect((big.objects[0] as TextObject).fontSize).toBe(96);
    expect(team.objects[0]).toMatchObject({ type: 'image', x: 0, y: 0, w: 480, h: 540 });
    expect(team.objects.slice(1).every(o => o.x >= 480)).toBe(true);
    expect(thanks.backgroundImage).toBe('https://example.com/bg.jpg');
  });

  it('adds footers and slide numbers from the front matter', () => {
    const deck = markdownToDeck('---\nfooter: ACME confidential\npaginate: true\n---\n# A\n---\n# B\n- x\n---\n# C\n- y');
    expect(texts(deck.slides[0])).not.toContain('ACME confidential');
    expect(texts(deck.slides[2])).toEqual(expect.arrayContaining(['ACME confidential', '3']));
  });

  it('round-trips the new constructs', () => {
    const md = [
      '---', 'title: T', 'theme: Carbon', 'footer: ACME', 'paginate: true', '---',
      '# T', '---',
      '# Compare', 'Left', '|||', 'Right', '---',
      '# Pillars', '### Fast', 'Quick', '### Safe', 'Sure', '---',
      '# Install', '```', 'npm i', '```', '---',
      '# Team', '![bg right](https://example.com/a.jpg)', '- One',
    ].join('\n');
    const once = markdownToDeck(md);
    const back = deckToMarkdown(once);
    expect(back).toContain('footer: ACME');
    expect(back).toContain('paginate: true');
    expect(back).toContain('|||');
    expect(back).toContain('### Fast');
    expect(back).toContain('```\nnpm i\n```');
    expect(back).toContain('![bg right](https://example.com/a.jpg)');
    const twice = markdownToDeck(back);
    expect(twice.slides.map(s => s.objects.map(o => [o.type, o.x, o.y, o.w, o.h]))).toEqual(once.slides.map(s => s.objects.map(o => [o.type, o.x, o.y, o.w, o.h])));
  });

  it('keeps escaped characters and bold italics', () => {
    const deck = markdownToDeck('# A\n\n---\n\n# B\nPrice is 5\\*3 and ***very*** good');
    const html = (deck.slides[1].objects[1] as TextObject).text;
    expect(htmlToPlain(html)).toBe('Price is 5*3 and very good');
    expect(html).toContain('<i><b>very</b></i>');
  });

  it('generates slides the design check is happy with', () => {
    const md = require('fs').readFileSync(require('path').join(__dirname, '../../examples/quarterly-review.md'), 'utf8');
    const deck = markdownToDeck(md);
    const issues = lintDeck(deck, defaultLintContext(deck)).filter(i => i.severity !== 'info');
    expect(issues.map(i => `${i.slide + 1}: ${i.message}`)).toEqual([]);
    const list = Array.from({ length: 16 }, (_, i) => `- Checklist item ${i + 1}: verified on staging and production`).join('\n');
    const long = markdownToDeck(`---\nfooter: Internal\npaginate: true\n---\n# A\n---\n# Checks\n${list}\n---\n# Team\n![bg left](https://example.com/x.jpg)\n- One`);
    expect(long.slides).toHaveLength(4);
    expect(lintDeck(long, defaultLintContext(long)).filter(i => i.severity !== 'info').map(i => `${i.slide + 1}: ${i.message}`)).toEqual([]);
    // Footer stays off the picture
    expect(long.slides[3].objects.filter(o => o.type === 'text' && o.y >= 490).every(o => o.x >= 480)).toBe(true);
  });
});
