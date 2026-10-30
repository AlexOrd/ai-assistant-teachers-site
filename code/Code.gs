/**
 * ШІ-асистент викладача — Telegram-бот на Google Apps Script + Gemini.
 * Майстер-клас «Хмарні сервіси в дії» · Олександр Ординський
 *
 * ЩО ЦЕ ТАКЕ
 *   Ви пишете боту в Telegram → Google запускає цей скрипт → скрипт питає Gemini → бот відповідає.
 *   Сервера немає, грошей не треба. Бот знає ВАШ курс: він читає Google Таблицю з двома аркушами —
 *   «База знань» (теми й відповіді, які ви пишете самі) і «Розклад».
 *
 * ПРАВИЛА БЕЗПЕКИ ЦЬОГО ФАЙЛУ
 *   1. Жодного секрету в коді. Токен бота й ключ Gemini лежать у «Властивостях скрипта»
 *      (⚙ Налаштування проєкту → Властивості скрипта) і читаються функцією prop_().
 *   2. Адреса вебхука містить випадковий ключ (?k=…). Чужі запити без нього ігноруються.
 *   3. Telegram інколи надсилає те саме повідомлення двічі — повтори пропускаємо.
 *   4. Ліміт: 5 повідомлень за 10 хвилин на людину; довжина — до 1500 символів;
 *      повідомлення з телефоном, email чи оцінками з прізвищем бот не відправляє в ШІ.
 *   5. Журнал без імен: замість id — короткий хеш, email і номери замасковані (це псевдонімізація,
 *      не повна анонімність — журнал теж не публікуйте).
 *   ⚠️ Усе, що пишуть боту, обробляють сервери Telegram і Google (Gemini). На безкоштовному рівні
 *      запити можуть читати рецензенти Google. Умови Gemini API: користувачі — 18+.
 *   ⚠️ У Таблицю не пишіть персональних даних студентів (ПІБ, оцінки, телефони).
 *
 * ВЛАСТИВОСТІ СКРИПТА
 *   TELEGRAM_TOKEN  — токен від @BotFather                              (додаєте ви)
 *   GEMINI_API_KEY  — ключ з aistudio.google.com/apikey                 (додаєте ви)
 *   WEB_APP_URL     — адреса …/exec після «Розгорнути → Вебдодаток»      (додаєте ви)
 *   GEMINI_MODEL    — необов’язково; модель за замовчуванням — gemini-flash-lite-latest (швидка)
 *   WEBHOOK_KEY, HASH_SALT, DATA_SHEET_ID, LOG_SHEET_ID — створює setup() сам
 *
 * ПОРЯДОК ПЕРШОГО ЗАПУСКУ
 *   setup() → Розгорнути → Нове розгортання → Вебдодаток (Виконувати як: Я, Доступ: Усі)
 *   → скопіювати …/exec у WEB_APP_URL → setWebhook() → написати боту /start.
 *   Змінили код? Керувати розгортаннями → ✎ → Версія: Нова версія (адреса не зміниться).
 */

// ============================================================================
// 1. НАЛАШТУВАННЯ — усе, що не є секретом
// ============================================================================

const CONFIG = {
  botName: 'ШІ-асистент викладача',
  model: 'gemini-flash-lite-latest',       // швидка й щедра на безкоштовні ліміти; змінити — властивість GEMINI_MODEL
  maxInput: 1500,                          // максимум символів в одному повідомленні
  maxOutput: 2048,                         // максимум «токенів» у відповіді ШІ
  rateLimit: { count: 5, windowSec: 600 }, // 5 повідомлень за 10 хвилин на людину
  knowledgeMaxChars: 40000,                // більша база знань швидше витрачає безкоштовний ліміт
  cacheSec: 300,                           // Таблицю перечитуємо раз на 5 хвилин
};

