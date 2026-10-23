/* ========================================================
   slidecraft — command-line tool for decks as code

   slidecraft build  deck.md   -o deck.pptx   Markdown/JSON/PPTX → PPTX/HTML/JSON/MD
   slidecraft lint   deck.pptx [--json] [--fix -o fixed.pptx]
   slidecraft help
   ======================================================== */
import './dom';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { normalizeDeck } from '../model/factory';
import { deckToMarkdown, markdownToDeck } from '../model/markdown';
import { defaultLintContext, fixIssue, lintDeck, RULES } from '../model/lint';
import type { Deck } from '../model/types';
import { deckToHtml } from '../io/htmlExport';
import { pptxToDeck } from '../io/pptxImport';
import { deckToPptxArrayBuffer } from '../io/pptxExport';
import { produce } from 'immer';

const HELP = `slidecraft — decks as code

Usage:
  slidecraft build <input> -o <output>       Convert between formats
  slidecraft lint  <input> [--json]          Check design issues (exit code 1 on errors)
  slidecraft lint  <input> --fix -o <output> Apply automatic fixes and write the result

Formats (by extension): .md (Markdown), .json (SlideCraft), .pptx (PowerPoint), .html (slideshow, output only)
Examples:
  slidecraft build talk.md -o talk.pptx
  slidecraft build talk.pptx -o talk.md
  slidecraft lint talk.pptx --fix -o talk-fixed.pptx
`;

async function readDeck(file: string): Promise<{ deck: Deck; warnings: string[] }> {
  const ext = extname(file).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return { deck: markdownToDeck(readFileSync(file, 'utf8')), warnings: [] };
  if (ext === '.json') return { deck: normalizeDeck(JSON.parse(readFileSync(file, 'utf8'))), warnings: [] };
  if (ext === '.pptx') {
    const buf = readFileSync(file);
    const { deck, warnings } = await pptxToDeck(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, basename(file));
    return { deck: normalizeDeck(deck), warnings };
  }
  throw new Error(`Unsupported input "${file}" — use .md, .json or .pptx`);
}

async function writeDeck(deck: Deck, file: string) {
  const ext = extname(file).toLowerCase();
  if (ext === '.pptx') writeFileSync(file, Buffer.from(await deckToPptxArrayBuffer(deck)));
  else if (ext === '.html') writeFileSync(file, deckToHtml(deck));
  else if (ext === '.json') writeFileSync(file, JSON.stringify({ ...deck, version: 2 }, null, 2));
  else if (ext === '.md' || ext === '.markdown') writeFileSync(file, deckToMarkdown(deck));
  else throw new Error(`Unsupported output "${file}" — use .pptx, .html, .json or .md`);
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(argv: string[]): Promise<number> {
  const [command, input, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') { process.stdout.write(HELP); return 0; }
  if (!input) { process.stderr.write(`Missing input file.\n\n${HELP}`); return 2; }
  const out = option(rest, '-o') ?? option(rest, '--out');
  const { deck, warnings } = await readDeck(input);
  warnings.forEach(w => process.stderr.write(`warning: ${w}\n`));

  if (command === 'build' || command === 'convert') {
    if (!out) { process.stderr.write('Missing -o <output>.\n'); return 2; }
    await writeDeck(deck, out);
    process.stdout.write(`✓ ${basename(input)} → ${out} (${deck.slides.length} slide${deck.slides.length !== 1 ? 's' : ''})\n`);
    return 0;
  }

  if (command === 'lint') {
    const ctx = defaultLintContext(deck);
    const issues = lintDeck(deck, ctx);
    if (rest.includes('--fix')) {
      if (!out) { process.stderr.write('--fix needs -o <output>.\n'); return 2; }
      const fixable = issues.filter(i => i.fix);
      const fixed = produce(deck, d => { fixable.forEach(i => fixIssue(d as Deck, i, ctx)); });
      await writeDeck(fixed, out);
      const remaining = lintDeck(fixed, ctx);
      process.stdout.write(`✓ Fixed ${fixable.length} issue${fixable.length !== 1 ? 's' : ''}; ${remaining.length} remaining → ${out}\n`);
      return remaining.some(i => i.severity === 'error') ? 1 : 0;
    }
    if (rest.includes('--json')) {
      process.stdout.write(JSON.stringify(issues, null, 2) + '\n');
    } else if (!issues.length) {
      process.stdout.write(`✓ ${basename(input)}: no design issues\n`);
    } else {
      for (const i of issues) {
        const where = i.slide >= 0 ? `slide ${i.slide + 1}` : 'deck';
        process.stdout.write(`${i.severity.padEnd(7)} ${where.padEnd(9)} ${RULES[i.rule].title}: ${i.message}${i.fix ? `  [fix: ${i.fix}]` : ''}\n`);
      }
      const n = (s: string) => issues.filter(i => i.severity === s).length;
      process.stdout.write(`\n${n('error')} errors, ${n('warning')} warnings, ${n('info')} tips — ${issues.filter(i => i.fix).length} fixable with --fix\n`);
    }
    return issues.some(i => i.severity === 'error') ? 1 : 0;
  }

  process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
  return 2;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, err => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
