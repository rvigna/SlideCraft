import { describe, expect, it } from 'vitest';
import { deckToMarkdown, markdownToDeck } from '../model/markdown';
import type { ChartObject, TableObject, TextObject } from '../model/types';

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
