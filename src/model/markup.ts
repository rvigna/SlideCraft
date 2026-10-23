/* A small DOM-like tree for OOXML parts and rich-text fragments.
   DOMParser doesn't exist in workers and the CLI, so both the importer and the text helpers parse with this instead.
   It supports the subset of the DOM they use: elements, text, attributes, namespaces, and a few traversal helpers. */

export interface Attr {
  name: string;
  localName: string;
  prefix: string | null;
  namespaceURI: string | null;
  value: string;
}

export interface CssLite {
  color: string; fontSize: string; fontFamily: string; fontWeight: string; fontStyle: string; textDecoration: string;
  [property: string]: string;
}

export class Text {
  readonly nodeType = 3;
  parentElement: El | null = null;
  constructor(public data: string) {}
  get textContent(): string { return this.data; }
}

export class El {
  readonly nodeType = 1;
  parentElement: El | null = null;
  childNodes: Array<El | Text> = [];
  attributes: Attr[] = [];
  readonly localName: string;
  readonly prefix: string | null;
  readonly tagName: string;
  namespaceURI: string | null = null;
  /** Namespace declarations in scope (prefix → URI); '' is the default namespace */
  ns: Record<string, string> = {};

  constructor(qname: string, readonly ownerDocument: Doc, readonly html: boolean) {
    const i = qname.indexOf(':');
    this.prefix = i >= 0 ? qname.slice(0, i) : null;
    this.localName = i >= 0 ? qname.slice(i + 1) : qname;
    this.tagName = html ? qname.toUpperCase() : qname;
  }

  get children(): El[] { return this.childNodes.filter((n): n is El => n instanceof El); }
  get firstChild(): El | Text | null { return this.childNodes[0] ?? null; }
  get firstElementChild(): El | null { return this.children[0] ?? null; }
  get textContent(): string { return this.childNodes.map(n => n.textContent).join(''); }

  /** Inline style, read the way the browser exposes it (camelCase keys, '' when absent) */
  get style(): CssLite {
    const out: CssLite = { color: '', fontSize: '', fontFamily: '', fontWeight: '', fontStyle: '', textDecoration: '' };
    for (const decl of (this.getAttribute('style') ?? '').split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const key = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      out[key] = decl.slice(i + 1).trim();
    }
    return out;
  }

  getAttribute(name: string): string | null {
    return this.attributes.find(a => a.name === name)?.value ?? null;
  }

  /** Every descendant with this local name ('*' for all) */
  getElementsByTagName(name: string): El[] {
    const out: El[] = [];
    const walk = (el: El) => {
      for (const c of el.children) {
        if (name === '*' || c.localName === name) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  appendChild(child: El | Text): El | Text {
    child.parentElement?.childNodes.splice(child.parentElement.childNodes.indexOf(child), 1);
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  cloneNode(deep = false): El {
    const copy = new El(this.tagName, this.ownerDocument, this.html);
    Object.assign(copy, { prefix: this.prefix, namespaceURI: this.namespaceURI, ns: this.ns, attributes: this.attributes.map(a => ({ ...a })) });
    if (deep) for (const c of this.childNodes) copy.appendChild(c instanceof El ? c.cloneNode(true) : new Text(c.data));
    return copy;
  }
}

export class Doc {
  documentElement: El | null = null;
  constructor(readonly html: boolean) {}
  createElement(name: string): El { return new El(name, this, this.html); }
  /** Like the DOM: the root and all its descendants with this local name ('*' for all) */
  getElementsByTagName(name: string): El[] {
    const root = this.documentElement;
    return root ? [...(name === '*' || root.localName === name ? [root] : []), ...root.getElementsByTagName(name)] : [];
  }
}

const VOID = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'SOURCE', 'WBR']);
const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const HTML_ENTITIES: Record<string, string> = {
  ...XML_ENTITIES, nbsp: ' ', copy: '©', reg: '®', middot: '·', bull: '•', mdash: '—', ndash: '–',
  hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', rarr: '→', larr: '←', euro: '€', pound: '£',
};

function decode(s: string, html: boolean): string {
  if (!s.includes('&')) return s;
  const table = html ? HTML_ENTITIES : XML_ENTITIES;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return table[e] ?? match;
  });
}

// One token: comment, CDATA, processing instruction, declaration, or a start/end tag
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Parse an XML part (namespaces resolved) or an HTML fragment (tags upper-cased, void elements and entities handled) */
export function parseMarkup(src: string, html: boolean): Doc {
  const doc = new Doc(html);
  const container = new El('#document', doc, html);
  const stack: El[] = [container];
  const top = () => stack[stack.length - 1];
  let at = 0;
  const text = (end: number) => {
    if (end > at) top().appendChild(new Text(decode(src.slice(at, end), html)));
  };

  TOKEN.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = TOKEN.exec(src)); at = TOKEN.lastIndex) {
    text(m.index);
    if (m[1] !== undefined) { top().appendChild(new Text(m[1])); continue; } // CDATA
    if (m[0].startsWith('<!') || m[0].startsWith('<?')) continue;
    const [, , closing, qname, attrSrc, selfClosing] = m;
    if (closing) {
      // Close the nearest matching open element; stray closers are ignored
      const want = html ? qname.toUpperCase() : qname;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === want) { stack.length = i; break; }
      }
      continue;
    }
    const el = doc.createElement(qname);
    el.ns = top().ns;
    for (const a of attrSrc.matchAll(ATTR)) {
      const name = a[1];
      const value = decode(a[2] ?? a[3] ?? a[4] ?? '', html);
      if (!html && (name === 'xmlns' || name.startsWith('xmlns:'))) {
        if (el.ns === top().ns) el.ns = { ...el.ns };
        el.ns[name === 'xmlns' ? '' : name.slice(6)] = value;
      }
      const i = name.indexOf(':');
      el.attributes.push({ name, localName: i >= 0 ? name.slice(i + 1) : name, prefix: i >= 0 ? name.slice(0, i) : null, namespaceURI: null, value });
    }
    if (!html) {
      el.namespaceURI = el.ns[el.prefix ?? ''] ?? null;
      for (const a of el.attributes) if (a.prefix) a.namespaceURI = el.ns[a.prefix] ?? null;
    }
    top().appendChild(el);
    if (!selfClosing && !(html && VOID.has(el.tagName))) stack.push(el);
  }
  text(src.length);
  doc.documentElement = container.firstElementChild;
  return doc;
}

/** Parse an OOXML part into a tree */
export function parseXml(src: string): Doc {
  return parseMarkup(src, false);
}

/** The element for a rich-text fragment, wrapped the way the editor stores it */
export function parseHtml(fragment: string): El {
  return parseMarkup(`<div>${fragment}</div>`, true).documentElement!;
}