// «Характер» бота. Змініть цей текст — і бот стане помічником для вашого предмета.
const SYSTEM_PROMPT = [
  'Ти — доброзичливий асистент викладача інформатики в українському коледжі.',
  'Відповідай українською, коротко (до 8 речень) і просто, без жаргону; приклад коду — лише коли просять.',
  'Питання про курс (дедлайни, оцінювання, правила, матеріали) відповідай ЛИШЕ за базою знань нижче;',
  'якщо там немає відповіді — чесно скажи, що не знаєш, і порадь звернутися до викладача.',
  'Ти вмієш також пояснювати код крок за кроком і придумувати питання для самоперевірки.',
  'Не розв’язуй контрольні й лабораторні повністю — давай підказки.',
  'Ніколи не проси й не обробляй персональні дані: ПІБ, оцінки, телефони, адреси, фото, медичні дані.',
  'Якщо людина пише про булінг, насильство, загрозу життю чи важкий емоційний стан — не консультуй:',
  'коротко й тепло порадь одразу звернутися до дорослого, якому довіряє (куратор, психолог закладу, батьки),',
  'і дай номери: Національна дитяча «гаряча лінія» 116 111, екстрені служби 112.',
].join(' ');

// ============================================================================
// 2. СЕКРЕТИ — читаємо тільки з Властивостей скрипта
// ============================================================================

function prop_(name, required) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (required && !v) throw new Error('Не задано властивість ' + name + ' (⚙ Налаштування проєкту → Властивості скрипта).');
  return v || '';
}
function setProp_(name, value) { PropertiesService.getScriptProperties().setProperty(name, String(value)); }

// ============================================================================
// 3. ВЕБХУК — сюди Telegram надсилає кожне повідомлення (POST-запит)
// ============================================================================

function doPost(e) {
  // (а) перевіряємо секретний ключ в адресі; без нього — мовчки ігноруємо
  const key = prop_('WEBHOOK_KEY');
  if (!key || !e || !e.parameter || e.parameter.k !== key) return ok_();

  let update;
  try { update = JSON.parse(e.postData.contents); } catch (err) { return ok_(); }

  // (б) пропускаємо повтори: кожен update_id пам’ятаємо 6 годин
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return ok_();
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('upd_' + update.update_id)) return ok_();
    cache.put('upd_' + update.update_id, '1', 21600);
  } finally {
    lock.releaseLock();
  }

  // (в) розширення: якщо в проєкті є ще один файл з функцією onUpdate_ — він може обробити оновлення сам
  if (typeof onUpdate_ === 'function' && onUpdate_(update)) return ok_();

  try {
    if (update.message && update.message.text) handleMessage_(update.message);
    else if (update.message && update.message.chat && update.message.chat.type === 'private')
      send_(update.message.chat.id, 'Поки що я розумію лише текст 🙂 Напишіть питання словами.');   // стікер, голосове, фото
  } catch (err) {
    console.error(err && err.stack || err);
    const m = update.message;                       // бот не мовчить: коротко повідомляємо про збій
    if (m && m.chat && m.chat.type === 'private') send_(m.chat.id, 'Ой, щось пішло не так 🙈 Спробуйте ще раз за хвилину.');
  }
  return ok_();
}

// Відповідь Telegram. HtmlService віддає «200 OK» одразу; ContentService робить переадресацію 302,
// і Telegram вважає це помилкою: повторює повідомлення й затримує наступні (черга «застрягає»).
function ok_() { return HtmlService.createHtmlOutput('ok'); }

// Відкрийте …/exec у браузері: якщо бачите цей текст — вебдодаток працює.
function doGet(e) {
  if (typeof onGet_ === 'function') { const r = onGet_(e); if (r) return r; }
  return ContentService.createTextOutput(CONFIG.botName + ' працює ✔');
}

// ============================================================================
// 4. ПОВІДОМЛЕННЯ — команди, розклад, ШІ
// ============================================================================

