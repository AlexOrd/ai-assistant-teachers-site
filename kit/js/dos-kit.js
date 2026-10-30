/* ordynski-dos-kit v1.0 — components (light DOM, no dependencies except vendor/qrcode for <dos-qr>).
   Data from outside the page (terminal steps, poll results, config) is only ever written with
   textContent / setAttribute — never innerHTML (consilium T4). */
(() => {
  'use strict';
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const SERIES = window.DOS_SERIES || {};

  /* ======================= analytics (GA4, optional) ======================= */
  const GA = (SERIES.ga4 || '').trim();
  const gaOn = /^G-[A-Z0-9]{4,}$/.test(GA);
  if (gaOn && !window.gtag) {
    const s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA, { site_name: SERIES.siteName || document.title });
  }
  function track(name, params) {
    try { if (gaOn && window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* analytics never breaks the page */ }
  }
  window.dosTrack = track;
  // outbound and tagged clicks
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href], [data-track]');
    if (!a) return;
    if (a.dataset.track) { track(a.dataset.track, { label: a.dataset.trackLabel || a.textContent.trim().slice(0, 60) }); return; }
    if (a.host && a.host !== location.host) track('outbound', { url: a.href, label: a.textContent.trim().slice(0, 60) });
  }, true);

  /* ======================= copy to clipboard ======================= */
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove();
    }
    if (btn) { const old = btn.textContent; btn.textContent = 'Скопійовано'; btn.classList.add('done'); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
    track('copy_code', { label: (btn && btn.dataset.label) || text.slice(0, 40) });
  }
  window.dosCopy = copyText;
  function copyButton(getText, label) {
    const b = el('button', 'dos-copy', 'Копіювати'); b.type = 'button'; b.dataset.label = label || '';
    b.setAttribute('aria-label', 'Копіювати' + (label ? ': ' + label : ''));
    b.addEventListener('click', () => copyText(getText(), b));
    return b;
  }
  function enhanceCode(root) {
    root.querySelectorAll('.dos-code:not([data-enh])').forEach(box => {
      box.dataset.enh = '1';
      const pre = box.querySelector('pre'); if (!pre) return;
      let bar = box.querySelector(':scope > .bar');
      if (!bar) { bar = el('div', 'bar'); bar.appendChild(el('span', '', box.dataset.file || box.dataset.lang || 'код')); box.insertBefore(bar, pre); }
      bar.appendChild(copyButton(() => pre.innerText.replace(/\n$/, ''), box.dataset.file));
    });
    root.querySelectorAll('[data-copy]:not([data-enh])').forEach(n => {
      n.dataset.enh = '1';
      const wrap = el('span', 'dos-copy-inline'); n.replaceWith(wrap); wrap.appendChild(n);
      wrap.appendChild(copyButton(() => n.dataset.copy || n.textContent, n.dataset.copy || n.textContent));
    });
  }

  /* ======================= <dos-terminal> =======================
     Same data contract as vtfk-materials/site/assets/terminal.js:
     <dos-terminal title="bash" prompt="$"><script type="application/json">[{"cmd":"…","out":["…"],"note":"…"}]</script></dos-terminal>
     Attributes: title, prompt, step (manual: one command per click / "s" key), no-autoplay. A step may carry its own "prompt". */
  class DosTerminal extends HTMLElement {
    connectedCallback() {
      if (this._built) return; this._built = true;
      const data = this.querySelector('script[type="application/json"]');
      try { this.steps = JSON.parse(data ? data.textContent : '[]'); } catch (e) { this.steps = []; }
      if (!Array.isArray(this.steps)) this.steps = [];
      this.textContent = '';
      const box = el('div', 'dos-term');
      const bar = el('div', 'dos-term-bar'); bar.appendChild(el('span', 't', this.getAttribute('title') || 'bash'));
      this.btn = el('button', '', this.hasAttribute('step') ? 'Далі ▷' : '▷ Повторити'); this.btn.type = 'button';
      this.btn.addEventListener('click', () => this.hasAttribute('step') ? this.next() : this.play());
      bar.appendChild(this.btn);
      this.body = el('div', 'dos-term-body'); this.body.setAttribute('role', 'log'); this.body.setAttribute('aria-live', 'off');
      box.append(bar, this.body); this.appendChild(box); this.box = box;
      this.prompt = this.getAttribute('prompt') || '$';
      // Reserve the height of the finished session up front, so revealing steps never pushes the page down.
      let lastW = 0;
      new ResizeObserver(() => { const w = this.body.clientWidth; if (w && w !== lastW) { lastW = w; this.reserve(); } }).observe(this.body);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.reserve());   // fonts change line heights
      this.shown = 0;
      if (this.hasAttribute('step')) { this.render(0); this.hint(); return; }
      if (RM || this.hasAttribute('no-autoplay')) { this.render(this.steps.length); return; }
      const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); this.play(); } }, { threshold: .3 });
      io.observe(this);
    }
    line(step, cmdText, caret) {
      const ln = el('div', 'dos-term-line');
      ln.appendChild(el('span', 'dos-term-prompt', (step.prompt || this.prompt) + ' '));
      ln.appendChild(el('span', 'dos-term-cmd', cmdText));
      if (caret) ln.appendChild(el('span', 'dos-term-caret'));
      else if (step.cmd) ln.appendChild(copyButton(() => step.cmd, step.cmd));
      return ln;
    }
    outputs(step) {
      const frag = document.createDocumentFragment();
      (step.out || []).forEach(o => frag.appendChild(el('div', 'dos-term-out', String(o))));
      if (step.note) frag.appendChild(el('div', 'dos-term-note', '↳ ' + step.note));
      return frag;
    }
    reserve() {
      const w = this.body.clientWidth; if (!w) return;
      const m = this.body.cloneNode(false);
      m.removeAttribute('role'); m.setAttribute('aria-hidden', 'true');
      m.style.cssText = `position:absolute;left:0;top:0;width:${w}px;max-height:none;min-height:0;visibility:hidden;pointer-events:none`;
      this.steps.forEach(s => { m.appendChild(this.line(s, s.cmd || '', false)); m.appendChild(this.outputs(s)); });
      this.box.style.position = 'relative'; this.box.appendChild(m);
      const max = parseFloat(getComputedStyle(this.body).maxHeight);
      const h = m.offsetHeight; m.remove();
      this.body.style.minHeight = (isFinite(max) ? Math.min(h, max) : h) + 'px';
    }
    hint() { this.body.appendChild(el('div', 'dos-term-note dos-term-hint', 'Натисніть «Далі ▷» (або K), щоб виконати наступну команду')); }
    render(n) {
      this.body.textContent = '';
      this.steps.slice(0, n).forEach(s => { this.body.appendChild(this.line(s, s.cmd || '', false)); this.body.appendChild(this.outputs(s)); });
      this.shown = n; this.body.scrollTop = this.body.scrollHeight;
    }
    async type(i) {
      const s = this.steps[i]; const ln = this.line(s, '', true); this.body.appendChild(ln);
      const cmdEl = ln.querySelector('.dos-term-cmd'); let typed = '';
      for (const ch of (s.cmd || '')) { if (this._abort) return; typed += ch; cmdEl.textContent = typed; this.body.scrollTop = this.body.scrollHeight; await sleep(24 + Math.random() * 34); }
      ln.replaceWith(this.line(s, s.cmd || '', false)); this.body.appendChild(this.outputs(s)); this.body.scrollTop = this.body.scrollHeight;
      this.shown = i + 1;
    }
    async play() {
      this._abort = true; await sleep(0); this._abort = false;
      this.body.textContent = ''; this.shown = 0;
      for (let i = 0; i < this.steps.length; i++) { await this.type(i); if (this._abort) return; await sleep(320); }
    }
    async next() {
      if (this.shown >= this.steps.length) { this.render(0); this.hint(); this.btn.textContent = 'Далі ▷'; return; }
      const h = this.body.querySelector('.dos-term-hint'); if (h) h.remove();
      if (RM) this.render(this.shown + 1); else await this.type(this.shown);
      if (this.shown >= this.steps.length) this.btn.textContent = '↺ Спочатку';
    }
  }
  customElements.define('dos-terminal', DosTerminal);

  /* ======================= <dos-qr value caption size> ======================= */
  class DosQr extends HTMLElement {
    // value may be set after upgrade (page config runs on DOMContentLoaded) → re-render on change
    static get observedAttributes() { return ['value']; }
    attributeChangedCallback(name, oldV, newV) { if (this._built && oldV !== newV) { this._built = false; this.connectedCallback(); } }
    connectedCallback() {
      if (this._built || typeof window.qrcode !== 'function') return; this._built = true;
      const value = this.getAttribute('value') || location.href;
      const qr = window.qrcode(0, 'M'); qr.addData(unescape(encodeURIComponent(value)), 'Byte'); qr.make();
      const n = qr.getModuleCount(), NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${n} ${n}`); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'QR-код: ' + value);
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000'); svg.appendChild(p);
      const box = el('div', 'dos-qr'); if (this.getAttribute('size')) box.style.setProperty('--qr-size', this.getAttribute('size'));
      box.appendChild(svg);
      if (this.getAttribute('caption')) box.appendChild(el('span', 'dos-qr-cap', this.getAttribute('caption')));
      this.textContent = ''; this.appendChild(box);
    }
  }
  customElements.define('dos-qr', DosQr);

  /* ======================= <dos-timer minutes> ======================= */
  class DosTimer extends HTMLElement {
    connectedCallback() {
      if (this._built) return; this._built = true;
      this.total = Math.round(parseFloat(this.getAttribute('minutes') || '5') * 60); this.left = this.total; this.running = false;
      this.className = 'dos-timer';
      this.digits = el('div', 'digits'); this.digits.setAttribute('role', 'timer'); this.ctl = el('div', 'ctl');
      this.textContent = ''; this.append(this.digits, this.ctl);
      this.addEventListener('click', () => this.toggle()); this.tabIndex = 0;
      this.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(); } });
      this.draw();
    }
    draw() {
      const s = Math.max(0, this.left), m = Math.floor(s / 60), r = s % 60;
      this.digits.textContent = (this.left < 0 ? '-' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
      this.classList.toggle('warn', this.left <= 120 && this.left > 0); this.classList.toggle('over', this.left <= 0);
      this.ctl.textContent = this.running ? '[ Пауза ]' : (this.left === this.total ? '[ Старт ]' : '[ Продовжити ]');
    }
    toggle() {
      this.running = !this.running;
      if (this.running) { this.t = setInterval(() => { this.left--; this.draw(); if (this.left <= -599) this.toggle(); }, 1000); }
      else clearInterval(this.t);
      this.draw();
    }
    reset() { clearInterval(this.t); this.running = false; this.left = this.total; this.draw(); }
  }
  customElements.define('dos-timer', DosTimer);

  /* ======================= <dos-poll src interval> =======================
     Expects JSON: {question, options:[{text, votes}], total, closed, updatedAt}
     Polls only while the element is visible and the tab is active; exponential backoff on errors. */
  class DosPoll extends HTMLElement {
    connectedCallback() {
      if (this._built) return; this._built = true;
      this.classList.add('dos-poll');
      this.interval = Math.max(2000, parseInt(this.getAttribute('interval') || '3000', 10));
      this.qEl = el('div', 'q', this.getAttribute('question') || ''); this.list = el('div', 'rows');
      this.meta = el('div', 'meta'); this.total = el('span', 'total'); this.total.setAttribute('aria-live', 'polite');
      this.stamp = el('span', 'stamp'); this.meta.append(this.total, this.stamp);
      this.textContent = ''; this.append(this.qEl, this.list, this.meta);
      this.delay = this.interval; this.visible = false;
      this.empty('Голосів ще немає');
      new IntersectionObserver(es => { this.visible = es.some(x => x.isIntersecting); if (this.visible) this.tick(); }, { threshold: .2 }).observe(this);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
    }
    // No votes / not connected: if the slide gave its options, show them numbered so people can vote in the chat.
    empty(text) {
      this.list.textContent = '';
      const opts = (this.getAttribute('options') || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!opts.length) { this.list.appendChild(el('div', 'empty', text)); return; }
      const ol = el('ol', 'fallback'); opts.forEach(o => ol.appendChild(el('li', '', o)));
      this.list.append(ol, el('div', 'empty', this.getAttribute('fallback') || 'Голосуйте в каналі або напишіть номер у чат'));
    }
    async tick() {
      if (this.busy || !this.visible || document.hidden) return;
      const src = this.getAttribute('src'); if (!src || /PASTE|YOUR_/i.test(src)) { this.empty('Опитування ще не підключене'); return; }
      this.busy = true; clearTimeout(this.timer);
      try {
        const r = await fetch(src, { cache: 'no-store' });   // simple GET, no custom headers (consilium T2)
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.draw(await r.json()); this.delay = this.interval;
      } catch (e) {
        this.delay = Math.min(this.delay * 2, 60000);
        this.stamp.textContent = 'Немає зв’язку, повтор за ' + Math.round(this.delay / 1000) + ' с';
        this.stamp.className = 'stamp err';
      } finally {
        this.busy = false;
        if (this.isConnected) this.timer = setTimeout(() => this.tick(), this.delay);
      }
    }
    draw(d) {
      if (!d || !Array.isArray(d.options)) { this.empty('Опитування ще не почалося'); return; }
      if (d.question) this.qEl.textContent = d.question;
      const total = d.options.reduce((a, o) => a + (+o.votes || 0), 0);
      if (!total) this.empty('Голосів ще немає'); else {
        this.list.textContent = '';
        d.options.forEach(o => {
          const v = +o.votes || 0, pct = Math.round(v * 100 / total);
          const row = el('div', 'row'); const bar = el('div', 'bar'); const fill = el('div', 'fill'); fill.style.width = pct + '%'; bar.appendChild(fill);
          row.append(el('div', 'opt', String(o.text)), bar, el('div', 'num', v + ' · ' + pct + '%')); this.list.appendChild(row);
        });
      }
      this.total.textContent = 'Голосів: ' + total + (d.closed ? ' · закрите' : '');
      this.stamp.className = 'stamp';
      this.stamp.textContent = 'Оновлено ' + new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  customElements.define('dos-poll', DosPoll);

  /* ======================= <dos-clock> ======================= */
  class DosClock extends HTMLElement {
    connectedCallback() { const f = () => { this.textContent = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }); }; f(); this.t = setInterval(f, 15000); }
    disconnectedCallback() { clearInterval(this.t); }
  }
  customElements.define('dos-clock', DosClock);

  /* ======================= <dos-socials> (from DOS_SERIES.socials) ======================= */
  class DosSocials extends HTMLElement {
    connectedCallback() {
      if (this._built) return; this._built = true;
      this.classList.add('dos-socials');
      const list = (SERIES.socials || []).filter(s => s && s.url && !/YOUR_|example\.com/i.test(s.url));
      const extra = this.hasAttribute('with-hub') && SERIES.hub ? [{ label: 'Усі вебінари', url: SERIES.hub, track: 'hub' }] : [];
      [...extra, ...list].forEach(s => {
        const a = el('a', '', '► ' + s.label); a.href = s.url; a.rel = 'me noopener'; a.target = '_blank';
        a.dataset.track = 'outbound'; a.dataset.trackLabel = s.track || s.label; this.appendChild(a);
      });
      if (!this.children.length) this.hidden = true;
    }
  }
  customElements.define('dos-socials', DosSocials);

  /* ======================= file list (shell) =======================
     <table class="dos-filelist" data-preview="#preview"> rows: <tr data-href data-preview-id="tpl-id"> */
  function enhanceFilelist(root) {
    root.querySelectorAll('.dos-filelist[data-preview]:not([data-enh])').forEach(t => {
      t.dataset.enh = '1';
      const target = document.querySelector(t.dataset.preview);
      const rows = [...t.querySelectorAll('tr[data-href]')];
      // All previews are rendered once and stacked in one grid cell: the panel keeps the height of the
      // tallest one, so nothing below jumps when the selection changes on hover.
      const panes = new Map();
      if (target) {
        target.textContent = ''; target.classList.add('dos-preview-stack');
        rows.forEach(r => {
          const tpl = r.dataset.previewId && document.getElementById(r.dataset.previewId); if (!tpl) return;
          const pane = document.createElement('div'); pane.className = 'pv'; pane.appendChild(tpl.content.cloneNode(true));
          pane.inert = true; pane.setAttribute('aria-hidden', 'true');
          target.appendChild(pane); panes.set(r, pane);
        });
        enhanceCode(target);
      }
      const select = (row, focus) => {
        rows.forEach(r => r.setAttribute('aria-selected', String(r === row)));
        if (focus) row.focus();
        panes.forEach((pane, r) => { const on = r === row; pane.classList.toggle('on', on); pane.inert = !on; pane.setAttribute('aria-hidden', String(!on)); });
      };
      rows.forEach((r, i) => {
        r.tabIndex = 0;
        r.addEventListener('mouseenter', () => select(r));
        r.addEventListener('focus', () => select(r));
        r.addEventListener('click', e => { if (!e.target.closest('a')) location.href = r.dataset.href; });
        r.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); select(rows[Math.min(i + 1, rows.length - 1)], true); }
          if (e.key === 'ArrowUp') { e.preventDefault(); select(rows[Math.max(i - 1, 0)], true); }
          if (e.key === 'Enter') location.href = r.dataset.href;
        });
      });
      const first = rows.find(r => r.getAttribute('aria-selected') === 'true') || rows[0];
      if (first) select(first);
    });
  }

  /* ======================= dialogs: [data-dialog="id"] opens <dialog id> ======================= */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-dialog]'); if (!b) return;
    const d = document.getElementById(b.dataset.dialog); if (d && d.showModal) { e.preventDefault(); d.showModal(); }
  });

  /* ======================= LIVE badge: <span class="dos-live" data-from="ISO" data-to="ISO"> ======================= */
  function liveBadges() {
    const force = /[?&]live\b/.test(location.search), now = Date.now();
    document.querySelectorAll('.dos-live[data-from]').forEach(b => {
      const on = force || (now >= Date.parse(b.dataset.from) && now <= Date.parse(b.dataset.to || b.dataset.from));
      b.hidden = !on;
    });
  }

  /* ======================= DOS starfield background (neon theme; html[data-stars="off"] disables) ======================= */
  function stars() {
    const html = document.documentElement;
    if (html.dataset.theme !== 'neon' || html.dataset.stars === 'off' || document.querySelector('.dos-stars')) return;
    const c = document.createElement('canvas'); c.className = 'dos-stars'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    const ctx = c.getContext('2d'), RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLORS = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#22E6FF', '#22E6FF', '#FF3EC8', '#FFE14D'];
    let W = 0, H = 0, dpr = 1, list = [];
    const make = () => ({ x: Math.random() * W, y: Math.random() * H, z: .15 + Math.random() * .85,
      c: COLORS[(Math.random() * COLORS.length) | 0], p: Math.random() * 6.28, s: Math.random() < .12 ? 2 : 1 });
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(260, W * H / 7000));
      while (list.length < n) list.push(make()); list.length = n;
    };
    const draw = t => {
      ctx.clearRect(0, 0, W, H);
      const sy = scrollY * .12;
      for (const st of list) {
        const a = .35 + .65 * st.z * (.65 + .35 * Math.sin(t / 900 + st.p));
        const y = ((st.y - sy * st.z) % H + H) % H;
        ctx.globalAlpha = a; ctx.fillStyle = st.c;
        const px = st.s * (st.z > .8 ? 2 : 1);           // square "pixels", like a DOS demo
        ctx.fillRect(Math.round(st.x), Math.round(y), px, px);
      }
    };
    let last = 0, raf = 0;
    const loop = t => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;                          // ~30 fps is plenty
      const dt = Math.min(60, t - last); last = t;
      for (const st of list) { st.x -= st.z * dt * .012; if (st.x < -2) { st.x = W + 2; st.y = Math.random() * H; } }
      draw(t);
    };
    size(); addEventListener('resize', size);
    if (RM) { draw(0); addEventListener('scroll', () => draw(0), { passive: true }); return; }
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } });
  }

  /* ======================= init ======================= */
  const init = () => { enhanceCode(document); enhanceFilelist(document); liveBadges(); setInterval(liveBadges, 60000); stars(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.dosEnhance = root => { enhanceCode(root || document); enhanceFilelist(root || document); };
})();
