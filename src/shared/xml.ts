// A small XML reader for machine-written files such as bank statements
// (CAMT.053). It handles elements, attributes, text, CDATA, comments,
// processing instructions and the standard entities, and nothing more: no
// DTDs, no external entities. Workers have no DOMParser, and the browser's
// would differ from the server's, so both sides use this one.

export interface XmlNode {
  /** Local name, without any namespace prefix: `Ntry`, not `ns2:Ntry`. */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** The element's own text, entities decoded, whitespace kept. */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent] ?? m;
  });
}

const localName = (qname: string) => qname.slice(qname.indexOf(":") + 1);

/** Parses an XML document and returns its root element. Throws on malformed input. */
export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt === -1) {
      top.text += decode(src.slice(i));
      break;
    }
    if (lt > i) top.text += decode(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end === -1) throw new Error("Unclosed comment");
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end === -1) throw new Error("Unclosed CDATA section");
      top.text += src.slice(lt + 9, end);
      i = end + 3;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end === -1) throw new Error("Unclosed processing instruction");
      i = end + 2;
    } else if (src.startsWith("<!", lt)) {
      // A DOCTYPE or other declaration: skipped, never expanded.
      const end = src.indexOf(">", lt + 2);
      if (end === -1) throw new Error("Unclosed declaration");
      i = end + 1;
    } else if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt + 2);
      if (end === -1) throw new Error("Unclosed end tag");
      const name = localName(src.slice(lt + 2, end).trim());
      const open = stack.pop();
      if (!open || open === root || open.name !== name) throw new Error(`Unexpected </${name}>`);
      i = end + 1;
    } else {
      // A start tag. Find its end, skipping '>' inside quoted attribute values.
      let j = lt + 1;
      let quote = "";
      while (j < n) {
        const ch = src[j];
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === ">") {
          break;
        }
        j++;
      }
      if (j >= n) throw new Error("Unclosed start tag");
      let body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) throw new Error("Malformed start tag");
      const node: XmlNode = { name: localName(nameMatch[0]), attrs: {}, children: [], text: "" };
      const attrRe = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(body.slice(nameMatch[0].length)))) {
        node.attrs[localName(m[1])] = decode(m[3] ?? m[4] ?? "");
      }
      top.children.push(node);
      if (!selfClosing) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`);
  const el = root.children[0];
  if (!el) throw new Error("No root element");
  return el;
}

/** The first descendant reached by following child names: `find(ntry, "BookgDt", "Dt")`. */
export function find(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let cur = node;
  for (const name of path) {
    cur = cur?.children.find((c) => c.name === name);
    if (!cur) return undefined;
  }
  return cur;
}

/** Every direct child with this name. */
export function all(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** Trimmed text of the node at `path`, or null when it is missing or empty. */
export function textAt(node: XmlNode | undefined, ...path: string[]): string | null {
  const t = find(node, ...path)?.text.trim();
  return t ? t : null;
}

/** Every element with this name anywhere under `node`, in document order. */
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}
