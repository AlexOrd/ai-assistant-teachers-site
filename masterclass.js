/* Config of THIS masterclass. Public values only — never put tokens or keys here.
   Placeholders containing YOUR_ are hidden or shown as "скоро" automatically. */
window.MC = {
  title: 'Хмарні сервіси в дії',
  subtitle: 'Створення безпечного ШІ-асистента викладача на базі Google Workspace',
  site: 'https://ai-assistant-teachers.ordynski.com/',
  bot: 'https://t.me/ai_vtfk_vykladach_bot',           // напр. https://t.me/ai_vykladach_bot
  channel: 'https://t.me/ai_vykladach_webinar',            // напр. https://t.me/ai_vykladach_mk
  feedback: 'https://forms.gle/YOUR_FORM',         // з createFeedbackForm()
  pollEndpoint: 'https://script.google.com/macros/s/AKfycbzbapFEcncpjtbniCeRgdODy_bgKs6USsdG8lSvDtYjp6Og2BdjGa9CvXig2LYRnfUGlQ/exec', // …/exec (без ?poll)
};
/* Fill links: <a data-mc="bot">, text: <span data-mc-text="date">, QR: <dos-qr data-mc-qr="channel">,
   poll: <dos-poll data-mc-poll="q1">. Runs before the kit components upgrade. */
(function () {
  const MC = window.MC, ok = v => v && !/YOUR_/.test(v);
  if (ok(MC.channel)) MC.channelName = '@' + MC.channel.replace(/\/+$/, '').split('/').pop();
  if (ok(MC.bot)) MC.botName = '@' + MC.bot.replace(/\/+$/, '').split('/').pop();   // https://t.me/x_bot → @x_bot
  const apply = (root) => {
    root = root || document;
    if (root === document) document.querySelectorAll('template').forEach(t => apply(t.content));
    root.querySelectorAll('[data-mc]').forEach(a => {
      const v = MC[a.dataset.mc];
      if (ok(v)) { a.href = v; } else { a.removeAttribute('href'); a.classList.add('is-soon'); a.title = 'Посилання з’явиться перед вебінаром'; }
    });
    root.querySelectorAll('[data-mc-text]').forEach(n => { const v = MC[n.dataset.mcText]; if (v) n.textContent = v; });
    root.querySelectorAll('dos-qr[data-mc-qr]').forEach(q => { const v = MC[q.dataset.mcQr]; q.setAttribute('value', ok(v) ? v : MC.site); });
    root.querySelectorAll('dos-poll[data-mc-poll]').forEach(p => { if (ok(MC.pollEndpoint)) p.setAttribute('src', MC.pollEndpoint + '?poll=' + p.dataset.mcPoll); });
    root.querySelectorAll('[data-mc-hide-empty]').forEach(n => { if (!ok(MC[n.dataset.mcHideEmpty])) n.hidden = true; });
  };
  MC.apply = apply;
  apply();                                                    // what is already parsed
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply());   // the rest
})();
