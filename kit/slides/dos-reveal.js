/* ordynski-dos-kit — reveal.js plugin: stage chrome, F-keys + letter aliases, present mode, analytics.
   F-keys are handled with preventDefault (F5 must not reload mid-session) and every action also has a
   letter alias, because macOS laptops need Fn for F-keys (consilium T3).

   Usage: Reveal.initialize({ ..., plugins: [RevealMarkdown, RevealNotes, DosReveal] })
   Page markup: optional <div class="stage-chrome stage-top">…menubar…</div>, <div class="stage-chrome stage-bottom">…status + fkeys…</div>,
   a #stage-qr overlay (<div class="stage-qr" id="stage-qr"><dos-qr …></div>).
   Slides: data-section="Назва" for the menu bar; class="layout-poll" for the poll slide; class="is-end" for the last slide. */
window.DosReveal = (() => {
  const KEYS = [
    { f: 'F1', k: 'h', label: 'Help', act: 'help' },
    { f: 'F2', k: 'o', label: 'Overview', act: 'overview' },
    { f: 'F4', k: 'q', label: 'QR', act: 'qr' },
    { f: 'F5', k: 'p', label: 'Poll', act: 'poll' },
    { f: 'F6', k: 't', label: 'Timer', act: 'timer' },
    { f: 'F7', k: 'k', label: 'Step', act: 'step' },
    { f: 'F8', k: 'f', label: 'Fullscreen', act: 'present' },
    { f: 'F9', k: 'n', label: 'Notes', act: 'notes' },
    { f: 'F10', k: 'e', label: 'End', act: 'end' },
  ];
  let deck;
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const embedded = window.self !== window.top || params.has('embed');

  function setPresent(on) {
    document.documentElement.classList.toggle('dos-present', on);
    try { localStorage.setItem('dos-present', on ? '1' : '0'); } catch (e) {}
    setTimeout(() => deck && deck.layout(), 30);
  }

  function help() {
    let h = $('#stage-help');
    if (!h) {
      h = document.createElement('div'); h.id = 'stage-help'; h.className = 'stage-help';
      const box = document.createElement('div'); box.className = 'box'; const inner = document.createElement('div'); inner.className = 'inner';
      const t = document.createElement('div'); t.className = 't'; t.textContent = 'Help'; inner.appendChild(t);
      const tbl = document.createElement('table');
      [['→ ← Space', 'next / previous slide'], ...KEYS.map(x => [x.f + ' or ' + x.k.toUpperCase(), x.label]), ['Esc', 'close']].forEach(([a, b]) => {
        const tr = document.createElement('tr'); const td1 = document.createElement('td'); td1.textContent = a; const td2 = document.createElement('td'); td2.textContent = b;
        tr.append(td1, td2); tbl.appendChild(tr);
      });
      inner.appendChild(tbl); box.appendChild(inner); h.appendChild(box); document.body.appendChild(h);
      h.addEventListener('click', () => h.classList.remove('on'));
    }
    h.classList.toggle('on');
  }

  function act(name) {
    const cur = deck.getCurrentSlide();
    switch (name) {
      case 'help': help(); break;
      case 'overview': deck.toggleOverview(); break;
      case 'qr': { const q = $('#stage-qr'); if (q) { q.classList.toggle('on'); window.dosTrack && dosTrack('qr_open'); } break; }
      case 'poll': { const s = document.querySelector('.reveal .slides section.layout-poll'); if (s) { const i = deck.getIndices(s); deck.slide(i.h, i.v); window.dosTrack && dosTrack('poll_open'); } break; }
      case 'timer': { const t = cur && cur.querySelector('dos-timer') || document.querySelector('.reveal dos-timer'); if (t && t.toggle) t.toggle(); break; }
      case 'step': { const t = cur && cur.querySelector('dos-terminal[step]'); if (t && t.next) t.next(); break; }
      case 'present': if (window.dosFullscreen) window.dosFullscreen(); else setPresent(!document.documentElement.classList.contains('dos-present')); break;
      case 'notes': { const n = deck.getPlugin && deck.getPlugin('notes'); if (n && n.open) n.open(); break; }
      case 'end': { const s = document.querySelector('.reveal .slides section.is-end'); if (s) { const i = deck.getIndices(s); deck.slide(i.h, i.v); } break; }
    }
  }

  function chrome() {
    // F-key bar
    const fk = $('.stage-chrome .dos-fkeys[data-auto]');
    if (fk) {
      const n = (fk.dataset.keys || 'help,overview,qr,poll,timer,present,end').split(',');
      KEYS.filter(k => n.includes(k.act)).forEach(k => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-keyshortcuts', k.f + ' ' + k.k.toUpperCase());
        const i = document.createElement('i'); i.textContent = k.f.slice(1); const sp = document.createElement('span'); sp.textContent = k.label;
        b.append(i, sp); b.addEventListener('click', () => act(k.act)); fk.appendChild(b);
      });
    }
    // menu bar sections
    const mb = $('.stage-chrome .dos-menubar [data-sections]');
    if (mb) {
      const seen = [];
      deck.getSlides().forEach(s => { const n = s.dataset.section; if (n && !seen.includes(n)) seen.push(n); });
      seen.forEach(n => { const a = document.createElement('a'); a.href = '#'; a.textContent = n; a.dataset.sec = n;
        a.addEventListener('click', e => { e.preventDefault(); const s = deck.getSlides().find(x => x.dataset.section === n); if (s) { const i = deck.getIndices(s); deck.slide(i.h, i.v); } });
        mb.appendChild(a); });
    }
    const top = $('.stage-top'), bottom = $('.stage-bottom');
    const fit = () => {
      document.documentElement.style.setProperty('--chrome-top', (top ? top.offsetHeight : 0) + 'px');
      document.documentElement.style.setProperty('--chrome-bottom', (bottom ? bottom.offsetHeight : 0) + 'px');
      deck.layout();
    };
    if (top || bottom) { document.documentElement.classList.add('has-chrome'); new ResizeObserver(fit).observe(document.body); fit(); }
  }

  function onSlide() {
    const cur = deck.getCurrentSlide(); const all = deck.getTotalSlides(); const idx = deck.getSlidePastCount() + 1;
    const num = $('.stage-chrome [data-slide-num]'); if (num) num.textContent = `[ ${String(idx).padStart(2, '0')}/${String(all).padStart(2, '0')} ]`;
    const title = $('.stage-chrome [data-slide-title]'); if (title) title.textContent = cur.dataset.status || (cur.querySelector('h1,h2') || {}).textContent || '';
    const sec = cur.dataset.section || [...deck.getSlides()].slice(0, idx).reverse().map(s => s.dataset.section).find(Boolean);
    document.querySelectorAll('.stage-chrome [data-sec]').forEach(a => { a.classList.toggle('on', a.dataset.sec === sec); if (a.dataset.sec === sec) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
    window.dosTrack && dosTrack('slide_view', { slide_index: idx, slide_title: (cur.querySelector('h1,h2') || {}).textContent || '' });
  }

  return {
    id: 'dos',
    init(r) {
      deck = r;
      let present = params.has('present');
      if (!present && !embedded) { try { present = localStorage.getItem('dos-present') === '1'; } catch (e) {} }
      if (embedded) present = false;
      document.documentElement.classList.toggle('dos-present', present);
      if (params.has('crt')) document.documentElement.classList.add('dos-crt');
      document.addEventListener('keydown', e => {
        if (e.target.closest('input, textarea, [contenteditable]')) return;   // never while typing
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const k = KEYS.find(x => x.f === e.key || x.k === e.key.toLowerCase());
        if (k) { e.preventDefault(); e.stopPropagation(); act(k.act); }
        if (e.key === 'Escape') { document.querySelectorAll('.stage-help.on, .stage-qr.on').forEach(x => x.classList.remove('on')); }
      }, true);
      r.on('ready', () => { chrome(); onSlide(); });
      r.on('slidechanged', onSlide);
    },
    act, setPresent,
  };
})();
