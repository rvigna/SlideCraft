import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { contrastRatio, defaultLintContext, fixIssue, lintDeck } from '../model/lint';
import { createDeck, createTextObject, IdSource } from '../model/factory';
import type { Deck } from '../model/types';

function deckWith(build: (ids: IdSource, deck: Deck) => void): Deck {
  const deck = createDeck('Carbon');
  const ids = new IdSource(deck.nextObjectId);
  build(ids, deck);
  deck.nextObjectId = ids.next;
  return deck;
}

describe('design lint', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('passes a clean default deck', () => {
    expect(lintDeck(createDeck(), defaultLintContext(createDeck())).filter(i => i.severity !== 'info')).toEqual([]);
  });

  it('finds and fixes common problems', () => {
    const deck = deckWith((ids, d) => {
      d.slides[0].objects.push(
        createTextObject(ids, { x: 700, y: 400, w: 400, h: 60, text: 'Off the edge', fontSize: 20 }),
        createTextObject(ids, { x: 60, y: 300, w: 200, h: 40, text: 'Pale text that nobody can read', color: '#eeeeee', fontSize: 16 }),
        createTextObject(ids, { x: 62, y: 360, w: 300, h: 40, text: 'tiny', fontSize: 8 }),
        createTextObject(ids, { x: 600, y: 60, w: 200, h: 30, text: 'A long paragraph '.repeat(20), fontSize: 18 }),
        createTextObject(ids, { x: 300, y: 450, w: 100, h: 40, text: '' }),
        createTextObject(ids, { x: 10, y: 10, w: 100, h: 30, text: 'a', fontFamily: 'Comic Sans' }),
        createTextObject(ids, { x: 10, y: 50, w: 100, h: 30, text: 'b', fontFamily: 'Papyrus' }),
        createTextObject(ids, { x: 10, y: 90, w: 100, h: 30, text: 'c', fontFamily: 'Courier New' }),
      );
    });
    const ctx = defaultLintContext(deck);
    const rules = new Set(lintDeck(deck, ctx).map(i => i.rule));
    for (const r of ['off-slide', 'low-contrast', 'tiny-text', 'text-overflow', 'empty-text', 'too-many-fonts', 'misaligned']) {
      expect(rules, r).toContain(r);
    }
    const fixed = produce(deck, d => { lintDeck(deck, ctx).filter(i => i.fix).forEach(i => fixIssue(d as Deck, i, ctx)); });
    const left = lintDeck(fixed, ctx);
    expect(left.filter(i => i.fix)).toEqual([]);
  });

  it('flags overlapping text and crowded slides', () => {
    const deck = deckWith((ids, d) => {
      d.slides[0].objects.push(createTextObject(ids, { x: 100, y: 180, w: 700, h: 100, text: 'Overlapping words here', fontSize: 30 }));
      d.slides[0].objects.push(createTextObject(ids, { x: 60, y: 400, w: 840, h: 120, text: 'word '.repeat(100), fontSize: 12 }));
    });
    const rules = lintDeck(deck, defaultLintContext(deck)).map(i => i.rule);
    expect(rules).toContain('text-overlap');
    expect(rules).toContain('crowded');
  });
});
