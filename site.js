/* Masterclass site glue: map file-list rows that point at config links (#bot, #channel, #feedback). */
(function () {
  const MC = window.MC || {}, ok = v => v && !/YOUR_/.test(v);
  document.querySelectorAll('tr[data-href^="#"]').forEach(tr => {
    const v = MC[tr.dataset.href.slice(1)];
    if (ok(v)) tr.dataset.href = v; else tr.dataset.href = 'guide/';
  });
})();
