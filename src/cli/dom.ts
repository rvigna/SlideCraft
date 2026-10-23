/* Give the shared browser code (DOMParser, Node, Element…) a DOM when running under Node. */
import { JSDOM, VirtualConsole } from 'jsdom';

const quiet = new VirtualConsole(); // swallow jsdom's "not implemented: canvas" notices
const { window } = new JSDOM('<!doctype html><html><body></body></html>', { virtualConsole: quiet });
const g = globalThis as Record<string, unknown>;
for (const key of ['window', 'document', 'DOMParser', 'Node', 'Element', 'HTMLElement', 'Image', 'navigator']) {
  if (!(key in g) || g[key] === undefined) g[key] = (window as unknown as Record<string, unknown>)[key];
}