function handleMessage_(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from && msg.from.id;
  const text = String(msg.text || '').trim();
  if (msg.chat.type !== 'private') return;                 // відповідаємо лише в особистих чатах

  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  const arg = text.slice(cmd.length).trim();

  if (cmd === '/start' || cmd === '/help') return send_(chatId, helpText_());
  if (typeof onCommand_ === 'function' && onCommand_(msg, cmd, arg)) return;   // розширення (див. doPost)

  if (!allowRate_(userId)) {
    send_(chatId, 'Забагато запитань за короткий час 🙂 Зачекайте кілька хвилин. (Ліміт: ' +
      CONFIG.rateLimit.count + ' повідомлень за ' + Math.round(CONFIG.rateLimit.windowSec / 60) + ' хв.)');
    return log_(userId, 'rate_limited', text);      // спершу відповідь, потім журнал — так швидше
  }
  if (text.length > CONFIG.maxInput) return send_(chatId, 'Повідомлення задовге. Надішліть, будь ласка, до ' + CONFIG.maxInput + ' символів.');

  const pd = personalData_(text);
  if (pd) {
    send_(chatId, '⚠️ Схоже, у повідомленні є персональні дані (' + pd + '). ' +
      'Не надсилайте ШІ-ботам дані учнів чи колег. Перефразуйте без них, і я допоможу.');
    return log_(userId, 'personal_data_blocked', text);
  }

  if (cmd === '/rozklad' || cmd === '/розклад') {
    send_(chatId, scheduleText_(arg));
    return log_(userId, 'schedule', text);
  }

  // усе інше — до Gemini разом з базою знань і розкладом
  // спершу — «думаю…», щоб людина бачила, що бот працює; потім замінюємо цей текст відповіддю
  const wait = send_(chatId, '⏳ Думаю над відповіддю…');
  sendTyping_(chatId);
  const answer = askGemini_(text);
  const id = wait && wait.ok && wait.result && wait.result.message_id;
  const edited = id && tg_('editMessageText', { chat_id: chatId, message_id: id, text: String(answer.text).slice(0, 4000), disable_web_page_preview: true });
  if (!edited || !edited.ok) send_(chatId, answer.text);
  log_(userId, answer.ok ? 'ai' : 'ai_error', text);
}

function helpText_() {
  return [
    'Привіт! Я ' + CONFIG.botName + '.',
    '',
    'Що я вмію:',
    '• відповісти про курс — дедлайни, оцінювання, правила (з бази знань викладача);',
    '• пояснити шматок коду — просто надішліть його;',
    '• розклад — /rozklad або /rozklad середа;',
    '• придумати питання для самоперевірки — напишіть тему.',
    '',
    'Я — ШІ й можу помилятися: важливе перевіряйте.',
    'ℹ️ Ваші повідомлення обробляють Telegram і Google (Gemini, безкоштовний рівень): Google може використати їх',
    'для покращення своїх сервісів, а його працівники — прочитати. Викладач бачить журнал без імен.',
    'Не пишіть нічого особистого про себе чи інших. Особисті питання — до викладача.',
    '⚠️ Не надсилайте персональні дані учнів чи колег.',
    'Ліміт: ' + CONFIG.rateLimit.count + ' повідомлень за ' + Math.round(CONFIG.rateLimit.windowSec / 60) + ' хвилин.',
  ].join('\n');
}

// ============================================================================
// 5. GEMINI — один HTTP-запит до моделі
// ============================================================================

