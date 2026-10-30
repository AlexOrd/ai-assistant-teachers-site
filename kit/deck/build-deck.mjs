// ordynski-dos-kit — deck engine: JSON slides → reveal.js deck inside a CRT monitor.
// Same model as the SP course (vtfk-materials/site/build.mjs → buildDeck), in the DOS look.
//
//   import { renderDeck } from '../kit/deck/build-deck.mjs';
//   fs.writeFileSync('dist/slides/index.html', renderDeck(spec, { kit: '../kit/', head, scripts }));
//
// spec = {
//   title, brand,                         // <title>, text on the monitor chin
//   boot: ['LINE', …],                    // boot sequence lines (optional)
//   nav: [{ href, label, side: 'left'|'right' }],
//   slides: [ { type, …fields } ]         // see TYPES below
// }
// Every slide may have: down:[slides] (vertical details below it), downLabel, heading, note (small italic line), notes (speaker notes), section (menu name),
// status (status text), id, cls.
//
// TYPES
//   title     {kicker, heading, subtitle, who:{name, role}}
//   content   {heading, items[], aside?: {type:'qr'|'terminal'|'code'|'ascii'|'img', …}, shot?: {src, alt, caption}}
//   code      {heading, code (string|lines[]), lang, file, caption, mark:[lineNo…], never:[lineNo…], side?: items[]}
//   compare   {heading, left:{title, items|code}, right:{title, items|code}, vs, kind:'dodont'|'compare'}
//   stats     {heading, items[{value, label, hint?}], after?: items[]}
//   steps     {heading, steps[{t, d?}]}
//   flow      {heading, nodes[{t, sub?, c?}]}
//   grid      {heading, cells[{icon?, t, d}]}
//   table     {heading, columns[], rows[][]}
//   ascii     {heading, art (string), hl?: [words]}
//   quote     {text, by}
//   demo      {heading, steps[], expect}
//   terminal  {heading, title, prompt, steps[{cmd,out[],note,prompt?}], step:true}
//   qr        {heading, qr:{mc|value, caption}, items[], muted}
//   poll      {poll:'q1', question, qr?:{mc|value, caption}}   // qr = where to vote (the channel)
//   timer     {heading, minutes, text}
//   dialog    {title, heading, items[], text, variant:'danger'|'info', button}
//   panic     {kicker, heading, alert, lines[], prompt, growth:{label, points[{y,v}]}, wave[{t, sub, icon, state:'now'|'here'|'next'}]}
//   section   {title, heading, progress:0..1, path, phases?:[names]}
//   end       {heading, items[], qr?:{mc|value, caption}, who}
//   hub       {heading, center:{t, sub, icon, c}, nodes[{t, sub, icon, c, edge, pos?:[x,y], dir?:'in'|'out'|'both'}]} // architecture
//   service   {kicker, name, what, icon, c, flow[{t, icon?, code?}] (3 steps), tiles[{v, l, c?}] (metrics), why, labels?:{why}}
//   bars      {heading, items[{label, value|values[], icon?, c?} | {group}], unit:'%', pre?:'$', max?, legend?:[…], big?:{value,label,c}}
//   rings     {heading, items[{value(0..100), label, sub?, c?}]}
//   seq       {heading, actors[{t, sub?, icon?, c?}], msgs[{from, to, t, c?, dash?}], step?:true}   // sequence diagram
//   algo      {heading, nodes[{t, kind:'start'|'step'|'if'|'end', no?, c?}], side?: items[]}      // flowchart
//   chat      {heading, title, msgs[{from:'me'|'bot', t}], side?: items[], note}                   // phone chat mockup
//   html      {html}                       // escape hatch, trusted content only
// Any slide: source (small line at the bottom: where a number comes from); icon names = kit/icons/sprite.svg (i-*)

