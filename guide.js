/* Guide page: analytics for step progress (each step reported once when it scrolls into view). */
(function () {
  const seen = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => {
    const n = e.target.dataset.step;
    if (e.isIntersecting && n && !seen.has(n)) { seen.add(n); window.dosTrack && dosTrack('guide_step', { step: Number(n) }); }
  }), { threshold: 0.4 });
  document.querySelectorAll('.dos-step[data-step]').forEach(s => io.observe(s));
})();