function askGemini_(userText) {
  const key = prop_('GEMINI_API_KEY', true);
  const model = prop_('GEMINI_MODEL') || CONFIG.model;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const context = SYSTEM_PROMPT +
    '\n\nБАЗА ЗНАНЬ ВИКЛАДАЧА:\n' + knowledgeText_() +
    '\n\nРОЗКЛАД:\n' + scheduleText_('');
  const payload = {
    systemInstruction: { parts: [{ text: context }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    // Без thinkingConfig: нові моделі на ньому зависають або повертають 400. Lite-модель відповідає за ~1 с.
    generationConfig: { maxOutputTokens: CONFIG.maxOutput, temperature: 0.3 },
  };
  const busy = { ok: false, text: 'Зараз мені пишуть дуже багато людей одночасно 🙂 Спробуйте ще раз за хвилину.' };
  let res;
  try {
    res = callGemini_(url, key, payload);
  } catch (err) {                                   // немає зв’язку, тайм-аут
    console.error('Gemini fetch: ' + err);
    return busy;
  }
  const code = res.getResponseCode();
  if (code === 429 || code === 500 || code === 503) return busy;   // ліміт або модель перевантажена
  if (code !== 200) {
    console.error('Gemini ' + code + ': ' + res.getContentText().slice(0, 500));
    return { ok: false, text: 'Не вдалося отримати відповідь від ШІ (код ' + code + '). Спробуйте пізніше.' };
  }
  let data;
  try { data = JSON.parse(res.getContentText()); } catch (err) { return busy; }
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('').trim();
  if (!text) {
    console.warn('Gemini: порожня відповідь, finishReason=' + cand.finishReason);
    return { ok: false, text: 'ШІ не дав відповіді. Спробуйте сформулювати інакше.' };
  }
  return { ok: true, text: plain_(text) };
}

function callGemini_(url, key, payload) {
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },   // ключ — у заголовку, не в адресі
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

// Telegram отримує звичайний текст, тому прибираємо найчастішу розмітку Markdown.
function plain_(t) {
  return t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^\s*\*\s+/gm, '• ').slice(0, 3900);
}

// ============================================================================
// 6. TELEGRAM — вихідні виклики
// ============================================================================

function tg_(method, payload) {
  try {
    const url = 'https://api.telegram.org/bot' + prop_('TELEGRAM_TOKEN', true) + '/' + method;
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    const body = JSON.parse(res.getContentText() || '{}');
    if (!body.ok) console.error('Telegram ' + method + ': ' + res.getContentText().slice(0, 300));
    return body;
  } catch (err) {                                   // збій мережі або не-JSON відповідь — бот не «падає»
    console.error('Telegram ' + method + ': ' + err);
    return { ok: false, description: String(err) };
  }
}
function send_(chatId, text) { return tg_('sendMessage', { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true }); }
function sendTyping_(chatId) { tg_('sendChatAction', { chat_id: chatId, action: 'typing' }); }

// ============================================================================
// 7. БЕЗПЕКА — ліміт, фільтр персональних даних, журнал без імен
// ============================================================================

function allowRate_(userId) {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + userId;
  const n = Number(cache.get(k) || 0);
  if (n >= CONFIG.rateLimit.count) return false;
  cache.put(k, String(n + 1), CONFIG.rateLimit.windowSec);
  return true;
}

// Повертає короткий опис, якщо текст схожий на персональні дані, інакше ''.
function personalData_(t) {
  if (/(\+?38)?\s?\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/.test(t)) return 'номер телефону';
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return 'email';
  if (/\b\d{10}\b/.test(t)) return 'схоже на РНОКПП';
  if (/(оцінк\w*|бал\w*)\s+(учн|студент)\w*\s+[А-ЯІЇЄҐ][а-яіїєґʼ’']+\s+[А-ЯІЇЄҐ][а-яіїєґʼ’']+/.test(t)) return 'оцінки з прізвищем';
  return '';
}

function mask_(t) {
  return String(t).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s()-]{8,}\d/g, '[number]').slice(0, 300);
}

function hashId_(userId) {
  let salt = prop_('HASH_SALT');
  if (!salt) { salt = Utilities.getUuid(); setProp_('HASH_SALT', salt); }
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + userId);
  return raw.slice(0, 4).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function log_(userId, kind, text) {
  const id = prop_('LOG_SHEET_ID'); if (!id) return;
  try { SpreadsheetApp.openById(id).getSheets()[0].appendRow([new Date(), hashId_(userId), kind, mask_(text)]); }
  catch (err) { console.error('log: ' + err); }
}

// ============================================================================
// 8. ДАНІ — одна Google Таблиця: аркуш «База знань» і аркуш «Розклад»
// ============================================================================