import fs from 'node:fs';
let SPRITE = null;
function ico(name, cls = '') {
  if (!name) return '';
  if (!SPRITE) {
    SPRITE = {};
    try { const t = fs.readFileSync(new URL('../icons/sprite.svg', import.meta.url), 'utf8');
      for (const m of t.matchAll(/<symbol id="i-([\w-]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)) SPRITE[m[1]] = [m[2], m[3]]; } catch (e) {}
  }
  const sv = SPRITE[String(name).replace(/^i-/, '')];
  return sv ? `<svg class="dk-ico ${cls}" viewBox="${sv[0]}" aria-hidden="true">${sv[1]}</svg>` : `<span class="dk-ico dk-ico-t ${cls}">${esc(name)}</span>`;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// inline: **bold**, `code`, *muted*
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g, '$1<i class="mut">$2</i>');
const lis = items => (items || []).map(i => `<li>${inl(i)}</li>`).join('');

// ---- code highlighting at build time (adapted from vtfk-materials buildDeck) ----
const KW = {
  bash: 'docker|git|sudo|echo|cat|ls|cd|grep|curl|export|if|then|fi|for|do|done|in|function|return|exit|node|npm|python3|chmod|rm|mkdir',
  js: 'const|let|var|function|return|if|else|for|while|await|async|import|export|from|new|class|this|try|catch|throw|typeof|true|false|null|undefined',
};
function hl(code, lang) {
  lang = String(lang || 'text').toLowerCase();
  if (['sh', 'shell', 'console'].includes(lang)) lang = 'bash';
  if (['javascript', 'gs', 'apps-script'].includes(lang)) lang = 'js';
  const kw = KW[lang] || ''; const re = kw ? new RegExp(`(^|[^\\w$-])(${kw})(?![\\w-])`, 'g') : null;
  return String(code).split('\n').map(line => {
    let t = esc(line); let cm = '';
    const ci = lang === 'js' ? t.search(/\/\/|\/\*/) : lang === 'bash' ? t.search(/(^|\s)#(?!!)/) : -1;
    if (ci >= 0) { cm = t.slice(ci); t = t.slice(0, ci); }
    // strings first, then keywords / numbers / function names only OUTSIDE already-tagged spans
    t = t.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*`)/g, '\u0001$1\u0002');
    t = t.split(/(\u0001[^\u0002]*\u0002)/).map(part => {
      if (part.startsWith('\u0001')) return '<i class="k-str">' + part.slice(1, -1) + '</i>';
      if (re) part = part.replace(re, '$1\u0003$2\u0004');
      part = part.replace(/(^|[^\w.#&])(\d+(?:\.\d+)?)(?![\w;])/g, '$1\u0005$2\u0006');
      if (lang === 'js') part = part.replace(/([A-Za-z_$][\w$]*)(?=\()/g, (m, n, o, all) => all[o - 1] === '\u0003' ? m : '\u0007' + n + '\u0008');
      return part.replace(/\u0003/g, '<b class="k-kw">').replace(/\u0004/g, '</b>').replace(/\u0005/g, '<em class="k-num">').replace(/\u0006/g, '</em>')
        .replace(/\u0007/g, '<u class="k-fn">').replace(/\u0008/g, '</u>');
    }).join('');
    if (lang === 'bash') t = t.replace(/(^\s*)(\$|&gt;)(\s)/, '$1<span class="k-prompt">$2</span>$3');
    return t + (cm ? `<span class="k-cm">${cm}</span>` : '');
  }).join('\n');
}
function codeBlock(c) {
  const lines = hl([].concat(c.code || []).join('\n'), c.lang).split('\n');
  const mark = new Set(c.mark || []), never = new Set(c.never || []);
  const body = lines.map((l, i) => never.has(i + 1) ? `<span class="ln-never">${l}</span>` : mark.has(i + 1) ? `<span class="ln-mark">${l}</span>` : l).join('\n');
  return `<div class="dos-code dk-code" data-file="${esc(c.file || c.lang || 'код')}"><pre><code>${body}</code></pre></div>${c.caption ? `<p class="dk-cap">${inl(c.caption)}</p>` : ''}`;
}
const head = (s, tag = 'h2') => s.heading ? `<${tag} class="s-head">${inl(s.heading)}</${tag}>` : '';
const note = s => s.note ? `<p class="dk-note">${inl(s.note)}</p>` : '';
const qr = q => q ? `<dos-qr ${q.mc ? `data-mc-qr="${esc(q.mc)}"` : `value="${esc(q.value)}"`} caption="${esc(q.caption || '')}"${q.size ? ` size="${esc(q.size)}"` : ''}></dos-qr>` : '';
const terminal = s => `<dos-terminal title="${esc(s.title || 'bash')}" prompt="${esc(s.prompt || '$')}"${s.step === false ? '' : ' step'}><script type="application/json">${JSON.stringify(s.steps || []).replace(/</g, '\\u003c')}</script></dos-terminal>`;
// handle: {mc:'botName', hide:'bot'} → big text filled by the page config (e.g. the bot's @username)
const handle = s => s.handle ? `<p class="dk-handle" data-mc-text="${esc(s.handle.mc)}"${s.handle.hide ? ` data-mc-hide-empty="${esc(s.handle.hide)}"` : ''}>${esc(s.handle.text || '')}</p>` : '';
// screenshot: {src, alt, caption?} — a real screen, framed; used as aside {type:'img'} or slide-level `shot` (full width, below)
const shot = a => a ? `<figure class="dk-shot${a.cls ? ' ' + esc(a.cls) : ''}"><img src="${esc(a.src)}" alt="${esc(a.alt || '')}" loading="lazy">${a.caption ? `<figcaption>${inl(a.caption)}</figcaption>` : ''}</figure>` : '';
const aside = a => !a ? '' : a.type === 'img' ? shot(a) : a.type === 'qr' ? `<div class="dk-center">${qr(a)}</div>` : a.type === 'terminal' ? terminal(a) : a.type === 'code' ? codeBlock(a) : a.type === 'ascii' ? `<pre class="dos-ascii dk-ascii">${esc(a.art)}</pre>` : '';
const two = (a, b, cls = '') => `<div class="s-two ${cls}"><div>${a}</div><div>${b}</div></div>`;

function slide(s) {
  const attrs = [`class="sl sl-${esc(s.type)}${s.cls ? ' ' + esc(s.cls) : ''}${s.type === 'end' ? ' is-end' : ''}${s.type === 'poll' ? ' layout-poll' : ''}"`];
  if (s.section) attrs.push(`data-section="${esc(s.section)}"`);
  if (s.status) attrs.push(`data-status="${esc(s.status)}"`);
  if (s.id) attrs.push(`id="${esc(s.id)}"`);
  const notes = s.notes ? `<aside class="notes">${esc(s.notes)}</aside>` : '';
  const src = s.source ? `<p class="dk-src">${inl(s.source)}</p>` : '';
  const down = s.down && s.down.length ? `<div class="dk-down" aria-hidden="true">↓ ${s.downLabel ? esc(s.downLabel) : 'деталі'} · ${s.down.length}</div>` : '';
  const sec = inner => `<section ${attrs.join(' ')}>${inner}${src}${down}${notes}</section>`;
  switch (s.type) {
    case 'title':
      return sec(`${s.icon ? `<div class="dk-hero">${ico(s.icon)}</div>` : ''}${s.kicker ? `<div class="dk-kicker">${inl(s.kicker)}</div>` : ''}<h1>${inl(s.heading)}</h1>${s.subtitle ? `<p class="dk-sub">${inl(s.subtitle)}</p>` : ''}${s.who ? `<div class="dk-who"><b>${esc(s.who.name)}</b><span>${inl(s.who.role || '')}</span></div>` : ''}`);
    case 'content': {
      const list = `<ul>${lis(s.items)}</ul>${note(s)}`;
      return sec(head(s) + (s.aside ? two(list, aside(s.aside)) : list) + shot(s.shot));
    }
    case 'code':
      return sec(head(s, 'h3') + (s.side ? two(codeBlock(s), `<ul>${lis(s.side)}</ul>`, 'wide-left') : codeBlock(s)) + note(s));
    case 'compare': {
      const side = (x, cls) => `<div class="side ${cls}"><div class="st">${inl(x.title || '')}</div>${x.code ? codeBlock(x.code) : ''}${x.items ? `<ul>${lis(x.items)}</ul>` : ''}</div>`;
      const k = s.kind === 'dodont';
      return sec(head(s) + `<div class="dk-compare${k ? ' dodont' : ''}">${side(s.left || {}, k ? 'no' : 'a')}${k ? '' : `<div class="vs">${esc(s.vs || 'vs')}</div>`}${side(s.right || {}, k ? 'yes' : 'b')}</div>` + note(s));
    }
    case 'stats':
      return sec(head(s) + `<div class="dk-stats n${(s.items || []).length}">${(s.items || []).map(it => `<div class="stat${it.c ? ' c-' + esc(it.c) : ''}">${ico(it.icon)}<div class="v">${esc(it.value)}</div><div class="l">${inl(it.label || '')}</div>${it.hint ? `<div class="h">${inl(it.hint)}</div>` : ''}</div>`).join('')}</div>` + (s.after ? `<ul class="after">${lis(s.after)}</ul>` : '') + note(s));
    case 'steps':
      return sec(head(s) + `<ol class="dk-steps">${(s.steps || []).map((st, i) => { const o = typeof st === 'string' ? { t: st } : st; return `<li><span class="n">${i + 1}</span><div><b>${inl(o.t)}</b>${o.d ? `<span>${inl(o.d)}</span>` : ''}</div></li>`; }).join('')}</ol>` + note(s));
    case 'flow':
      return sec(head(s) + `<div class="dk-flow n${(s.nodes || []).length}">${(s.nodes || []).map((n, i) => `${i ? '<span class="arr">►</span>' : ''}<div class="node c-${esc(n.c || 'cyan')}">${ico(n.icon)}<b>${inl(n.t)}</b>${n.sub ? `<span>${inl(n.sub)}</span>` : ''}</div>`).join('')}</div>` + note(s));
    case 'grid':
      return sec(head(s) + `<div class="dk-grid n${(s.cells || []).length}">${(s.cells || []).map(c => `<div class="cell">${c.icon ? `<div class="ci">${ico(c.icon)}</div>` : ''}<b>${inl(c.t)}</b><span>${inl(c.d || '')}</span></div>`).join('')}</div>` + note(s));
    case 'table':
      return sec(head(s) + `<div class="dk-table"><table><thead><tr>${(s.columns || []).map(c => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${(s.rows || []).map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' class="first"'}>${inl(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` + note(s));
    case 'ascii': {
      let art = esc(s.art || '');
      for (const w of s.hl || []) art = art.split(esc(w)).join(`<span class="hl">${esc(w)}</span>`);
      return sec(head(s) + `<pre class="dk-ascii">${art}</pre>` + note(s));
    }
    case 'quote':
      return sec(`<blockquote class="dk-quote">${inl(s.text)}</blockquote>${s.by ? `<p class="dk-by">— ${inl(s.by)}</p>` : ''}`);
    case 'demo':
      return sec(head(s, 'h3') + `<ol>${lis(s.steps)}</ol>${s.expect ? `<p class="dk-expect"><b>Очікувано:</b> ${inl(s.expect)}</p>` : ''}`);
    case 'terminal':
      return sec(head(s) + terminal(s) + note(s));
    case 'qr':
      return sec(two(`${head(s)}${handle(s)}<ul>${lis(s.items)}</ul>${s.muted ? `<p class="dk-note">${inl(s.muted)}</p>` : ''}`, `<div class="dk-center">${qr(s.qr)}</div>`, 'qr-row'));
    case 'poll':
      { const poll = `<dos-poll data-mc-poll="${esc(s.poll || 'q1')}" question="${esc(s.question || '')}"${s.options ? ` options="${esc(s.options.join('|'))}"` : ''}${s.fallback ? ` fallback="${esc(s.fallback)}"` : ''}></dos-poll>`;
        return sec(s.qr ? two(poll, `<div class="dk-center dk-vote">${qr(s.qr)}</div>`, 'poll-row') : poll); }
    case 'timer':
      { const t = `<div class="dk-center"><dos-timer minutes="${esc(s.minutes || 5)}"></dos-timer></div>${s.text ? `<p class="dk-center-text">${inl(s.text)}</p>` : ''}`;
        return sec(head(s) + (s.qr ? two(t, `<div class="dk-center dk-vote">${qr(s.qr)}${handle(s)}</div>`, 'timer-row') : t)); }
    case 'dialog':
      return sec(`<div class="dk-dialog ${esc(s.variant || 'danger')}"><div class="inner"><span class="t">${esc(s.title || 'УВАГА')}</span>${s.heading ? `<h2>${inl(s.heading)}</h2>` : ''}${s.items ? `<ul>${lis(s.items)}</ul>` : ''}${s.text ? `<p>${inl(s.text)}</p>` : ''}<div class="btns"><span>[ ${esc(s.button || 'Зрозуміло')} ]</span></div></div></div>`);
    case 'panic': {
      // fun intro: «kernel panic» terminal + growth columns + industry wave with «ви тут»
      const lines = (s.lines || []).map((l, i) => `<div class="pl" style="--i:${i}">${inl(l)}</div>`).join('');
      const g = s.growth || { points: [] }, gmax = Math.max(...g.points.map(p => p.v), 1);
      const cols = g.points.map((p, i) => `<div class="col" style="--i:${i};--h:${(p.v / gmax * 230).toFixed(0)}px"><b>${esc(p.v)}%</b><div class="bar"></div><span>${esc(p.y)}</span></div>`).join('');
      const wave = (s.wave || []).map((w, i) => `<div class="wv ${esc(w.state || 'next')}" style="--i:${i}">${w.state === 'here' ? '<em>ви тут</em>' : ''}${ico(w.icon)}<b>${inl(w.t)}</b><span>${inl(w.sub || '')}</span></div>`).join('');
      return sec(`${s.kicker ? `<div class="dk-kicker">${inl(s.kicker)}</div>` : ''}${head(s)}<div class="dk-panic"><div class="term"><div class="pt">${esc(s.alert || '*** KERNEL PANIC ***')}</div>${lines}<div class="pl cur" style="--i:${(s.lines || []).length}">${esc(s.prompt || '> press any key to adapt')}<i>_</i></div></div><div class="growth"><div class="gl">${inl(g.label || '')}</div><div class="cols">${cols}</div></div></div><div class="dk-wave"><svg class="line" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 Q 62 0 125 30 T 250 30 T 375 30 T 500 30 T 625 30 T 750 30 T 875 30 T 1000 30"/></svg>${wave}</div>` + note(s));
    }
    case 'section': {
      const p = Math.max(0, Math.min(1, s.progress ?? 0)), on = Math.round(p * 20);
      // phases: ['Бачення', …] → a strip under the dialog: done / current / next (where we are in the talk)
      const cur = s.phases ? Math.max(0, Math.round(p * s.phases.length) - 1) : -1;
      const strip = s.phases ? `<ol class="dk-phases">${s.phases.map((ph, i) => `<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}" style="--i:${i}"><span>${i + 1}</span>${inl(ph)}</li>`).join('')}</ol>` : '';
      return sec(`<div class="dk-dialog info copying"><div class="inner"><span class="t">${esc(s.title || 'Копіювання')}</span><h2>${inl(s.heading)}</h2><div class="dk-progress"><span class="bar">${'█'.repeat(on)}</span><span class="off">${'░'.repeat(20 - on)}</span> ${Math.round(p * 100)}%</div>${s.path ? `<p class="path">${esc(s.path)}</p>` : ''}</div></div>${strip}`);
    }
    case 'end':
      return sec(head(s) + two(`<ul>${lis(s.items)}</ul>${s.who ? `<p class="dk-note">${inl(s.who)}</p>` : ''}`, `<div class="dk-center">${qr(s.qr)}</div>`, 'qr-row'));
    case 'hub': {
      const W = 1760, H = s.height || 760, C = [W / 2, H / 2], N = s.nodes || [];
      const COL = { cyan: '#22E6FF', magenta: '#FF3EC8', green: '#A6FF3A', yellow: '#FFE14D', red: '#FF4D6D' };
      const pos = (n, i) => n.pos || [C[0] + 700 * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / N.length), C[1] + 300 * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / N.length)];
      const lines = N.map((n, i) => {
        const [x, y] = pos(n, i), col = COL[n.c || 'cyan'] || COL.cyan, mx = x + (C[0] - x) * .4, my = y + (C[1] - y) * .4;
        const out = `M${C[0]} ${C[1]} L${x} ${y}`, back = `M${x} ${y} L${C[0]} ${C[1]}`;
        const dots = (n.dir || 'both') === 'both' ? [out, back] : [n.dir === 'in' ? back : out];
        return `<g><line x1="${C[0]}" y1="${C[1]}" x2="${x}" y2="${y}" stroke="${col}" stroke-width="3" stroke-opacity=".55"/>${dots.map((d, j) => `<circle r="7" fill="${col}"><animateMotion dur="2.4s" begin="${(i * .3 + j * 1.2).toFixed(2)}s" repeatCount="indefinite" path="${d}"/></circle>`).join('')}${n.edge ? `<text x="${mx}" y="${my - 12}" text-anchor="middle">${esc(n.edge)}</text>` : ''}</g>`;
      }).join('');
      const node = (n, x, y, cls) => `<div class="hn ${cls} c-${esc(n.c || 'cyan')}" style="left:${(x / W * 100).toFixed(2)}%;top:${(y / H * 100).toFixed(2)}%">${ico(n.icon)}<div><b>${inl(n.t)}</b>${n.sub ? `<span>${inl(n.sub)}</span>` : ''}</div></div>`;
      return sec(head(s) + `<div class="dk-hub" style="aspect-ratio:${W}/${H}"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${lines}</svg>${N.map((n, i) => node(n, ...pos(n, i), 'sat')).join('')}${node(s.center || { t: 'Apps Script' }, C[0], C[1], 'ctr')}</div>` + note(s));
    }
    case 'service': {
      // header (icon + name + what) → "how" as a 3-step flow → metric tiles + "why" card
      const head2 = `<div class="svc-head">${ico(s.icon, 'svc-ico')}<div class="svc-title">${s.kicker ? `<div class="svc-kick">${inl(s.kicker)}</div>` : ''}<h2 class="svc-name">${inl(s.name)}</h2><p class="svc-what">${inl(s.what || '')}</p></div></div>`;
      const steps = (s.flow || (s.how || []).map(t => ({ t }))).map((f, i) => `${i ? '<span class="svc-arr" aria-hidden="true">▸</span>' : ''}<div class="svc-step" style="--i:${i}"><span class="svc-n">${i + 1}</span>${f.icon ? ico(f.icon) : ''}<p>${inl(f.t)}</p>${f.code ? `<code>${esc(f.code)}</code>` : ''}</div>`).join('');
      const tiles = (s.tiles || []).map((t, i) => `<div class="svc-tile c-${esc(t.c || s.c || 'cyan')}" style="--i:${i}"><b>${esc(t.v)}</b><span>${inl(t.l)}</span></div>`).join('');
      const why = s.why ? `<div class="svc-why"><h4>${esc((s.labels || {}).why || 'Чому саме він')}</h4><p>${inl(s.why)}</p></div>` : '';
      return sec(`<div class="dk-svc c-${esc(s.c || 'cyan')}">${head2}<div class="svc-flow">${steps}</div><div class="svc-bottom n${(s.tiles || []).length}">${tiles}${why}</div></div>` + note(s));
    }
    case 'bars': {
      const items = s.items || []; const unit = s.unit ?? '%';
      const max = s.max || Math.max(...items.filter(it => !it.group).flatMap(it => [].concat(it.values ?? it.value)));
      const legend = s.legend ? `<div class="dk-legend">${s.legend.map((l, j) => `<span class="s${j}">${inl(l)}</span>`).join('')}</div>` : '';
      const rows = items.map((it, i) => it.group ? `<div class="grp">${inl(it.group)}</div>` : `<div class="row c-${esc(it.c || 'cyan')}" style="--i:${i}"><div class="lb">${ico(it.icon)}<span>${inl(it.label)}</span></div><div class="track">${[].concat(it.values ?? it.value).map((v, j) => `<div class="fill s${j}" style="--w:${(v / max * 100).toFixed(1)}%"><b>${esc(s.pre || '')}${esc(String(v).replace('.', ','))}${esc(unit)}</b></div>`).join('')}</div></div>`).join('');
      const bars = `<div class="dk-bars">${legend}${rows}</div>`;
      const big = s.big ? `<div class="dk-big c-${esc(s.big.c || 'magenta')}"><div class="v">${esc(s.big.value)}</div><div class="l">${inl(s.big.label || '')}</div></div>` : '';
      return sec(head(s) + (big ? two(bars, big, 'wide-left bars-row') : bars) + note(s));
    }
    case 'rings': {
      const C = 2 * Math.PI * 88;
      const it = (s.items || []).map((r, i) => `<div class="ring c-${esc(r.c || ['cyan', 'magenta', 'green', 'yellow'][i % 4])}" style="--i:${i}"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="bg" cx="110" cy="110" r="88"/><circle class="fg" cx="110" cy="110" r="88" style="--dash:${(C * Math.min(100, r.value) / 100).toFixed(1)};--C:${C.toFixed(1)}"/></svg><div class="v">${esc(r.value)}${esc(r.unit ?? '%')}</div><div class="l">${inl(r.label)}</div>${r.sub ? `<div class="h">${inl(r.sub)}</div>` : ''}</div>`).join('');
      return sec(head(s) + `<div class="dk-rings n${(s.items || []).length}">${it}</div>` + (s.after ? `<ul class="after">${lis(s.after)}</ul>` : '') + note(s));
    }
    case 'seq': {
      const A = s.actors || [], M = s.msgs || [], W = 1760, n = A.length, cx = i => (i + .5) * W / n, rowH = s.rowH || 84, H = 40 + M.length * rowH;
      const idx = k => typeof k === 'number' ? k : A.findIndex(a => a.id === k || a.t === k);
      const COL = { cyan: '#22E6FF', magenta: '#FF3EC8', green: '#A6FF3A', yellow: '#FFE14D', red: '#FF4D6D' };
      const markers = Object.entries(COL).map(([k, c]) => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
      const life = A.map((a, i) => `<line class="life" x1="${cx(i)}" y1="0" x2="${cx(i)}" y2="${H}"/>`).join('');
      const msgs = M.map((m, k) => {
        const a = idx(m.from), b = idx(m.to), y = 44 + k * rowH, c = m.c || 'cyan', col = COL[c] || COL.cyan;
        const x1 = cx(a) + (b > a ? 10 : -10), x2 = cx(b) + (b > a ? -10 : 10);
        const path = a === b ? `M${cx(a)} ${y - 18} h70 v36 h-62` : `M${x1} ${y} L${x2} ${y}`;
        const tx = a === b ? cx(a) + 90 : (x1 + x2) / 2, anchor = a === b ? 'start' : 'middle';
        return `<g class="msg${s.step ? ' fragment' : ''}" style="--k:${k}"><path d="${path}" fill="none" stroke="${col}" stroke-width="4"${m.dash ? ' stroke-dasharray="12 9"' : ''} marker-end="url(#ah-${c})"/><text x="${tx}" y="${a === b ? y + 8 : y - 16}" text-anchor="${anchor}">${esc(m.t)}</text><circle r="8" fill="${col}"><animateMotion dur="1.8s" begin="${(k * .35).toFixed(2)}s" repeatCount="indefinite" path="${path}"/></circle></g>`;
      }).join('');
      const actors = `<div class="dk-actors n${n}">${A.map(a => `<div class="actor c-${esc(a.c || 'cyan')}">${ico(a.icon)}<b>${inl(a.t)}</b>${a.sub ? `<span>${inl(a.sub)}</span>` : ''}</div>`).join('')}</div>`;
      return sec(head(s) + `<div class="dk-seq">${actors}<svg class="seq" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.heading || 'sequence')}"><defs>${markers}</defs>${life}${msgs}</svg></div>` + note(s));
    }
    case 'algo': {
      const nodes = (s.nodes || []).map((nd, i) => `<div class="an k-${esc(nd.kind || 'step')}${nd.c ? ' c-' + esc(nd.c) : ''}" style="--i:${i}"><div class="box">${nd.kind === 'if' ? '<i>?</i>' : ''}${ico(nd.icon)}<span>${inl(nd.t)}</span></div>${nd.no ? `<div class="no"><span class="lbl">ні</span><span class="exit">${inl(nd.no)}</span></div>` : ''}</div>`).join('');
      const algo = `<div class="dk-algo">${nodes}</div>`;
      return sec(head(s) + (s.side ? two(algo, `<ul>${lis(s.side)}</ul>`, 'wide-left') : algo) + note(s));
    }
    case 'chat': {
      const phone = `<div class="dk-phone"><div class="ph-bar">${ico('robot')}<b>${esc(s.title || 'Bot')}</b><span>bot</span></div><div class="ph-body">${(s.msgs || []).map((m, i) => `<div class="bub ${m.from === 'me' ? 'me' : 'bot'}" style="--i:${i}">${inl(m.t)}</div>`).join('')}</div></div>`;
      return sec(head(s) + (s.side ? two(`<ul>${lis(s.side)}</ul>${note(s)}`, phone, 'chat-row') : phone + note(s)));
    }
    case 'html':
      return sec(s.html || '');
    default:
      return sec(head(s) + `<p>${esc(JSON.stringify(s))}</p>`);
  }
}

export function renderDeck(spec, opts = {}) {
  const kit = opts.kit || '../kit/';
  // vertical stacks: {…, down:[slides]} → main slide on top, details below (↓ in reveal)
  const slides = (spec.slides || []).map(s => s.down && s.down.length ? `<section class="stack">${slide(s)}${s.down.map(slide).join('')}</section>` : slide(s)).join('\n');
  const nav = (spec.nav || []).map(n => `<a class="deck-nav ${n.side === 'right' ? 'right' : 'left'}" href="${esc(n.href)}"${n.track ? ` data-track="${esc(n.track)}"` : ''}>${esc(n.label)}</a>`).join('');
  const boot = JSON.stringify(spec.boot || ['ORDYNSKI-DOS 2026 // STAGE', 'MOUNT /slides ........ OK', '', '> READY']);
  return `<!doctype html>
<html lang="${esc(spec.lang || 'uk')}" data-theme="stage" data-deck="${esc(spec.skin || "crt")}" data-accent="${esc(spec.accent || "cyan")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.head || ''}
<title>${esc(spec.title || 'Slides')}</title>
<link rel="preload" href="${kit}fonts/terminus-prop-bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${kit}fonts/fira-cyrillic-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${kit}fonts/firasans-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${kit}deck/deck.css">
</head>
<body class="deck">
${nav}
<div class="crt"><div class="crt-bezel">
  <div class="crt-screen">
    <div class="reveal"><div class="slides">
${slides}
    </div></div>
    <div class="crt-boot" aria-hidden="true"><pre class="crt-boot-txt"></pre></div>
    <div class="crt-scan"></div><div class="crt-vig"></div>
  </div>
  <div class="crt-chin"><span class="crt-brand">${esc(spec.brand || 'ORDYNSKI · VGA')}</span><span class="crt-chin-r"><span class="crt-hint">← → · H — довідка · F — на весь екран</span><span class="crt-led"></span></span></div>
</div></div>
<div class="stage-qr" id="stage-qr" role="dialog" aria-label="QR-код">${qr(spec.overlayQr || { mc: 'channel', caption: 'Матеріали' })}</div>
<script type="application/json" id="deck-boot">${boot}</script>
${opts.scripts || ''}
<script src="${kit}vendor/qrcode/qrcode.js"></script>
<script src="${kit}js/dos-kit.js"></script>
<script src="${kit}vendor/reveal/reveal.js"></script>
<script src="${kit}vendor/reveal/plugin/notes.js"></script>
<script src="${kit}slides/dos-reveal.js"></script>
<script src="${kit}deck/deck.js"></script>
</body>
</html>
`;
}
