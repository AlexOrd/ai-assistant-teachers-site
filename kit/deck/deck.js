/* ordynski-dos-kit — deck runtime: reveal.js embedded in the CRT monitor, boot sequence, fullscreen on the bezel.
   Logical slide size 1920×1080 (pixel font at integer sizes). Works with slides/dos-reveal.js for keys. */
(function () {
  const bezel = document.querySelector('.crt-bezel');
  window.dosFullscreen = function () {
    if (!document.fullscreenElement) { (bezel.requestFullscreen || bezel.webkitRequestFullscreen || function () {}).call(bezel); }
    else document.exitFullscreen();
  };
  document.addEventListener('fullscreenchange', () => setTimeout(() => Reveal.layout(), 60));

  const print = /print-pdf/.test(location.search);
  Reveal.initialize({
    embedded: !print, hash: true, hashOneBasedIndex: true, center: true,
    width: 1920, height: 1080, margin: 0.035, minScale: 0.1, maxScale: 2,
    transition: 'fade', backgroundTransition: 'fade', controlsTutorial: false,
    slideNumber: 'c/t', progress: true, controls: true,
    plugins: [RevealNotes, DosReveal],
  });

  // terminals replay when their slide opens (non-step ones)
  const play = sl => sl && sl.querySelectorAll('dos-terminal:not([step])').forEach(t => t.play && t.play());
  Reveal.on('slidechanged', e => play(e.currentSlide));

  // boot sequence once per tab session
  const boot = document.querySelector('.crt-boot'), txt = document.querySelector('.crt-boot-txt');
  let lines = []; try { lines = JSON.parse(document.getElementById('deck-boot').textContent); } catch (e) {}
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let done = false;
  const finish = () => { if (done) return; done = true; document.body.classList.add('crt-on'); setTimeout(() => { boot && boot.remove(); play(Reveal.getCurrentSlide()); }, 420); };
  let seen = false; try { seen = sessionStorage.getItem('dos-booted') === location.pathname; } catch (e) {}
  if (RM || seen || print || !lines.length) finish();
  else {
    try { sessionStorage.setItem('dos-booted', location.pathname); } catch (e) {}
    let i = 0;
    (function step() { if (done) return; if (i < lines.length) { txt.textContent += lines[i++] + '\n'; setTimeout(step, i === lines.length ? 260 : 90 + Math.random() * 120); } else finish(); })();
    boot.addEventListener('click', finish);
    document.addEventListener('keydown', finish, { once: true });
  }
})();