// Читає аркуш таблиці як рядки (без заголовка) і тримає їх у кеші 5 хвилин.
function rows_(sheetName) {
  const id = prop_('DATA_SHEET_ID'); if (!id) return [];
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rows_' + sheetName); if (hit) return JSON.parse(hit);
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(sheetName); if (!sh) return [];
    const rows = sh.getDataRange().getDisplayValues().slice(1).filter(r => r.some(c => String(c).trim()));
    const json = JSON.stringify(rows);
    try {
      cache.put('rows_' + sheetName, json, CONFIG.cacheSec);
      cache.put('bak_' + sheetName, json, 21600);     // запасна копія на 6 годин — якщо Таблиця раптом не відкриється
    } catch (err) { /* завеликий для кешу — просто не кешуємо */ }
    return rows;
  } catch (err) {                                      // Таблиця недоступна (навантаження, збій Google)
    console.error('Таблиця «' + sheetName + '»: ' + err);
    const bak = cache.get('bak_' + sheetName);
    return bak ? JSON.parse(bak) : [];
  }
}

// База знань: кожен рядок — «Тема: Інформація». Обрізаємо, якщо задовга.
function knowledgeText_() {
  const text = rows_('База знань').map(r => '• ' + r[0] + ': ' + r[1]).join('\n');
  if (!text) return '(база знань порожня)';
  if (text.length > CONFIG.knowledgeMaxChars) console.warn('База знань задовга: ' + text.length + ' символів — обрізано.');
  return text.slice(0, CONFIG.knowledgeMaxChars);
}

const DAYS = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця'];

