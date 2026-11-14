// ===== PRELUDE — paste at the top of EVERY use_figma script. Set PAGE_ID to your own page. =====
const PAGE_ID = '__YOUR_PAGE_ID__';
const page = await figma.getNodeByIdAsync(PAGE_ID); await figma.setCurrentPageAsync(page);
const F = await figma.getNodeByIdAsync('8:99'); await F.loadAsync(); // Foundations (read-only)
await Promise.all(['Regular', 'Medium', 'Semi Bold'].map(s => figma.loadFontAsync({ family: 'Inter', style: s })));
const V = {}; for (const v of await figma.variables.getLocalVariablesAsync()) V[v.name] = v;
const TS = {}; for (const s of await figma.getLocalTextStylesAsync()) TS[s.name.replace('LG/', '')] = s;
const ES = {}; for (const s of await figma.getLocalEffectStylesAsync()) ES[s.name.replace('LG/', '')] = s;
// paints: ALWAYS a variable, NEVER paint opacity (it is lost through nested instances)
// The paint's base colour is the variable's Light value, so an override inside a nested instance still renders correctly.
const _LIGHT = (await figma.variables.getLocalVariableCollectionsAsync()).find(c => c.name === 'LG / Color').modes.find(m => m.name === 'Light').modeId;
const paint = n => { if (!V[n]) throw new Error('no variable ' + n); const v = V[n].valuesByMode[_LIGHT]; const base = v && typeof v.r === 'number' ? { type: 'SOLID', color: { r: v.r, g: v.g, b: v.b }, opacity: v.a == null ? 1 : v.a } : { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }; return figma.variables.setBoundVariableForPaint(base, 'color', V[n]); };
const fill = (n, c) => { n.fills = c ? [paint(c)] : []; return n; };
const stroke = (n, c, w) => { n.strokes = [paint(c)]; n.strokeWeight = w || 1; n.strokeAlign = 'INSIDE'; return n; };
const side = (n, c, s) => { n.strokes = [paint(c)]; n.strokeAlign = 'INSIDE'; n.strokeTopWeight = s === 'top' ? 1 : 0; n.strokeBottomWeight = s === 'bottom' ? 1 : 0; n.strokeLeftWeight = s === 'left' ? 1 : 0; n.strokeRightWeight = s === 'right' ? 1 : 0; return n; };
const rad = (n, r) => { if (typeof r === 'number') n.cornerRadius = r; else for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(k, V[r]); return n; };
// auto-layout frame. o: name, gap, p/px/py/pt/pb/pl/pr, align (counter axis: MIN|CENTER|MAX), justify (primary: MIN|CENTER|MAX|SPACE_BETWEEN),
// w, h (fixed px; omitted axis hugs), wrap, wrapGap, bg (colour variable name), stroke (variable name), r (radius variable name or number), clip
function lay(f, dir, o) {
  o = o || {}; f.layoutMode = dir; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; f.fills = [];
  if (o.name) f.name = o.name; f.itemSpacing = o.gap || 0; const p = o.p || 0;
  f.paddingLeft = o.pl ?? o.px ?? p; f.paddingRight = o.pr ?? o.px ?? p; f.paddingTop = o.pt ?? o.py ?? p; f.paddingBottom = o.pb ?? o.py ?? p;
  f.counterAxisAlignItems = o.align || 'MIN'; f.primaryAxisAlignItems = o.justify || 'MIN';
  if (o.w != null || o.h != null) { const H = dir === 'HORIZONTAL'; f.resize(o.w ?? Math.max(f.width, 1), o.h ?? Math.max(f.height, 1)); const wm = o.w != null ? 'FIXED' : 'AUTO', hm = o.h != null ? 'FIXED' : 'AUTO'; f.primaryAxisSizingMode = H ? wm : hm; f.counterAxisSizingMode = H ? hm : wm; }
  if (o.wrap) { f.layoutWrap = 'WRAP'; f.counterAxisSpacing = o.wrapGap ?? o.gap ?? 0; }
  if (o.bg) fill(f, o.bg); if (o.stroke) stroke(f, o.stroke); if (o.r != null) rad(f, o.r); if (o.clip) f.clipsContent = true; return f;
}
const AL = (dir, o) => lay(figma.createFrame(), dir, o); // dir: 'VERTICAL' | 'HORIZONTAL'
// add(parent, child, {fw, fh}) — append FIRST, then fill width / height. Text with fw wraps.
const add = (p, c, o) => { p.appendChild(c); o = o || {}; if (o.fw) { if (c.type === 'TEXT') c.textAutoResize = 'HEIGHT'; c.layoutSizingHorizontal = 'FILL'; } if (o.fh) c.layoutSizingVertical = 'FILL'; return c; };
// T(text, style, colourVar, name) — style is an LG text style: Title, Heading, Body, Body Medium, Body Semibold, Small, Small Medium, Label, Caption, Caption Medium, Stat Label, Tab Label, Input Phone
async function T(s, style, color, name) { if (!TS[style]) throw new Error('no text style ' + style); const t = figma.createText(); await t.setTextStyleIdAsync(TS[style].id); t.characters = s; fill(t, color || 'foreground'); if (name) t.name = name; return t; }
// TW: wrapping text at a fixed width (use when the parent hugs)
async function TW(s, style, color, width) { const t = await T(s, style, color); t.textAutoResize = 'HEIGHT'; t.resize(width, t.height); return t; }
// card recipe
const card = o => AL('VERTICAL', Object.assign({ name: 'Card', bg: 'card', stroke: 'border', r: 'radius-md', clip: true }, o || {}));
// components
const IC = {}, CS = {};
for (const c of F.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })) { if (c.name.startsWith('Icon/')) IC[c.name.slice(5)] = c; else if (!(c.type === 'COMPONENT' && c.parent.type === 'COMPONENT_SET')) CS[c.name] = c; }
const variant = (set, props) => set.children.find(c => { const p = Object.fromEntries(c.name.split(', ').map(x => x.split('='))); return Object.entries(props).every(([k, v]) => p[k] === v); });
// I('Button', {Variant:'Primary', Size:'Default', State:'Default'}) — give ALL variant axes for a set; omit props for single components
const I = (name, props) => { const c = CS[name]; if (!c) throw new Error('no component ' + name); const m = c.type === 'COMPONENT_SET' ? (props ? variant(c, props) : c.defaultVariant) : c; if (!m) throw new Error('no variant ' + name + ' ' + JSON.stringify(props)); return m.createInstance(); };
// setP(instance, {Label:'Save', 'Leading icon':true, Icon: IC.plus.id}) — by property NAME; works for variant, text, boolean and swap props. Append the instance to its parent first.
const setP = (i, o) => { const m = {}; const have = Object.keys(i.componentProperties); for (const k of have) { const n = k.split('#')[0]; if (n in o) m[k] = o[n]; } const missing = Object.keys(o).filter(n => !have.some(k => k.split('#')[0] === n)); if (missing.length) throw new Error('no prop ' + missing.join(',') + ' on ' + i.name); i.setProperties(m); return i; };
const sub = (i, name) => { const n = i.findOne(x => x.name === name); if (!n) throw new Error('no child ' + name + ' in ' + i.name); return n; };
// swap(instance, 'Sidebar', {Role:'Tenant', Active:'Home'}) — change which variant an existing instance uses, keeping overrides
const swap = (i, name, props) => { const m = variant(CS[name], props); if (!m) throw new Error('no variant ' + name + ' ' + JSON.stringify(props)); i.swapComponent(m); return i; };
// icons: icon('wrench', 16, 'muted-foreground'); after an Icon swap via setP, re-tint with tint(inst.findOne(n => n.type === 'INSTANCE'), 'colourVar')
const tint = (i, color) => { for (const n of i.findAll(x => 'strokes' in x && x.type !== 'FRAME' && x.type !== 'GROUP' && x.type !== 'INSTANCE')) { if (n.strokes.length) n.strokes = [paint(color)]; if (n.fills.length) n.fills = [paint(color)]; } return i; };
const icon = (name, size, color) => { if (!IC[name]) throw new Error('no icon ' + name); const i = IC[name].createInstance(); if (size) i.resize(size, size); if (color) tint(i, color); return i; };
// rows: mkRow(parent, 'Desktop'|'Phone', {t, c, s, n, pri, unread, meta, icon, noStatus, noChevron})
function mkRow(parent, layout, o) {
  const r = I('List Row', { Layout: layout, State: 'Default' }); parent.appendChild(r); r.layoutSizingHorizontal = 'FILL';
  setP(r, { Title: o.t, Context: o.c || '', 'Show priority': !!o.pri, Unread: !!o.unread, 'Show status': !o.noStatus, 'Show meta': !!o.meta, Meta: o.meta || '', 'Show chevron': !o.noChevron, 'Show icon': !!o.icon });
  if (o.icon) { setP(r, { Icon: IC[o.icon].id }); }
  if (!o.noStatus) { const st = sub(r, 'Status'); setP(st, { Status: o.s }); setP(st, { 'Next step': o.n || '', 'Show next step': !!o.n }); }
  if (o.pri) setP(sub(r, 'Priority'), { Priority: o.pri });
  return r;
}
// templates: shell('desktop'|'phone'|'form', 'Frame name') returns a clone; you MUST place it with slot(). Children are named
// desktop: Sidebar, Main > Header, Content.  phone: Header, Content, Sticky action, Tab bar.  form: Header, Content, Sticky action.
const TPL = { desktop: '18:2109', phone: '18:2362', form: '18:2500' };
async function shell(kind, name) { const t = await figma.getNodeByIdAsync(TPL[kind]); const c = t.clone(); c.name = name; page.appendChild(c); return c; }
const clearContent = frame => { const c = sub(frame, 'Content'); for (const ch of [...c.children]) ch.remove(); return c; };
// page board: everything lives in one auto-layout Board so nothing overlaps.
function D(s, size, style, color) { const t = figma.createText(); t.fontName = { family: 'Inter', style: style || 'Regular' }; t.fontSize = size; t.lineHeight = { unit: 'PERCENT', value: 130 }; t.characters = s; fill(t, color || 'foreground'); return t; }
function board() { let b = page.children.find(n => n.name === 'Board'); if (!b) { b = AL('VERTICAL', { name: 'Board', gap: 200, p: 120 }); page.appendChild(b); b.x = 0; b.y = 0; b.appendChild(D(page.name, 72, 'Semi Bold')); } return b; }
// row('N3 — Request page · Admin', 'one line on what this row shows') → returns the horizontal Screens container (created once, reused by name)
function row(title, note) {
  const b = board(); let r = b.children.find(n => n.name === 'Row / ' + title);
  if (!r) { r = AL('VERTICAL', { name: 'Row / ' + title, gap: 32 }); b.appendChild(r); r.appendChild(D(title, 40, 'Semi Bold')); if (note) r.appendChild(D(note, 20, 'Regular', 'muted-foreground')); r.appendChild(AL('HORIZONTAL', { name: 'Screens', gap: 120, align: 'MIN' })); }
  return r.children.find(n => n.name === 'Screens');
}
// slot(screens, 'Desktop · Default', frame) — labels and places one screen frame in a row
function slot(screens, label, frame) { const w = AL('VERTICAL', { name: 'Slot / ' + label, gap: 16 }); screens.appendChild(w); w.appendChild(D(label, 22, 'Medium', 'muted-foreground')); w.appendChild(frame); return frame; }
// overlay(frame) — dims a finished screen frame for a dialog / drawer / sheet; then append your dialog and position it absolutely
function overlay(frame) { const ov = figma.createRectangle(); ov.name = 'Scrim'; frame.appendChild(ov); ov.layoutPositioning = 'ABSOLUTE'; ov.x = 0; ov.y = 0; ov.resize(frame.width, frame.height); fill(ov, 'overlay'); return ov; }
function floatIn(frame, node, x, y) { frame.appendChild(node); node.layoutPositioning = 'ABSOLUTE'; node.x = x; node.y = y; return node; }
// dialog recipe: const d = dialog(512); add Dialog Header, fields, Dialog Footer (each fill width); then overlay(screen); floatIn(screen, d, (screen.width-512)/2, 120)
async function dialog(w) { const d = AL('VERTICAL', { name: 'Dialog', w: w || 512, p: 20, gap: 16, bg: 'card', r: 'radius-lg' }); await d.setEffectStyleIdAsync(ES.Float.id); return d; }
// ===== END PRELUDE =====
