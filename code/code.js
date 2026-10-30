/* Loads Code.gs as text (textContent — never HTML) and highlights it. */
(async function () {
  const box = document.getElementById('src');
  try {
    const r = await fetch('Code.gs', { cache: 'no-cache' });
    box.textContent = await r.text();
    if (window.Prism) Prism.highlightElement(box);
  } catch (e) {
    box.textContent = 'Не вдалося завантажити файл. Скористайтеся кнопкою «Завантажити Code.gs».';
  }
})();