function scheduleText_(arg) {
  const rows = rows_('Розклад');
  if (!rows.length) return 'Розклад ще не заповнено.';
  const want = String(arg || '').toLowerCase().replace(/[’']/g, 'ʼ');
  const day = DAYS.find(d => want && d.startsWith(want.slice(0, 3)));
  const list = rows.filter(r => !day || String(r[0]).toLowerCase() === day);
  if (!list.length) return 'У цей день пар немає 🙂';
  let out = 'Розклад' + (day ? ' — ' + day : '') + ':\n', cur = '';
  list.forEach(r => {
    if (r[0] !== cur) { cur = r[0]; out += '\n' + cur[0].toUpperCase() + cur.slice(1) + '\n'; }
    out += '  ' + r[1] + '  ' + r[2] + (r[3] ? ' — ' + r[3] : '') + (r[4] ? ' (' + r[4] + ')' : '') + '\n';
  });
  return out.trim();
}

// ============================================================================
// 9. ЗАПУСК — виконуйте ці функції в редакторі (обрати функцію → ▷ Виконати)
// ============================================================================

/** Один раз: ключ вебхука, Таблиця з прикладом бази знань і розкладу, журнал без імен. */
function setup() {
  if (!prop_('WEBHOOK_KEY')) setProp_('WEBHOOK_KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!prop_('HASH_SALT')) setProp_('HASH_SALT', Utilities.getUuid());

  if (!prop_('DATA_SHEET_ID')) {
    const ss = SpreadsheetApp.create('ШІ-асистент — база знань і розклад');
    const kb = ss.getSheets()[0]; kb.setName('База знань');
    fill_(kb, ['Тема', 'Інформація'], [
      ['Курс', 'Основи програмування (Python), 2 курс, демо-група КІ-41. Лекції — понеділок, лабораторні — четвер.'],
      ['Лабораторні й дедлайни', 'ЛР1 Змінні — до 15 вересня; ЛР2 Умови — до 29 вересня; ЛР3 Цикли — до 13 жовтня; ЛР4 Функції — до 27 жовтня; ЛР5 Списки — до 10 листопада.'],
      ['Як здавати', 'Через Google Classroom: код (.py) і короткий звіт PDF. Захист — усно на занятті, 5 хвилин.'],
      ['Оцінювання', 'Лабораторні — по 10 балів (разом 50), дві модульні — по 15 (30), іспит — 20. Запізнення — мінус 2 бали за тиждень.'],
      ['Перездача', 'Кожну лабораторну можна перездати один раз до кінця модуля.'],
      ['ШІ на навчанні', 'Можна для пояснень і пошуку помилок. Код пишете самі й пояснюєте на захисті.'],
      ['Матеріали', 'Лекції й приклади — у Google Classroom курсу. Документація Python: docs.python.org/uk'],
      ['⚠️ Правило', 'Не додавайте сюди персональних даних студентів: ПІБ, оцінок, телефонів.'],
    ]);
    const sh = ss.insertSheet('Розклад');
    // без прізвищ колег: усе з Таблиці надсилається в Gemini (колонку «Примітка» можна лишити порожньою)
    fill_(sh, ['День', 'Час', 'Предмет', 'Примітка', 'Аудиторія'], [
      ['понеділок', '08:30', 'Бази даних', 'лекція', '214'],
      ['понеділок', '10:10', 'Веб-програмування', 'лабораторна', 'Лаб. 3'],
      ['вівторок', '08:30', 'Системне програмування', 'лабораторна', 'Лаб. 1'],
      ['вівторок', '11:50', 'Англійська мова', 'лекція', '305'],
      ['середа', '10:10', 'Хмарні технології', 'лабораторна', 'Лаб. 2'],
      ['середа', '11:50', 'Комп’ютерні мережі', 'лекція', '118'],
      ['четвер', '08:30', 'Бази даних (лаб.)', 'лабораторна', 'Лаб. 3'],
      ['пʼятниця', '10:10', 'Системне програмування (лаб.)', 'лабораторна', 'Лаб. 1'],
    ]);
    setProp_('DATA_SHEET_ID', ss.getId());
    console.log('Таблиця бази знань і розкладу: ' + ss.getUrl());
  }

  if (!prop_('LOG_SHEET_ID')) {
    const log = SpreadsheetApp.create('ШІ-асистент — журнал без імен');
    fill_(log.getSheets()[0], ['Час', 'Користувач (хеш)', 'Тип', 'Текст (маскований)'], []);
    setProp_('LOG_SHEET_ID', log.getId());
    console.log('Журнал: ' + log.getUrl());
  }
  console.log('setup() done. Далі: Розгорнути → Нове розгортання → Вебдодаток (Виконувати як: Я, Доступ: Усі), ' +
    'адресу …/exec — у властивість WEB_APP_URL, потім setWebhook().');
}

// Записує заголовок і рядки в аркуш.
function fill_(sheet, header, rows) {
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.autoResizeColumns(1, header.length);
}

/** Під’єднує Telegram до цього вебдодатка. Запускайте після кожної НОВОЇ адреси (не для нових версій). */
function setWebhook() {
  const url = prop_('WEB_APP_URL', true).replace(/\?.*$/, '') + '?k=' + prop_('WEBHOOK_KEY', true);
  const updates = typeof EXTRA_UPDATES !== 'undefined' ? ['message'].concat(EXTRA_UPDATES) : ['message'];
  const r = tg_('setWebhook', { url: url, allowed_updates: updates, drop_pending_updates: true, max_connections: 20 });
  console.log(r.ok ? 'Webhook set ✔' : 'Помилка вебхука: ' + JSON.stringify(r));
}

/** Діагностика: як Telegram бачить вебхук (остання помилка, черга). Ключ замасковано. */
function getWebhookInfo() {
  const r = tg_('getWebhookInfo', {});
  if (r.result && r.result.url) r.result.url = r.result.url.replace(/k=[^&]+/, 'k=***');
  console.log(JSON.stringify(r, null, 2));
}

/** Вимикає бота (Telegram перестане надсилати повідомлення). */
function deleteWebhook() { console.log(JSON.stringify(tg_('deleteWebhook', { drop_pending_updates: true }))); }

/** Перевірка без Telegram: чи працює ключ Gemini і чи бачить бот базу знань. */
function testGemini() { console.log(askGemini_('Коли дедлайн третьої лабораторної?').text); }
