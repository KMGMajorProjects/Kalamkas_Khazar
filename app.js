'use strict';
/* =====================================================================
   Каламкас-море – Хазар · программа погружения
   1 шифрование и учётки · 2 вход · 3 оболочка · 4 движок блоков · 5 виджеты · 6 запуск
   ===================================================================== */
const CFG = window.CONFIG || null;
const HAS = new Set((CFG && CFG.assets) || []);
const banImg = (m, sm) => HAS.has(`ban-${m.id}.webp`) ? `background-image:url(ban-${m.id}${sm && HAS.has(`ban-${m.id}-sm.webp`) ? '-sm' : ''}.webp);background-position:center` : `background-image:url(${m.photo}${sm ? '-sm' : ''}.webp);background-position:${m.pos}`;
let DATA = null, USER = null, SESSION_EXP = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = {};
const fmt = (v, d = 0) => v == null || isNaN(v) ? '—' : (nf[d] ||= new Intl.NumberFormat('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })).format(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad3 = n => String(n).padStart(3, '0');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

/* =====================================================================
   1. ШИФРОВАНИЕ: данные — ключом сборки (AES-256-GCM); ключ сборки — в слоте
      каждой учётки под ключом из пароля (PBKDF2-SHA256). Слот ищется по хэшу логина/почты.
   ===================================================================== */
const te = new TextEncoder(), td = new TextDecoder();
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const norm = s => String(s || '').trim().toLowerCase();
async function sha256hex(s) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s))); return [...h].map(b => b.toString(16).padStart(2, '0')).join(''); }
let VAULT = null, BLOB = null;
async function getVault() { if (VAULT) return VAULT; const r = await fetch(CFG.vault, { cache: 'no-store' }); if (!r.ok) throw new Error('nofile'); return (VAULT = await r.json()); }
async function getBlob() { if (BLOB) return BLOB; const r = await fetch(CFG.file, { cache: 'no-store' }); if (!r.ok) throw new Error('nofile'); return (BLOB = new Uint8Array(await r.arrayBuffer())); }
async function deriveKek(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}
async function signIn(id, pw) {
  const v = await getVault();
  const slot = v.slots[await sha256hex(v.pepper + ':' + norm(id))];
  const salt = slot ? b64d(slot.s) : crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(pw, salt, v.iter);          // одинаковое время для «нет логина» и «не тот пароль»
  if (!slot) throw new Error('auth');
  let prof;
  try { prof = JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(slot.iv) }, kek, b64d(slot.c)))); }
  catch (e) { throw new Error('auth'); }
  const dek = await crypto.subtle.importKey('raw', b64d(prof.k), 'AES-GCM', false, ['decrypt']);
  delete prof.k;
  return { dek, prof };
}
async function openData(dek) { const b = await getBlob(); return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, dek, b.slice(12)))); }
const IDB = {
  db: null,
  open() { return this.db ||= new Promise((res, rej) => { const r = indexedDB.open('khz-auth', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async tx(m, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('s', m); const q = fn(t.objectStore('s')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); },
  get(k) { return this.tx('readonly', s => s.get(k)).catch(() => null); },
  set(k, v) { return this.tx('readwrite', s => s.put(v, k)).catch(() => null); },
  del(k) { return this.tx('readwrite', s => s.delete(k)).catch(() => null); },
};
const REMEMBER_H = 12, IDLE_MIN = 30;

/* =====================================================================
   2. ВХОД
   ===================================================================== */
let gateAlive = true;
function gateBackground() {
  const cv = $('#gateBg'); if (!cv) return;
  const ctx = cv.getContext('2d'); let W = 0, H = 0, mx = -1e4, my = -1e4;
  const resize = () => { const d = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  resize(); addEventListener('resize', resize);
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; });
  const N = 34, t0 = performance.now();
  const frame = now => {
    if (!gateAlive) return;
    const t = RM ? 0 : (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const gap = H / (N - 1), lim = W * .62;
    for (let i = 0; i < N; i++) {
      const y0 = i * gap; ctx.beginPath();
      for (let x = 0; x <= lim; x += 8) {
        let d = Math.sin(x * .0045 + t * .35 + i * .27) * 5 + Math.sin(x * .012 - t * .5 + i * .6) * 2;
        const dx = (x - W * .3) / (W * .18), dy = (y0 - H * .55) / (H * .3); d -= 30 * Math.exp(-(dx * dx + dy * dy));
        const mdx = x - mx, mdy = y0 - my; d += 18 * Math.exp(-(mdx * mdx + mdy * mdy) / 9000);
        x ? ctx.lineTo(x, y0 + d) : ctx.moveTo(x, y0 + d);
      }
      const g = ctx.createLinearGradient(0, 0, lim, 0); g.addColorStop(0, 'rgba(10,100,164,.13)'); g.addColorStop(.8, 'rgba(10,100,164,.06)'); g.addColorStop(1, 'rgba(10,100,164,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.stroke();
    }
    if (!RM) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function gateClock() { const el = $('#gClock'); const tick = () => { if (!gateAlive || !el) return; const d = new Date(); el.textContent = `${d.toLocaleDateString('ru-RU')} · ${d.toLocaleTimeString('ru-RU')} · соединение защищено`; setTimeout(tick, 1000); }; tick(); }
function openApp() {
  gateAlive = false; const g = $('#gate');
  g.classList.add('open'); document.body.classList.remove('locked');
  startApp(); setTimeout(() => g.remove(), 900);
}
async function gate() {
  gateBackground(); gateClock();
  if (!CFG) { $('#gateForm').innerHTML = '<div class="gate-msg"><h2>Сайт не собран</h2><p>Нет config.js. Соберите сайт скриптом <b>build_secure.py</b> и публикуйте папку <b>dist</b>.</p></div>'; return; }
  const saved = await IDB.get('sess');
  if (saved && saved.exp > Date.now() && saved.build === CFG.build) {
    try { DATA = await openData(saved.dek); USER = saved.prof; SESSION_EXP = saved.exp; openApp(); return; } catch (e) { await IDB.del('sess'); }
  } else if (saved) await IDB.del('sess');
  const form = $('#gateForm'), u = $('#gUser'), pw = $('#gPw'), btn = $('#gBtn'), bt = $('#gBtnT'), err = $('#gErr'), prog = $('#gProg'), steps = $('#gSteps');
  $('#gEye').addEventListener('click', e => { const s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; e.currentTarget.textContent = s ? 'Скрыть' : 'Показать'; pw.focus(); });
  const caps = e => { if (e.getModifierState) $('#gCaps').classList.toggle('on', e.getModifierState('CapsLock')); };
  pw.addEventListener('keyup', caps); pw.addEventListener('keydown', caps);
  const last = store.get('khz-last', ''); if (last) u.value = last;
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    if (!u.value.trim()) { err.textContent = 'Введите e-mail или логин'; u.focus(); return; }
    if (!pw.value) { err.textContent = 'Введите пароль'; pw.focus(); return; }
    btn.disabled = true; bt.textContent = 'Проверяем…'; prog.classList.add('on'); steps.innerHTML = '';
    const step = t => steps.insertAdjacentHTML('beforeend', `<span>${t}</span>`);
    try {
      const { dek, prof } = await signIn(u.value, pw.value);
      step('ключ получен'); await sleep(120); step('профиль расшифрован');
      DATA = await openData(dek); await sleep(120); step('материал расшифрован');
      USER = prof; store.set('khz-last', u.value.trim());
      if ($('#gRem').checked) { SESSION_EXP = Date.now() + REMEMBER_H * 3600e3; await IDB.set('sess', { dek, prof, exp: SESSION_EXP, build: CFG.build }); }
      bt.textContent = 'Добро пожаловать'; form.classList.add('ok'); prog.classList.remove('on');
      $('#lockArc').setAttribute('d', 'M8 10V7a4 4 0 0 1 7.5-2');
      await sleep(420); openApp();
    } catch (ex) {
      btn.disabled = false; bt.textContent = 'Войти'; prog.classList.remove('on'); steps.innerHTML = '';
      err.textContent = ex && (ex.message === 'nofile' || ex instanceof TypeError) ? 'Не найдены файлы данных. Открывайте сайт по ссылке, а не с диска.' : 'Неверный логин или пароль';
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); pw.select();
    }
  });
  setTimeout(() => (u.value ? pw : u).focus(), 350);
}


/* ---------- иконки модулей (сквиркулы в стиле iOS) ---------- */
const ICO = {
  start: ['#19a2df', '#0a2547', 'M3 11l9-7 9 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5z'],
  m01: ['#3fb6ff', '#0a64a4', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11.2v1.6'],
  m02: ['#2bc6b4', '#0b6f8a', 'M12 3.5l9 4.8-9 4.8-9-4.8zM3 12.3l9 4.8 9-4.8M3 16.4l9 4.8 9-4.8'],
  m03: ['#5aa9ff', '#1d3d9a', 'M8 21l4-17 4 17M9.4 15h5.2M10.6 9.5h2.8M3.5 21h17M6 17.5h12'],
  m04: ['#36c2e0', '#0a64a4', 'M12 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6.5V21M5 13.5a7 7 0 0 0 14 0M8.5 10h7'],
  m05: ['#8f7bff', '#3b3ab8', 'M4 20l4.2-1 11-11a2.1 2.1 0 0 0-3-3l-11 11zM14.5 6.5l3 3M4 20h7'],
  m06: ['#ffb340', '#e0712b', 'M6 21V4.5M6 4.5h13M6 4.5l12 6M17.5 4.5v6M17.5 10.5v3.5M15.5 14h4M3 21h7'],
  m07: ['#34d399', '#0f957a', 'M4 20V11M9.5 20V5M15 20v-6.5M20.5 20V8.5M3 20.5h18'],
  m08: ['#ff6b81', '#c81e45', 'M12 3l8 3v6c0 5-3.5 8.2-8 9-4.5-.8-8-4-8-9V6zM12 8.2v4.6M12 15.8v.4'],
  m09: ['#2dd4bf', '#0d6e7a', 'M10 13.5a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10.5a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2'],
  m10: ['#7aa2c8', '#0a2547', 'M3 9.5L12 4l9 5.5M5.5 9.5v8.5M10 9.5v8.5M14 9.5v8.5M18.5 9.5v8.5M3 20.5h18'],
  m11: ['#ff8a5c', '#d6383a', 'M4.5 6h15A1.5 1.5 0 0 1 21 7.5v12a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-12A1.5 1.5 0 0 1 4.5 6zM3 10.5h18M8 3.5v4.5M16 3.5v4.5M7.5 15h3'],
  m12: ['#60a5fa', '#2563eb', 'M10 6.5h10M10 12h10M10 17.5h10M3.8 6.5l1.4 1.4 2.4-2.6M3.8 12l1.4 1.4 2.4-2.6M3.8 17.5l1.4 1.4 2.4-2.6'],
  mA: ['#a3b3c8', '#3b5170', 'M3 7.5A2 2 0 0 1 5 5.5h4.2l2 2.2H19a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
};
const sq = (id, cls = '') => { const [a, b, d] = ICO[id] || ICO.start; return `<span class="sq ${cls}" style="--g1:${a};--g2:${b}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`; };

/* =====================================================================
   3. ОБОЛОЧКА
   ===================================================================== */
let ROUTE = { page: 'start', slide: null }, CLEAN = [];
const S = n => DATA.slides[String(n)];
const MOD_OF = {};
const seenKey = () => 'khz-seen-' + (USER.l || USER.e);
function logout() { IDB.del('sess').finally(() => location.reload()); }

function shell() {
  DATA.modules.forEach(m => m.slides.forEach(n => { MOD_OF[n] ||= m.id; }));
  (DATA.intro || []).forEach(n => { MOD_OF[n] ||= 'start'; });
  const initials = (USER.n || USER.l || '?').replace(/[.]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  $('#av').textContent = initials; $('#whoN').textContent = USER.n || USER.l; $('#whoR').textContent = USER.r || '—';
  $('#amN').textContent = USER.n || '—'; $('#amL').textContent = USER.l || '—'; $('#amE').textContent = USER.e || '—'; $('#amR').textContent = USER.r || '—';
  $('#amS').textContent = SESSION_EXP ? new Date(SESSION_EXP).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'до закрытия вкладки';
  const m = DATA.meta, asof = m.asof ? m.asof.split('-').reverse().join('.') : '—';
  $('#railAsof').textContent = 'данные обновлены ' + asof;
  $('#ftL').textContent = `Программа погружения ДКНП · данные обновлены ${asof} · ${m.count} слайдов · сборка ${CFG ? CFG.build : 'local'}`;
  const acct = $('#acct'), ab = $('#acctBtn');
  ab.addEventListener('click', e => { e.stopPropagation(); const o = acct.classList.toggle('open'); ab.setAttribute('aria-expanded', o); });
  document.addEventListener('click', e => { if (!acct.contains(e.target)) { acct.classList.remove('open'); ab.setAttribute('aria-expanded', 'false'); } });
  $('#logout').addEventListener('click', logout);
  // навигация
  $('#nav').innerHTML = `<a href="#start" data-p="start">${sq('start')}Старт<span class="seen"></span></a><div class="rail-sep">Модули</div>` +
    DATA.modules.map(x => `${x.id === 'mA' ? '<div class="rail-sep">Приложение</div>' : ''}<a href="#${x.id}" data-p="${x.id}">${sq(x.id)}${esc(x.s)}<span class="seen"></span></a>`).join('');
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav'));
  $('#nav').addEventListener('click', () => document.body.classList.remove('nav'));
  addEventListener('hashchange', route);
  // поиск
  initSearch();
  // бездействие
  let lastAct = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
  setInterval(() => { if (Date.now() - lastAct > IDLE_MIN * 60e3 || (SESSION_EXP && Date.now() > SESSION_EXP)) logout(); }, 30e3);
  // параллакс фото
  let pr = 0; addEventListener('scroll', () => { if (pr || RM) return; pr = requestAnimationFrame(() => { pr = 0; const y = scrollY; $$('.par').forEach(el => { const r = el.parentElement.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; el.style.translate = `0 ${(r.top * -.1).toFixed(1)}px`; }); }); }, { passive: true });
}
function markSeen(id) {
  const seen = new Set(store.get(seenKey(), [])); seen.add(id); store.set(seenKey(), [...seen]);
  $$('#nav a').forEach(a => a.classList.toggle('v', seen.has(a.dataset.p)));
  const total = DATA.modules.length + 1, k = [...seen].filter(x => x === 'start' || DATA.modules.some(m => m.id === x)).length;
  $('#progT').textContent = `изучено ${k} / ${total}`; $('#progB').style.width = (k / total * 100) + '%';
}
function route() {
  const h = decodeURIComponent(location.hash.slice(1)); const [p, s] = h.split('/');
  const page = p === 'start' || DATA.modules.some(m => m.id === p) ? p : 'start';
  const slide = s && s.startsWith('s') ? +s.slice(1) : null;
  const same = ROUTE.page === page && $('#main').children.length;
  ROUTE = { page, slide };
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.p === page));
  if (!same) render();
  markSeen(page);
  if (slide) {
    const el = $('#s' + (slide === 159 ? 158 : slide));
    if (el) { el.classList.add('in'); $$('.reveal', el).forEach(x => x.classList.add('in')); setTimeout(() => { el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); }, same ? 30 : 250); }
  } else if (!same) scrollTo({ top: 0 });
}
function render() {
  CLEAN.forEach(f => f()); CLEAN = [];
  const main = $('#main'), mods = DATA.modules;
  if (ROUTE.page === 'start') {
    $('#crumb').innerHTML = sq('start') + '<b>Старт · проект в 60 секундах</b>';
    main.innerHTML = pageStart();
  } else {
    const i = mods.findIndex(m => m.id === ROUTE.page), m = mods[i];
    $('#crumb').innerHTML = `${sq(m.id)}<b>${m.n} · ${esc(m.s)}</b>`;
    const flagged = m.slides.filter(n => S(n).flag).length;
    const prev = i > 0 ? mods[i - 1] : null, next = mods[i + 1];
    main.innerHTML = `<div class="page">
      <section class="banner reveal"><div class="ph par" style="${banImg(m)}"></div>
        <div class="ban-num">${m.n}</div><span class="ill">фото — иллюстрация</span>
        <div class="ban-card glass prism"><div class="eyebrow">${sq(m.id)}${m.id === 'mA' ? 'Приложение' : 'Модуль ' + m.n}<span class="chip">${m.slides.length} слайдов</span></div>
          <h1>${esc(m.t)}</h1><p>${esc(m.d)}</p>
          <div class="ban-meta"><span class="chip info">слайды ${pad3(m.slides[0])}–${pad3(m.slides[m.slides.length - 1])}</span>${flagged ? `<span class="chip warn">⚠ ${flagged} с оговоркой о сверке</span>` : ''}</div></div>
      </section>
      <div class="blocks">${m.slides.map(n => block(S(n))).join('')}</div>
      <nav class="pager">${prev ? `<a class="pg glass reveal" href="#${prev.id}"><span class="lbl">← ${prev.n}</span><b>${esc(prev.s)}</b></a>` : '<a class="pg glass reveal" href="#start"><span class="lbl">← 00</span><b>Старт</b></a>'}
        ${next ? `<a class="pg nx glass reveal" href="#${next.id}"><span class="lbl">${next.n} →</span><b>${esc(next.s)}</b></a>` : '<span></span>'}</nav>
    </div>`;
  }
  wireFx(main);
  $$('[data-w]', main).forEach(el => { const f = MOUNT[el.dataset.w]; if (f) try { f(el, S(+el.dataset.n)); } catch (e) { console.error(e); } });
}

/* ---------- эффекты ---------- */
function wireFx(root) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    $$('[data-cu]', e.target).forEach(countUp);
    e.target.dispatchEvent(new CustomEvent('seen'));
  }), { threshold: .08 });
  $$('.reveal', root).forEach(el => io.observe(el));
  CLEAN.push(() => io.disconnect());
  $$('.spot', root).forEach(el => {
    el.insertAdjacentHTML('afterbegin', '<span class="spot-l"></span>');
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
  });
}
function countUp(el) {
  const to = +el.dataset.cu, d = +(el.dataset.d || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '', t0 = performance.now(), dur = RM ? 0 : 1300;
  const f = now => { const k = dur ? clamp((now - t0) / dur, 0, 1) : 1; el.textContent = pre + fmt(to * (1 - Math.pow(1 - k, 3)), d) + suf; if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
/* «~86 млн т» → счётчик; даты, диапазоны и годы остаются текстом */
function numHTML(v) {
  const m = /^([~≈$№]*)(\d{1,3}(?:[  ]\d{3})*|\d+)(,\d+)?(.*)$/.exec(v);
  if (!m) return esc(v);
  const [, pre, int, frac, suf] = m; const n = parseFloat(int.replace(/\s/g, '') + (frac ? '.' + frac.slice(1) : ''));
  if (/^[.,:\d–\-/]/.test(suf) || (!pre && n >= 1900 && n <= 2100) || /\d/.test(suf.slice(0, 3))) return esc(v);
  return `<span data-cu="${n}" data-d="${frac ? frac.length - 1 : 0}" data-pre="${esc(pre)}" data-suf="${esc(suf)}">${esc(v)}</span>`;
}
function hover(box, svg, n, x0, x1, vbW, onMove) {
  const tip = $('.tip', box);
  const move = e => {
    const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) / r.width * vbW;
    const i = clamp(Math.round((sx - x0) / ((x1 - x0) || 1) * (n - 1)), 0, n - 1);
    const html = onMove(i); if (html == null) return;
    tip.innerHTML = html; tip.classList.add('on');
    const br = box.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = e.clientX - br.left + 16; if (lx + tw > br.width) lx = e.clientX - br.left - tw - 16;
    tip.style.transform = `translate(${Math.max(0, lx)}px,${clamp(e.clientY - br.top - th / 2, -10, br.height - th)}px)`;
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
}

/* =====================================================================
   4. ДВИЖОК БЛОКОВ
   ===================================================================== */
const notesHTML = (arr, warn) => arr && arr.length ? `<div class="notes${warn ? ' warn' : ''}">${arr.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : '';
function body(s) {
  switch (s.type) {
    case 'points': return `<ol class="pts">${s.items.map((t, i) => `<li style="--i:${i}"><span class="k">${String(i + 1).padStart(2, '0')}</span><span>${esc(t)}</span></li>`).join('')}</ol>`;
    case 'stats': return `<div class="sts">${s.items.map(([v, l]) => `<div class="st"><b>${numHTML(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
    case 'flow': return flowHTML(s.steps);
    case 'timeline': return `<ol class="tl">${s.items.map(([d, x], i) => `<li style="--i:${i}"><span class="d">${esc(d)}</span><span class="x">${esc(x)}</span></li>`).join('')}</ol>`;
    case 'compare': {
      const col = h => /НЕ |НЕТ|ОТРИЦ|РИСК|ИНОСТР/.test(h) ? 'var(--crim)' : /ДОСТИГ|ПОЛОЖ/.test(h) ? 'var(--good)' : 'var(--brand)';
      return `<div class="cmp">${s.cols.map(c => `<div class="col" style="--cc:${col(c.h)}"><h4>${esc(c.h)}</h4><ul>${c.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>`;
    }
    case 'table': return tableHTML(s.head, s.rows);
    case 'quote': return `<p class="quote">${esc(s.items[0])}</p>${s.items[1] ? `<p>${esc(s.items[1])}</p>` : ''}`;
    default: return `<div class="pts">${(s.items || []).map(t => `<p style="margin:0 0 6px">${esc(t)}</p>`).join('')}</div>`;
  }
}
function tableHTML(head, rows) {
  return `<div class="tw cards"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td data-l="${esc(head[i] || '')}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function flowHTML(steps, nowIdx = -1) {
  const arr = '<span class="fa"><svg width="26" height="12" viewBox="0 0 26 12"><path class="dash" d="M1 6h20" stroke="currentColor" stroke-width="2" fill="none"/><path d="M18 1l6 5-6 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>';
  return `<div class="flow">${steps.map((st, i) => `${i ? arr : ''}<div class="fs${i === nowIdx ? ' now' : ''}" style="--i:${i}"><span class="k">${esc(st.k)}</span><b>${esc(st.t)}</b></div>`).join('')}</div>`;
}

/* ---------- фото в блоках: свой файl sNNN.webp (если положить в корень), иначе фото из набора ---------- */
const SIMG = { 22: 'Мелководный ледовый Каспий', 29: 'Ледостойкая морская платформа', 34: 'Береговой комплекс CPF', 47: 'Обследование коридора UXO',
  53: 'Морские инженерные изыскания', 75: 'Изготовление на казахстанской верфи', 77: 'Буксировка модуля по каналу', 78: 'Long-lead оборудование' };

function figHTML(n) {
  const cap = SIMG[n], own = 's' + pad3(n) + '.webp';
  if (!cap || !HAS.has(own)) return '';
  return `<figure class="sfig"><img src="${own}" alt="" loading="lazy"><figcaption>${esc(cap)} · иллюстрация</figcaption></figure>`;
}
const WIDE = new Set(['table', 'flow', 'compare', 'quote']);
function block(s, opts = {}) {
  if (!s || s.type === 'divider') return '';
  if (s.n === 159) return '';
  const len = JSON.stringify(s).length;
  const wide = opts.wide ?? (s.w || s.n === 44 || WIDE.has(s.type) || (s.type === 'timeline' && s.items.length > 3) || len > 1100);
  const cls = { quote: 'glass ice prism', compare: 'glass hi' }[s.type] || (s.w ? 'glass hi tick' : 'glass');
  const title = s.n === 158 ? 'Глоссарий: 30 терминов и сокращений' : s.t;
  let inner = s.w && W[s.w] ? W[s.w](s) : body(s) + notesHTML(s.notes, s.flag);
  if (s.n === 44) inner = `<div class="duo"><div>${body(s)}</div>${dredgeSVG()}</div>${notesHTML(s.notes, s.flag)}`;
  else inner = figHTML(s.n) + inner;
  return `<section class="blk ${cls} spot reveal${wide ? ' w2' : ''}" id="s${s.n}" ${s.w && MOUNT[s.w] ? `data-w="${s.w}" data-n="${s.n}"` : ''}>
    <div class="b-h"><span class="sl">СЛ ${pad3(s.n)}</span><h3>${esc(title)}</h3>${s.flag ? '<span class="chip warn flag" title="В тексте слайда есть оговорка: цифры/даты требуют сверки с первичным документом">⚠ сверка</span>' : ''}</div>
    ${inner}</section>`;
}

/* ---------- стартовая страница ---------- */
function pageStart() {
  const s6 = S(6), s2 = S(2);
  const mods = DATA.modules;
  const seen = new Set(store.get(seenKey(), []));
  const desc = {}; (S(4).rows || []).forEach(r => { desc[r[0]] = r[2]; });
  return `<div class="page">
    <section class="hero reveal in"><div class="ph par"></div>
      <div class="hero-txt">
        <div class="eyebrow">Программа погружения · данные обновлены ${DATA.meta.asof.split('-').reverse().join('.')}</div>
        <h1>Каламкас-море<span>– Хазар</span></h1>
        <p>${esc(s6.notes[0])} ${esc(s6.notes[1])}</p>
        <div class="hero-status"><span class="chip glassy" style="color:var(--brand)"><span class="pulse"></span>${esc(s2.items[3][0])} · ${esc(s2.items[3][1])}</span><span class="chip glassy">3 участка недр</span><span class="chip glassy">12 модулей · ${DATA.meta.count} слайдов</span></div>
        <div class="hero-kpi">${s6.items.map(([v, l]) => `<div class="hk glass prism"><b>${numHTML(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      </div>
      <div class="hero-side">
        <div class="float glass" style="right:8%;top:9%;--dl:0s"><span class="lbl">FEED</span><b>99,9% факт</b>не равно FID</div>
        <div class="float glass" style="right:26%;top:30%;--dl:1.4s"><span class="lbl">OFAC</span><b>на рассмотрении</b>разрешение не подтверждено</div>
        <div class="float glass" style="right:6%;top:52%;--dl:.7s"><span class="lbl">CNOOC</span><b>HoA подписан</b>сделки не завершены</div>
        <div class="float glass" style="right:30%;bottom:9%;--dl:2s"><span class="lbl">Цель FID</span><b>III кв. 2027</b>условная</div>
      </div>
    </section>
    <div class="blocks">
      ${block(S(7))}
      ${block(S(10))}
      ${block(S(139))}
      ${block(S(140))}
      <section class="blk glass w2 reveal"><div class="b-h"><span class="sl">СЛ 004</span><h3>12 модулей + приложение</h3><span class="chip">изучено ${[...seen].filter(x => x !== 'start').length}</span></div>
        <div class="mods">${mods.map((m, i) => `<a class="mod reveal" style="--d:${i * 40}ms;--k:${i}" href="#${m.id}"><div class="ph" style="${banImg(m, 1)}"></div>${sq(m.id, 'mico')}${seen.has(m.id) ? '<span class="chip good v">✓ изучено</span>' : ''}<div class="mod-c glass"><span class="no">${m.id === 'mA' ? 'ПРИЛОЖЕНИЕ' : 'МОДУЛЬ ' + m.n}</span><b>${esc(m.s)}</b><span class="clamp">${esc(desc[m.n] || m.d)}</span></div></a>`).join('')}</div></section>
      ${block(S(168))}
      ${block(S(3))}
      ${block(S(2), { wide: true })}
    </div></div>`;
}

/* =====================================================================
   5. ВИДЖЕТЫ
   W[w](slide) → html; MOUNT[w](el, slide) → поведение
   ===================================================================== */
const W = {}, MOUNT = {};
const ptsMini = (arr, start = 0) => `<ol class="pts">${arr.map((t, i) => `<li style="--i:${i}"><span class="k">${String(i + 1 + start).padStart(2, '0')}</span><span>${esc(t)}</span></li>`).join('')}</ol>`;

/* ---- карта ---- */
W.map = s => `<div class="map" id="mapW"><svg viewBox="0 0 900 500" aria-label="Схема расположения">
  <defs><radialGradient id="kG"><stop offset="0" stop-color="#19a2df" stop-opacity=".55"/><stop offset="1" stop-color="#0a64a4" stop-opacity=".15"/></radialGradient>
  <radialGradient id="hG"><stop offset="0" stop-color="#ff5a6e" stop-opacity=".5"/><stop offset="1" stop-color="#e0284a" stop-opacity=".12"/></radialGradient>
  <pattern id="sand" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="#c9b48a" opacity=".5"/></pattern></defs>
  ${[0, 1, 2, 3, 4].map(k => `<path d="M0 ${120 + k * 70} C200 ${100 + k * 70} 380 ${150 + k * 60} 600 ${120 + k * 66} S860 ${170 + k * 58} 900 ${150 + k * 62}" fill="none" stroke="#0a64a4" stroke-opacity=".08" stroke-dasharray="2 6"/>`).join('')}
  <path d="M900 120 C810 160 730 220 655 290 C610 330 572 345 560 362 C550 382 566 394 596 398 C646 404 692 424 722 452 C742 470 752 488 760 500 L900 500 Z" fill="#f2ead8"/>
  <path d="M900 120 C810 160 730 220 655 290 C610 330 572 345 560 362 C550 382 566 394 596 398 C646 404 692 424 722 452 C742 470 752 488 760 500 L900 500 Z" fill="url(#sand)" stroke="#b89b64" stroke-width="1.4"/>
  <text x="705" y="400" style="font:500 12px Onest,sans-serif;fill:#7a6640">полуостров Бузачи</text>
  <text x="70" y="70" style="font:500 13px 'IBM Plex Mono',monospace;letter-spacing:.35em;fill:#0a64a4;opacity:.55">КАСПИЙСКОЕ МОРЕ</text>
  <g><path class="route-d" d="M470 178 L690 262" stroke="#0a2547" stroke-opacity=".5" fill="none"/><rect x="545" y="196" width="104" height="22" rx="6" fill="#fff" opacity=".9"/><text x="597" y="211" text-anchor="middle" style="font:500 11px 'IBM Plex Mono',monospace;fill:#0a2547">~64 км до берега</text></g>
  <g><path class="route-d" d="M440 186 L322 258" stroke="#0a2547" stroke-opacity=".5" fill="none"/><rect x="330" y="206" width="86" height="22" rx="6" fill="#fff" opacity=".9"/><text x="373" y="221" text-anchor="middle" style="font:500 11px 'IBM Plex Mono',monospace;fill:#0a2547">~30 км ЮЗ</text></g>
  <g><path class="route-d" d="M318 276 L556 362" stroke="#e0284a" stroke-opacity=".5" fill="none"/><rect x="380" y="318" width="118" height="22" rx="6" fill="#fff" opacity=".9"/><text x="439" y="333" text-anchor="middle" style="font:500 11px 'IBM Plex Mono',monospace;fill:#e0284a">~65 км до Бузачи</text></g>
  <g class="mk" data-k="0"><ellipse cx="470" cy="176" rx="124" ry="16" transform="rotate(-11 470 176)" fill="url(#kG)" stroke="#0a64a4" stroke-width="1.5" class="core"/><circle cx="470" cy="176" r="6" fill="#0a64a4"/><circle class="halo" cx="470" cy="176" r="6" fill="none" stroke="#0a64a4" stroke-width="2"/>
    <text x="470" y="146" text-anchor="middle" style="font:600 15px Unbounded,Onest,sans-serif;fill:#0a2547">Каламкас-море</text><text x="470" y="214" text-anchor="middle" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:#3b5170">~50 × 6 км</text></g>
  <g class="mk" data-k="1"><ellipse cx="300" cy="268" rx="62" ry="24" transform="rotate(-18 300 268)" fill="url(#hG)" stroke="#e0284a" stroke-width="1.5" class="core"/><circle cx="300" cy="268" r="6" fill="#e0284a"/><circle class="halo" cx="300" cy="268" r="6" fill="none" stroke="#e0284a" stroke-width="2" style="animation-delay:.8s"/>
    <text x="300" y="312" text-anchor="middle" style="font:600 15px Unbounded,Onest,sans-serif;fill:#0a2547">Хазар</text></g>
  <path id="boatPath" d="M380 150 C430 120 560 130 590 170 C610 200 520 220 450 210 C390 200 350 180 380 150 Z" fill="none"/>
  <g><path d="M-7 -4 L7 0 L-7 4 Z" fill="#0a2547"/><animateMotion dur="18s" repeatCount="indefinite" rotate="auto"><mpath href="#boatPath"/></animateMotion></g>
  <g transform="translate(70 420)"><circle r="24" fill="#fff" opacity=".8"/><path d="M0 -17 L6 4 L0 0 L-6 4 Z" fill="#0a2547"/><text y="-28" text-anchor="middle" style="font:600 11px 'IBM Plex Mono',monospace;fill:#0a2547">С</text></g>
  <g transform="translate(130 470)"><rect width="200" height="22" rx="7" fill="#fff" opacity=".8"/><text x="10" y="15" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:#3b5170">глубины 6–8 м · схема не в масштабе</text></g>
  </svg><div class="mapcard glass prism" id="mapCard"></div></div>
  <div class="yr" style="margin-top:12px"><button class="btn" data-k="0">Каламкас-море</button><button class="btn" data-k="1">Хазар</button><button class="btn" data-k="2">Ауэзов</button></div>
  ${notesHTML([s.items[s.items.length - 1]])}`;
MOUNT.map = el => {
  const s18 = S(18), s17 = S(17);
  const info = [
    { t: 'Каламкас-море', c: 'var(--brand)', p: s18.items[0], x: `${s17.items[0][0]} от берега · структура ${s17.items[3][0]} · ${s17.notes[0]}` },
    { t: 'Хазар', c: 'var(--crim)', p: s18.items[1], x: `${s17.items[1][0]} к ЮЗ от Каламкас-море · ${s17.notes[1]}` },
    { t: 'Ауэзов', c: 'var(--warn)', p: s18.items[2], x: 'На схеме не показан: положение и фазу освоения брать из актуальной ПДПР / GIS.' },
  ];
  const card = $('#mapCard', el);
  const show = k => { const i = info[k]; card.innerHTML = `<span class="lbl" style="color:${i.c}">участок недр · СЛ 018</span><h4>${i.t}</h4><p>${esc(i.p)}</p><p style="margin-top:8px;font-size:12px">${esc(i.x)}</p>`; $$('.yr .btn', el).forEach(b => b.classList.toggle('on', +b.dataset.k === k)); };
  $$('.mk', el).forEach(g => g.addEventListener('click', () => show(+g.dataset.k)));
  $$('.yr .btn', el).forEach(b => b.addEventListener('click', () => show(+b.dataset.k)));
  show(0);
};

/* ---- ресурсы: версии оценок ---- */
W.resources = s => `<div class="wtop"><div class="seg" id="resSeg"><button class="on" data-k="1">Нефть, млн т</button><button data-k="2">Газ, млрд м³</button></div>
  <div class="legend"><span style="--c:var(--brand)"><i></i>оценка</span><span style="--c:var(--warn)"><i class="hatch"></i>категория не ясна — проверить</span></div></div>
  <div class="chart" id="resC"></div>${tableHTML(s.head, s.rows)}${notesHTML(s.notes, true)}`;
MOUNT.resources = (el, s) => {
  const parse = v => { const m = /([\d]+(?:,\d+)?)/.exec(v || ''); return m ? parseFloat(m[1].replace(',', '.')) : null; };
  const draw = k => {
    const rows = s.rows.map(r => ({ l: r[0], v: parse(r[k]), raw: r[k], odd: /238/.test(r[1]) }));
    const mx = Math.max(...rows.map(r => r.v || 0)) * 1.08;
    $('#resC', el).innerHTML = `<div style="display:grid;gap:9px;margin-bottom:16px">${rows.map((r, i) => `<div style="display:grid;grid-template-columns:minmax(120px,190px) 1fr 86px;gap:12px;align-items:center;font-size:13px">
      <span style="color:var(--ink-2)">${esc(r.l)}</span>
      <span style="height:14px;border-radius:7px;background:rgba(8,36,74,.06);overflow:hidden"><i style="display:block;height:100%;width:${r.v ? r.v / mx * 100 : 0}%;border-radius:7px;background:${r.odd ? 'repeating-linear-gradient(45deg,var(--warn) 0 3px,rgba(192,131,0,.35) 3px 7px)' : 'linear-gradient(90deg,var(--brand-2),var(--brand))'};transform-origin:left;animation:grow 1s var(--ease) ${i * 90}ms backwards"></i></span>
      <b class="mono" style="text-align:right;color:var(--navy)">${esc(r.raw)}</b></div>`).join('')}</div>`;
  };
  $('#resSeg', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$('#resSeg button', el).forEach(x => x.classList.toggle('on', x === b)); draw(+b.dataset.k); });
  draw(1);
};
document.head.insertAdjacentHTML('beforeend', '<style>@keyframes grow{from{transform:scaleX(0)}}</style>');

/* ---- производство: конвертер + учебный симулятор ---- */
const SIM = { qi: 450, di: 18, b: .5, wells: 40, pace: 10 };
const SIM_CTL = [
  { k: 'qi', l: 'Начальный дебит скважины', u: 'т/сут', min: 50, max: 1000, st: 10, d: 0 },
  { k: 'di', l: 'Темп падения', u: '%/год', min: 5, max: 60, st: 1, d: 0 },
  { k: 'b', l: 'Показатель Арпса b', u: '', min: 0, max: 1, st: .05, d: 2 },
  { k: 'wells', l: 'Фонд скважин', u: 'скв.', min: 5, max: 120, st: 1, d: 0 },
  { k: 'pace', l: 'Темп ввода', u: 'скв./год', min: 2, max: 30, st: 1, d: 0 },
];
W.production = s => `${body(s)}${notesHTML(s.notes, s.flag)}
  <div class="sim" style="margin-top:18px">
    <div class="glass lo" style="padding:16px;border-radius:16px"><div class="lbl" style="margin-bottom:10px">Конвертер плато</div>
      <label class="ctl"><span class="ctl-h"><span>Добыча, барр./сут</span><output id="cvB"></output></span><input type="range" id="cvBr" min="20000" max="140000" step="1000" value="80000"></label>
      <label class="ctl" style="margin-top:10px"><span class="ctl-h"><span>Баррелей в тонне</span><output id="cvF"></output></span><input type="range" id="cvFr" min="6.8" max="7.8" step="0.05" value="7.3"></label>
      <div class="out" style="margin-top:12px"><small>годовая добыча</small><b id="cvO">—</b><small>млн т/год · целевое плато ~4</small></div>
      <p style="font-size:11.5px;color:var(--muted);margin:10px 0 0">Коэффициент зависит от плотности нефти; 7,3 — типовой ориентир, не паспорт нефти проекта.</p></div>
    <div><div class="wtop"><div><div class="eyebrow">Учебный симулятор</div><b style="font:600 15px var(--display);color:var(--navy)">Профиль добычи «что если» (Арпс)</b></div></div>
      <div class="outs"><div class="out"><small>пик</small><b id="soPk">—</b><small id="soPkY">—</small></div><div class="out"><small>за 25 лет</small><b id="soCum">—</b><small>млн т</small></div><div class="out" id="soPlB"><small>лет ≥ 4 млн т/г</small><b id="soPl">—</b><small>плато к цели</small></div></div>
      <div class="chart" id="simC"><div class="tip"></div></div></div>
  </div>
  <div class="ctls" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));display:grid;margin-top:14px">${SIM_CTL.map(c => `<label class="ctl"><span class="ctl-h"><span>${c.l}</span><output id="o_${c.k}"></output></span><input type="range" id="r_${c.k}" min="${c.min}" max="${c.max}" step="${c.st}" value="${SIM[c.k]}"></label>`).join('')}</div>
  <div class="notes warn"><p>Параметры симулятора не из ПДПР: фонд скважин и профиль по месторождениям — в списке технических пробелов (СЛ 167). Это инструмент для обсуждения, не прогноз.</p></div>`;
function simCalc(p) {
  const Y = 25, M = Y * 12, Di = p.di / 100, q = new Float64Array(M), w = new Int32Array(M);
  for (let k = 0; k < p.wells; k++) { const st = Math.floor(k * 12 / p.pace); if (st >= M) break; for (let m = st; m < M; m++) { const t = (m - st) / 12; q[m] += p.b < .01 ? p.qi * Math.exp(-Di * t) : p.qi / Math.pow(1 + p.b * Di * t, 1 / p.b); w[m]++; } }
  const yr = [], wy = []; for (let y = 0; y < Y; y++) { let s = 0; for (let m = 0; m < 12; m++) s += q[y * 12 + m] * 30.4167; yr.push(s / 1e6); wy.push(w[y * 12 + 11]); }
  return { yr, wy };
}
MOUNT.production = el => {
  const cv = () => { const b = +$('#cvBr', el).value, f = +$('#cvFr', el).value; $('#cvB', el).textContent = fmt(b); $('#cvF', el).textContent = fmt(f, 2); $('#cvO', el).textContent = fmt(b * 365 / f / 1e6, 2);
    ['#cvBr', '#cvFr'].forEach(id => { const r = $(id, el); r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }); };
  $('#cvBr', el).addEventListener('input', cv); $('#cvFr', el).addEventListener('input', cv); cv();
  const box = $('#simC', el), Wd = 620, H = 240, l = 40, r = 10, t = 10, b = 26;
  box.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${Wd} ${H}"><defs><linearGradient id="simG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0a64a4" stop-opacity=".45"/><stop offset="1" stop-color="#19a2df" stop-opacity=".04"/></linearGradient></defs>
    <g class="sg"></g><g class="sb"></g><path class="sa" fill="url(#simG)"/><path class="sl2" fill="none" stroke="#0a64a4" stroke-width="2.4" stroke-linejoin="round"/>
    <line class="tg" stroke="#e0284a" stroke-dasharray="5 4"/><text class="tgl" style="font:500 10px 'IBM Plex Mono',monospace;fill:#e0284a">цель ~4 млн т/г</text>
    <rect x="${l}" y="${t}" width="${Wd - l - r}" height="${H - t - b}" fill="transparent"/></svg>`);
  const svg = $('svg', box); let res, raf = 0;
  const draw = () => {
    raf = 0; res = simCalc(SIM); const { yr, wy } = res, n = 25, pk = Math.max(...yr), pi = yr.indexOf(pk);
    const top = Math.max(5, Math.ceil(pk * 1.15)), X = i => l + (i + .5) / n * (Wd - l - r), Y = v => t + (1 - v / top) * (H - t - b);
    let g = ''; for (let k = 0; k <= 4; k++) { const v = top * k / 4; g += `<line class="gl" x1="${l}" x2="${Wd - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${fmt(v, v < 10 ? 1 : 0)}</text>`; }
    for (let i = 0; i < n; i += 4) g += `<text class="ax" x="${X(i)}" y="${H - 7}" text-anchor="middle">${i + 1} г.</text>`;
    $('.sg', svg).innerHTML = g;
    const mw = Math.max(...wy) || 1; $('.sb', svg).innerHTML = wy.map((v, i) => `<rect x="${X(i) - 4}" y="${H - b - v / mw * 30}" width="8" height="${v / mw * 30}" rx="2" fill="rgba(8,36,74,.1)"/>`).join('');
    const d = yr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
    $('.sl2', svg).setAttribute('d', d); $('.sa', svg).setAttribute('d', `${d}L${X(n - 1)} ${H - b}L${X(0)} ${H - b}Z`);
    const ty = Y(4); [['x1', l], ['x2', Wd - r], ['y1', ty], ['y2', ty]].forEach(([a, v]) => $('.tg', svg).setAttribute(a, v)); $('.tgl', svg).setAttribute('x', Wd - r - 96); $('.tgl', svg).setAttribute('y', ty - 5);
    const pl = yr.filter(v => v >= 4).length;
    $('#soPk', el).textContent = fmt(pk, 2) + ' млн т'; $('#soPkY', el).textContent = `${pi + 1}-й год`; $('#soCum', el).textContent = fmt(yr.reduce((a, v) => a + v, 0), 0); $('#soPl', el).textContent = pl;
    $('#soPlB', el).className = 'out ' + (pl >= 5 ? 'ok' : pl ? '' : 'no');
    SIM_CTL.forEach(c => { const r = $('#r_' + c.k, el); $('#o_' + c.k, el).textContent = `${fmt(SIM[c.k], c.d)} ${c.u}`.trim(); r.style.setProperty('--p', ((SIM[c.k] - c.min) / (c.max - c.min) * 100) + '%'); });
  };
  SIM_CTL.forEach(c => $('#r_' + c.k, el).addEventListener('input', e => { SIM[c.k] = +e.target.value; if (!raf) raf = requestAnimationFrame(draw); }));
  draw();
  hover(box, svg, 25, l + (Wd - l - r) / 50, Wd - r - (Wd - l - r) / 50, Wd, i => `<div class="t-h">${i + 1}-й год</div><div class="t-r"><span><i style="--c:#0a64a4"></i>Добыча</span><b>${fmt(res.yr[i], 2)} млн т</b></div><div class="t-r"><span>Скважин</span><b>${res.wy[i]}</b></div>`);
};

/* ---- схема объектов ---- */
const SCH = [
  { k: 'OFFSHORE', t: 'Пласт / скважины', n: 30, c: '#0a2547' },
  { k: 'ICE-RESISTANT', t: 'Платформы 1–2', n: 29, c: '#0a64a4' },
  { k: 'SUBSEA', t: 'Трубопроводы', n: 32, c: '#19a2df' },
  { k: 'ONSHORE', t: 'CPF', n: 34, c: '#0f957a' },
  { k: 'EXPORT', t: 'Сбыт / газ', n: 36, c: '#e0284a' },
];
W.scheme = s => {
  const xs = SCH.map((_, i) => 20 + i * 196);
  return `<div class="scheme"><svg viewBox="0 0 980 280">
    <defs>${SCH.map((n, i) => i < 4 ? `<path id="lk${i}" d="M${xs[i] + 156} 92 L${xs[i + 1]} 92"/>` : '').join('')}<path id="bus" d="M30 228 L950 228"/></defs>
    ${SCH.map((n, i) => i < 4 ? `<use href="#lk${i}" stroke="${n.c}" stroke-opacity=".35" stroke-width="3"/>${[0, 1, 2].map(k => `<circle r="3.5" class="particle" fill="${SCH[i + 1].c}"><animateMotion dur="1.6s" begin="${k * .53}s" repeatCount="indefinite"><mpath href="#lk${i}"/></animateMotion></circle>`).join('')}` : '').join('')}
    ${SCH.map((n, i) => `<g class="sn" data-i="${i}" tabindex="0"><rect class="card" x="${xs[i]}" y="40" width="156" height="104" rx="16" fill="#fff" fill-opacity=".85" stroke="${n.c}" stroke-opacity=".5"/>
      <rect x="${xs[i]}" y="40" width="156" height="5" rx="2.5" fill="${n.c}"/>
      <text x="${xs[i] + 14}" y="70" style="font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.1em;fill:${n.c}">${n.k}</text>
      <text x="${xs[i] + 14}" y="98" style="font:600 15px Unbounded,Onest,sans-serif;fill:#0a2547">${n.t}</text>
      <text x="${xs[i] + 14}" y="126" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:#7689a3">подробнее · СЛ ${pad3(n.n)}</text>
      <line x1="${xs[i] + 78}" y1="144" x2="${xs[i] + 78}" y2="228" stroke="#7689a3" stroke-dasharray="2 4"/><circle cx="${xs[i] + 78}" cy="228" r="4" fill="#fff" stroke="#0a64a4" stroke-width="2"/></g>`).join('')}
    <use href="#bus" stroke="#0a64a4" stroke-width="2" stroke-dasharray="8 6" style="animation:dashmove 1.2s linear infinite"/>
    <rect x="250" y="240" width="480" height="26" rx="8" fill="#fff" fill-opacity=".9"/>
    <text x="490" y="257" text-anchor="middle" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:#0a2547">ПОТОК ДАННЫХ И ЭНЕРГИИ · кабели + телеком + ESD/F&amp;G + SCADA/DCS</text>
  </svg></div><div id="snD"></div>${notesHTML([s.notes[s.notes.length - 1]])}`;
};
MOUNT.scheme = el => {
  const show = i => { const n = SCH[i], sl = S(n.n); $$('.sn', el).forEach(g => g.classList.toggle('on', +g.dataset.i === i));
    $('#snD', el).innerHTML = `<div class="sn-detail"><h4><span>${esc(n.t)} · ${esc(sl.t)}</span><button class="lnk" data-go="${n.n}">к слайду ${pad3(n.n)} →</button></h4><ul>${(sl.items || []).slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`; };
  $$('.sn', el).forEach(g => { g.addEventListener('click', () => show(+g.dataset.i)); g.addEventListener('keydown', e => { if (e.key === 'Enter') show(+g.dataset.i); }); });
  el.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) location.hash = `${MOD_OF[+b.dataset.go]}/s${b.dataset.go}`; });
  show(1);
};

/* ---- канал через Уральскую седловину: разрез ---- */
const CAN = { dl: 0, dr: 4.0, uk: .5 };
W.canal = s => `${body(s)}
  <div class="sim" style="margin-top:16px">
    <div class="ctls">
      <div class="eyebrow">Разрез канала · «что если»</div>
      <label class="ctl"><span class="ctl-h"><span>Снижение уровня Каспия</span><output id="cnO1"></output></span><input type="range" id="cnR1" min="0" max="1.5" step="0.05" value="0"></label>
      <label class="ctl"><span class="ctl-h"><span>Осадка транспортной баржи</span><output id="cnO2"></output></span><input type="range" id="cnR2" min="2.5" max="5.5" step="0.1" value="4"></label>
      <label class="ctl"><span class="ctl-h"><span>Запас под килем</span><output id="cnO3"></output></span><input type="range" id="cnR3" min="0.2" max="1" step="0.05" value="0.5"></label>
      <div class="verdict" id="cnV"></div>
    </div>
    <div><div class="chart"><svg viewBox="0 0 620 250" id="cnS">
      <defs><linearGradient id="wat" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#19a2df" stop-opacity=".35"/><stop offset="1" stop-color="#0a64a4" stop-opacity=".12"/></linearGradient>
      <pattern id="soil" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#b89b64" stroke-opacity=".5" stroke-width="2"/></pattern></defs>
      <rect id="cnW" x="0" width="620" fill="url(#wat)"/>
      <path id="cnWl" fill="none" stroke="#0a64a4" stroke-width="2"/>
      <line x1="0" x2="620" y1="40" y2="40" stroke="#0a2547" stroke-dasharray="4 4" stroke-opacity=".4"/><text x="8" y="34" class="ax">проектный уровень</text>
      <path d="M0 105 L200 105 L240 190 L380 190 L420 105 L620 105 L620 250 L0 250 Z" fill="#f2ead8"/><path d="M0 105 L200 105 L240 190 L380 190 L420 105 L620 105 L620 250 L0 250 Z" fill="url(#soil)" stroke="#b89b64" stroke-width="1.5"/>
      <text x="310" y="210" text-anchor="middle" class="ax">дно канала −4,8 м · ширина 120 м</text>
      <g id="cnB"><rect id="cnBr" x="250" width="120" rx="8" fill="#0a2547"/><rect id="cnBt" x="262" width="96" height="16" rx="4" fill="#e0284a"/></g>
      <line id="cnK" x1="230" x2="390" stroke="#e0284a" stroke-dasharray="3 3"/>
    </svg></div>
    <div class="outs"><div class="out"><small>доступная глубина</small><b id="cnA">—</b><small>м</small></div><div class="out"><small>нужно</small><b id="cnN">—</b><small>осадка + запас, м</small></div><div class="out"><small>доп. выемка</small><b id="cnX">—</b><small>млн м³ к 17,4</small></div></div></div>
  </div>${notesHTML(s.notes.concat(['Разрез учебный: L×B×Δh без откосов и заносимости — порядок величины, не смета. Стоимость оптимизации нельзя считать пропорцией без bathymetry и sediment study (СЛ 046).']), true)}`;
MOUNT.canal = el => {
  const k = 30, base = 40;
  const draw = () => {
    const wl = base + CAN.dl * k, avail = 4.8 - CAN.dl, need = CAN.dr + CAN.uk, extra = Math.max(0, need - avail);
    const vol = 75000 * 120 * extra / 1e6;
    $('#cnW', el).setAttribute('y', wl); $('#cnW', el).setAttribute('height', 250 - wl);
    let d = ''; for (let x = 0; x <= 620; x += 10) d += `${x ? 'L' : 'M'}${x} ${(wl + Math.sin(x * .05) * 1.6).toFixed(1)}`; $('#cnWl', el).setAttribute('d', d);
    const keel = wl + CAN.dr * k; $('#cnBr', el).setAttribute('y', wl - 14); $('#cnBr', el).setAttribute('height', keel - wl + 14); $('#cnBt', el).setAttribute('y', wl - 30);
    const ky = wl + need * k; ['y1', 'y2'].forEach(a => $('#cnK', el).setAttribute(a, ky));
    $('#cnA', el).textContent = fmt(avail, 2); $('#cnN', el).textContent = fmt(need, 2); $('#cnX', el).textContent = extra ? '+' + fmt(vol, 1) : '0';
    const v = $('#cnV', el);
    if (!extra) { v.className = 'verdict ok'; v.innerHTML = `<span class="ic">✓</span><div><b>Проход по расчёту возможен</b>запас ${fmt(avail - need, 2)} м при выбранной осадке</div>`; }
    else { v.className = 'verdict no'; v.innerHTML = `<span class="ic">!</span><div><b>Не хватает ${fmt(extra, 2)} м глубины</b>углубление, другая баржа/модульность или маршрут — только после инженерного сравнения</div>`; }
    [['cnR1', 'cnO1', CAN.dl, ' м'], ['cnR2', 'cnO2', CAN.dr, ' м'], ['cnR3', 'cnO3', CAN.uk, ' м']].forEach(([r, o, val, u]) => { const rr = $('#' + r, el); $('#' + o, el).textContent = fmt(val, 2) + u; rr.style.setProperty('--p', ((rr.value - rr.min) / (rr.max - rr.min) * 100) + '%'); });
  };
  [['cnR1', 'dl'], ['cnR2', 'dr'], ['cnR3', 'uk']].forEach(([id, key]) => $('#' + id, el).addEventListener('input', e => { CAN[key] = +e.target.value; draw(); }));
  draw();
};


/* ---- анимированная схема земснаряда (СЛ 044) ---- */
function dredgeSVG() {
  return `<div><div class="dredge"><svg viewBox="0 0 600 300" aria-label="Схема дноуглубления">
  <defs><linearGradient id="dw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5cc3ef" stop-opacity=".55"/><stop offset="1" stop-color="#0a64a4" stop-opacity=".35"/></linearGradient>
  <pattern id="ds" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#b89b64" stroke-opacity=".45" stroke-width="2.5"/></pattern>
  <clipPath id="dcut"><rect x="0" y="0" height="300" width="0"><animate attributeName="width" values="40;600;600" keyTimes="0;.85;1" dur="12s" repeatCount="indefinite"/></rect></clipPath></defs>
  <rect x="0" y="92" width="600" height="208" fill="url(#dw)"/>
  ${[0, 1, 2].map(k => `<path d="M0 ${92 + k * 6} Q 75 ${88 + k * 6} 150 ${92 + k * 6} T 300 ${92 + k * 6} T 450 ${92 + k * 6} T 600 ${92 + k * 6}" fill="none" stroke="#fff" stroke-opacity="${.8 - k * .25}" stroke-width="1.5"><animateTransform attributeName="transform" type="translate" values="0 0;-40 0;0 0" dur="${5 + k}s" repeatCount="indefinite"/></path>`).join('')}
  <path d="M0 170 C120 165 220 175 300 168 S480 172 600 166 L600 300 L0 300 Z" fill="#efe4cc"/><path d="M0 170 C120 165 220 175 300 168 S480 172 600 166 L600 300 L0 300 Z" fill="url(#ds)" stroke="#b89b64" stroke-width="1.5"/>
  <g clip-path="url(#dcut)"><path d="M0 172 L0 222 L600 222 L600 168 Z" fill="url(#dw)"/><line x1="0" x2="600" y1="222" y2="222" stroke="#0a64a4" stroke-dasharray="6 5" stroke-width="1.5"/></g>
  <g><animateTransform attributeName="transform" type="translate" values="0 0;520 0;520 0" keyTimes="0;.85;1" dur="12s" repeatCount="indefinite"/>
    <path d="M10 92 L20 76 L110 76 L100 92 Z" fill="#0a2547"/><rect x="36" y="58" width="40" height="18" rx="3" fill="#fff" stroke="#0a2547" stroke-width="2"/><rect x="42" y="63" width="8" height="6" fill="#19a2df"/><rect x="56" y="63" width="8" height="6" fill="#19a2df"/>
    <rect x="80" y="44" width="5" height="32" fill="#e0284a"/><path d="M28 90 L54 214" stroke="#0a2547" stroke-width="5" stroke-linecap="round"/><circle cx="54" cy="216" r="9" fill="#c08300" stroke="#0a2547" stroke-width="2"><animateTransform attributeName="transform" type="rotate" values="0 54 216;360 54 216" dur="1s" repeatCount="indefinite"/></circle>
    <path d="M110 80 C150 70 170 74 200 82" fill="none" stroke="#7689a3" stroke-width="4" stroke-dasharray="2 5"><animate attributeName="stroke-dashoffset" values="0;-14" dur=".6s" repeatCount="indefinite"/></path>
    ${[0, 1, 2, 3, 4].map(k => `<circle r="${2 + k % 2}" fill="#b89b64"><animateMotion dur="1.6s" begin="${k * .32}s" repeatCount="indefinite" path="M54 214 L28 92"/></circle>`).join('')}</g>
  <g transform="translate(14 254)"><rect width="300" height="34" rx="10" fill="#fff" fill-opacity=".85"/><text x="12" y="21" style="font:500 11px 'IBM Plex Mono',monospace;fill:#0a2547">земснаряд · 75 км × 120 м × −4,8 м · 17,4 млн м³</text></g>
  <text x="586" y="238" text-anchor="end" style="font:500 10px 'IBM Plex Mono',monospace;fill:#0a64a4">проектное дно канала</text>
  </svg></div><p style="margin:8px 0 0;font-size:11.5px;color:var(--muted)">Анимированная схема, не технология работ. </p></div>`;
}

/* ---- UXO: эволюция перечня ---- */
const pairBar = (l, a, b, u, d = 0) => { const mx = Math.max(a, b); return `<div style="display:grid;gap:6px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.6);border:1px solid var(--glass-b)">
  <div class="ctl-h"><span>${l}</span><span class="chip good">−${fmt(a - b, d)} ${u} · −${fmt((a - b) / a * 100, 0)}%</span></div>
  ${[[a, 'первый перечень', 'var(--faint)'], [b, 'после оптимизации МО РК', 'linear-gradient(90deg,var(--brand-2),var(--brand))']].map(([v, t, c], i) => `<div style="display:grid;grid-template-columns:1fr 70px;gap:10px;align-items:center;font-size:12px;color:var(--ink-2)"><span><span style="display:block;height:12px;border-radius:6px;width:${v / mx * 100}%;background:${c};transform-origin:left;animation:grow 1s var(--ease) ${i * 150}ms backwards"></span>${t}</span><b class="mono" style="text-align:right;color:var(--navy)">${fmt(v, d)}</b></div>`).join('')}</div>`; };
W.uxo = s => `<div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;align-items:start">${body(s)}<div style="display:grid;gap:10px">${pairBar('Позиций оборудования', 71, 63, 'поз.')}${pairBar('Ориентировочная стоимость, $ млн', 35.7, 29.2, '$ млн', 1)}
  <div class="verdict mid"><span class="ic">₸</span><div><b>≈ $10 млн налогов</b>при безвозмездной передаче — механизм снижения нагрузки прорабатывался</div></div></div></div>${notesHTML(s.notes, true)}`;

/* ---- 9 исторических скважин ---- */
W.wells9 = s => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px;align-items:start">
  <div><div class="lbl">9 ранее ликвидированных скважин</div><div class="dots">${Array.from({ length: 9 }, (_, i) => `<i class="${i < 6 ? 'a' : 'q'}" title="${i < 6 ? 'принята на баланс (2024)' : 'история / правовой статус уточняется'}">${i < 6 ? 'Б' : '?'}</i>`).join('')}</div>
    <div class="legend" style="margin-bottom:12px"><span style="--c:var(--brand)"><i></i>6 приняты на баланс в 2024</span><span style="--c:var(--warn)"><i class="hatch"></i>3 — уточнение статуса</span></div>
    <div class="yr"><span class="chip good">мониторинг 2024 ✓</span><span class="chip bad">мониторинг 2025 ✕ (санкции)</span></div></div>
  ${ptsMini(s.items)}</div>${notesHTML(s.notes)}`;

/* ---- кольца ---- */
function ringSVG(v, color, id) {
  const r = 52, C = 2 * Math.PI * r;
  return `<svg viewBox="0 0 130 130"><defs><linearGradient id="rg${id}" x1="0" x2="1"><stop offset="0" stop-color="#19a2df"/><stop offset="1" stop-color="${color}"/></linearGradient></defs>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="rgba(8,36,74,.07)" stroke-width="11"/>
    <circle class="arc" cx="65" cy="65" r="${r}" fill="none" stroke="url(#rg${id})" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - v / 100)}" transform="rotate(-90 65 65)"/>
    ${Array.from({ length: 40 }, (_, i) => { const a = i / 40 * Math.PI * 2 - Math.PI / 2; return `<line x1="${65 + 62 * Math.cos(a)}" y1="${65 + 62 * Math.sin(a)}" x2="${65 + 64.5 * Math.cos(a)}" y2="${65 + 64.5 * Math.sin(a)}" stroke="${i / 40 * 100 <= v ? color : 'rgba(8,36,74,.15)'}" stroke-width="1.5"/>`; }).join('')}</svg>`;
}
const armRings = el => el.addEventListener('seen', () => $$('.arc', el).forEach(a => a.style.strokeDashoffset = a.dataset.off), { once: true });
W.feed = s => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;align-items:center">
  <div class="rings">${s.items.slice(0, 2).map(([v, l], i) => `<div class="ring">${ringSVG(parseFloat(v.replace(',', '.')), i ? '#0a2547' : '#0a64a4', 'f' + i)}<b>${numHTML(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
  <div style="display:grid;gap:10px">${s.items.slice(2).map(([v, l]) => `<div class="out"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}
    <div class="verdict no"><span class="ic">≠</span><div><b>FEED 99,9% ≠ FID</b>инженерия почти готова; инвестрешение, структура, финансирование и санкционная чистота — нет</div></div></div></div>${notesHTML(s.notes)}`;
MOUNT.feed = el => armRings(el);
W.lc = s => `<div class="rings">${ringSVG(21.07, '#0a64a4', 'l1').replace(/^/, '<div class="ring">')}<b>21,07%</b><span>местное содержание в товарах</span></div>
  <div class="ring">${ringSVG(29.55, '#e0284a', 'l2')}<b>29,55%</b><span>в работах и услугах</span></div>
  <div class="ring" style="align-content:center"><b data-cu="30">30</b><span>компаний Мангистау, 2023–2025</span><b style="margin-top:6px"><span data-cu="16.7" data-d="1">16,7</span> млрд ₸</b><span>общая сумма</span></div>
  <div class="ring" style="align-content:center"><b data-cu="1820">1 820</b><span>человек через EPC по ресурсному плану FEED</span><div class="yr" style="justify-content:center;margin-top:6px"><span class="chip info">50%</span>→<span class="chip info">70%</span>→<span class="chip info">100%</span></div><span>национализация персонала (годы уточнить)</span></div></div>
  <div style="margin-top:14px">${ptsMini(s.items.slice(4), 4)}</div>${notesHTML(s.notes)}`;
MOUNT.lc = el => armRings(el);

/* ---- CAPEX ---- */
W.capex = s => `<div class="chart" id="cxC"><div class="tip"></div></div>${body(s)}${notesHTML(s.notes, true)}`;
MOUNT.capex = (el, s) => {
  const Wd = 720, H = 280, l = 44, r = 10, t = 16, b = 40, top = 10;
  const Y = v => t + (1 - v / top) * (H - t - b), bw = 96;
  const cols = [{ x: 150, lo: 6.4, hi: 6.6, l: '2023 · Pre-FEED', c: '#7689a3' }, { x: 340, lo: 0, hi: 8.5, l: 'Дек 2025 · FEED', c: '#0a64a4' }, { x: 530, lo: 0, hi: 8.5, l: '2026 · JTS', c: '#19a2df', ghost: 1 }, { x: 660, lo: 0, hi: 8.5, l: 'После JTS · Class 3', c: '#e0284a', ghost: 1 }];
  let g = ''; for (let v = 0; v <= top; v += 2) g += `<line class="gl" x1="${l}" x2="${Wd - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${l - 8}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`;
  const bars = cols.map((c, i) => c.ghost
    ? `<g class="cxb" data-i="${i}"><rect x="${c.x - (i === 3 ? 40 : bw / 2)}" y="${Y(8.5)}" width="${i === 3 ? 80 : bw}" height="${Y(0) - Y(8.5)}" rx="10" fill="none" stroke="${c.c}" stroke-width="1.6" stroke-dasharray="6 5"/><text x="${c.x}" y="${Y(5)}" text-anchor="middle" style="font:600 26px Unbounded,Onest,sans-serif;fill:${c.c}">?</text><text x="${c.x}" y="${H - 14}" text-anchor="middle" class="ax">${c.l}</text></g>`
    : `<g class="cxb" data-i="${i}"><rect x="${c.x - bw / 2}" y="${Y(c.hi)}" width="${bw}" height="${Y(0) - Y(c.hi)}" rx="10" fill="${c.c}" opacity="${i ? 1 : .6}" style="transform-box:fill-box;transform-origin:bottom;animation:growY 1s var(--ease) ${i * 200}ms backwards"/>
       ${i === 0 ? `<rect x="${c.x - bw / 2}" y="${Y(6.6)}" width="${bw}" height="${Y(6.4) - Y(6.6)}" fill="#0a2547"/>` : ''}
       <text x="${c.x}" y="${Y(c.hi) - 10}" text-anchor="middle" style="font:600 16px Unbounded,Onest,sans-serif;fill:#0a2547">${i ? '~$8,5' : '$6,4–6,6'} млрд</text><text x="${c.x}" y="${H - 14}" text-anchor="middle" class="ax">${c.l}</text></g>`).join('');
  $('#cxC', el).insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${Wd} ${H}"><style>@keyframes growY{from{transform:scaleY(0)}}</style>${g}${bars}
    <path d="M200 ${Y(6.6)} C250 ${Y(6.6)} 260 ${Y(8.5)} 290 ${Y(8.5)}" fill="none" stroke="#e0284a" stroke-width="1.8" stroke-dasharray="4 4" marker-end="url(#ar)"/>
    <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#e0284a"/></marker></defs>
    <rect x="198" y="${Y(7.9) - 14}" width="92" height="22" rx="6" fill="#fff"/><text x="244" y="${Y(7.9) + 1}" text-anchor="middle" style="font:500 11px 'IBM Plex Mono',monospace;fill:#e0284a">+≈$2 млрд</text>
    <text x="${l}" y="10" class="ax">$ млрд</text></svg>`);
  const tip = $('.tip', el);
  $$('.cxb', el).forEach(g => { g.style.cursor = 'pointer'; g.addEventListener('pointerenter', e => { const i = +g.dataset.i, it = s.items[i]; tip.innerHTML = `<div class="t-h">${esc(it[0])}</div>${esc(it[1])}`; tip.classList.add('on'); const br = $('#cxC', el).getBoundingClientRect(), gr = g.getBoundingClientRect(); tip.style.transform = `translate(${clamp(gr.left - br.left, 0, br.width - 260)}px,${gr.top - br.top - 10}px)`; }); g.addEventListener('pointerleave', () => tip.classList.remove('on')); });
};

/* ---- донат задолженности ---- */
W.debt = s => `<div style="display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center" class="debt-g">
  <div style="position:relative;width:220px;margin:auto"><svg viewBox="0 0 220 220" id="dbS"></svg><div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center"><b style="font:600 30px Unbounded,Onest,sans-serif;color:var(--navy)">~$<span data-cu="17.5" data-d="1">17,5</span></b><span class="lbl">млн · FEED-долг</span></div></div>
  <div style="display:grid;gap:8px">
    <div class="out" style="border-left:4px solid #0a64a4"><small>КМГ Инжиниринг</small><b>~$11,8 млн</b></div>
    <div class="out" style="border-left:4px solid #19a2df"><small>FES</small><b>~$5,7 млн</b></div>
    <div class="out" style="border-left:4px dashed #c08300"><small>прочие обязательства</small><b>~$6 млн</b></div>
    <div class="out" style="border-left:4px dashed #c08300"><small>потенциальный TSA FES · подлежит сверке</small><b>~$7,7 млн</b></div></div></div>
  <div style="margin-top:14px">${ptsMini(s.items.slice(1), 1)}</div>${notesHTML(s.notes, s.flag)}`;
MOUNT.debt = el => {
  const parts = [[11.8, '#0a64a4'], [5.7, '#19a2df']], tot = 17.5, r = 86, C = 2 * Math.PI * r; let off = 0;
  $('#dbS', el).innerHTML = `<circle cx="110" cy="110" r="${r}" fill="none" stroke="rgba(8,36,74,.06)" stroke-width="22"/>` + parts.map(([v, c], i) => { const len = v / tot * C; const h = `<circle cx="110" cy="110" r="${r}" fill="none" stroke="${c}" stroke-width="22" stroke-dasharray="0 ${C}" data-da="${len - 3} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 110 110)" style="transition:stroke-dasharray 1.3s var(--ease) ${i * .25}s"/>`; off += len; return h; }).join('');
  el.addEventListener('seen', () => $$('#dbS circle[data-da]', el).forEach(c => c.setAttribute('stroke-dasharray', c.dataset.da)), { once: true });
  if (innerWidth < 640) $('.debt-g', el).style.gridTemplateColumns = '1fr';
};

/* ---- правило OFAC 50% ---- */
const R50 = { lk: 50, oth: 0, cn: 0 };
const R50P = { 'Сейчас': { lk: 50, oth: 0, cn: 0 }, 'После выхода ЛУКОЙЛа': { lk: 0, oth: 0, cn: 0 }, 'Целевая КМГ/CNOOC': { lk: 0, oth: 0, cn: 50 }, 'Гипотеза 49%': { lk: 49, oth: 0, cn: 0 }, 'Совокупно 30+25': { lk: 30, oth: 25, cn: 0 } };
W.rule50 = s => `<div class="sim">
  <div class="ctls"><div class="eyebrow">Учебный тренажёр правила 50%</div>
    <label class="ctl"><span class="ctl-h"><span>ЛУКОЙЛ (SDN)</span><output id="q1"></output></span><input type="range" id="r1" min="0" max="100" step="1"></label>
    <label class="ctl"><span class="ctl-h"><span>Иные блокированные лица</span><output id="q2"></output></span><input type="range" id="r2" min="0" max="50" step="1"></label>
    <label class="ctl"><span class="ctl-h"><span>CNOOC</span><output id="q3"></output></span><input type="range" id="r3" min="0" max="50" step="1"></label>
    <div class="presets" id="r50p">${Object.keys(R50P).map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div></div>
  <div><div class="lbl" style="margin-bottom:8px">Структура участия в ККО</div>
    <div id="r50bar" style="display:flex;height:54px;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--glass-b)"></div>
    <div style="position:relative;height:22px"><span style="position:absolute;left:50%;top:0;transform:translateX(-50%);font:500 10.5px 'IBM Plex Mono',monospace;color:var(--crim)">▲ порог 50%</span></div>
    <div class="verdict" id="r50v" style="margin-top:6px"></div>
    ${ptsMini(s.items.slice(0, 3))}</div></div>
  ${notesHTML(['Тренажёр иллюстрирует арифметику агрегирования долей блокированных лиц. Это не юридическое заключение: контроль, вторичные санкции, timing и пост-сделочный статус оцениваются юристами (СЛ 097, п.4–5).'], true)}`;
MOUNT.rule50 = el => {
  const draw = () => {
    R50.lk = clamp(R50.lk, 0, 100 - R50.cn - R50.oth); const kmg = 100 - R50.lk - R50.oth - R50.cn, blocked = R50.lk + R50.oth;
    [['r1', 'q1', R50.lk], ['r2', 'q2', R50.oth], ['r3', 'q3', R50.cn]].forEach(([r, q, v]) => { const rr = $('#' + r, el); rr.value = v; $('#' + q, el).textContent = v + '%'; rr.style.setProperty('--p', ((v - rr.min) / (rr.max - rr.min) * 100) + '%'); });
    const seg = (v, c, t) => v > 0 ? `<div style="flex:${v};background:${c};display:grid;place-items:center;color:#fff;font:600 12px Unbounded,Onest,sans-serif;transition:flex .5s var(--ease);min-width:0;overflow:hidden;white-space:nowrap">${v >= 9 ? `${t} ${v}%` : ''}</div>` : '';
    $('#r50bar', el).innerHTML = seg(kmg, 'linear-gradient(135deg,#19a2df,#0a64a4)', 'КМГ') + seg(R50.cn, 'linear-gradient(135deg,#0f957a,#0b6f5c)', 'CNOOC') + seg(R50.oth, 'repeating-linear-gradient(45deg,#e0284a 0 6px,#b81f3b 6px 12px)', 'SDN') + seg(R50.lk, 'linear-gradient(135deg,#ff5a6e,#e0284a)', 'ЛУКОЙЛ');
    const v = $('#r50v', el);
    if (blocked >= 50) { v.className = 'verdict no'; v.innerHTML = `<span class="ic">⛔</span><div><b>Блокировано по правилу 50% · ${blocked}%</b>доли блокированных лиц агрегируются; ККО рассматривается как блокированное, даже без отдельного внесения в SDN</div>`; }
    else if (blocked > 0) { v.className = 'verdict mid'; v.innerHTML = `<span class="ic">!</span><div><b>Ниже порога · ${blocked}% у блокированных лиц</b>автоматической «безопасности» нет: контроль, вторичные риски и комплаенс контрагентов — отдельный анализ</div>`; }
    else { v.className = 'verdict ok'; v.innerHTML = `<span class="ic">✓</span><div><b>Блокированных долей нет</b>после полного выхода и соблюдения условий — то, что КМГ просил подтвердить у OFAC (СЛ 100, п.3)</div>`; }
  };
  [['r1', 'lk'], ['r2', 'oth'], ['r3', 'cn']].forEach(([id, k]) => $('#' + id, el).addEventListener('input', e => { R50[k] = +e.target.value; if (R50.lk + R50.oth + R50.cn > 100) R50.lk = 100 - R50.oth - R50.cn; $$('#r50p button', el).forEach(b => b.classList.remove('on')); draw(); }));
  $('#r50p', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Object.assign(R50, R50P[b.dataset.k]); $$('#r50p button', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#r50p button', el).classList.add('on'); draw();
};

/* ---- цена выхода ЛУКОЙЛа: версии ---- */
W.price = s => `<div class="chart" id="prC"><div class="tip"></div></div><div class="legend" style="margin:6px 0 14px"><span style="--c:#0a64a4"><i></i>цена доли</span><span style="--c:#19a2df"><i></i>требования по займам</span><span style="--c:#7689a3"><i></i>проценты</span><span style="--c:#e0284a"><i class="hatch"></i>общий ориентир без разбивки</span><span style="--c:#c08300"><i class="hatch"></i>диапазон сценариев KPMG — не цена</span></div>${body(s)}${notesHTML(s.notes, true)}`;
MOUNT.price = el => {
  const V = [{ d: '19.05.2026', t: 'Запрос ЛУКОЙЛа', p: [[270, 'общий ориентир', 'url(#hx)']] }, { d: '24.10.2026', t: 'Пояснительная модель', p: [[187, 'доля', '#0a64a4'], [64.5, 'требования', '#19a2df'], [5.5, 'проценты (до ~257)', '#7689a3']] }, { d: '06.11.2026', t: 'Описание для OFAC', p: [[190, 'доля', '#0a64a4'], [70, 'loan claims', '#19a2df']] }];
  const Wd = 720, l = 150, r = 60, top = 320, X = v => l + v / top * (Wd - l - r), H = 40 + V.length * 62;
  let g = ''; for (let v = 0; v <= 300; v += 50) g += `<line class="gl" x1="${X(v)}" x2="${X(v)}" y1="20" y2="${H - 24}"/><text class="ax" x="${X(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
  const band = `<rect x="${X(174)}" y="20" width="${X(303) - X(174)}" height="${H - 44}" fill="url(#hk)" opacity=".55"/><text x="${X(238)}" y="16" text-anchor="middle" style="font:500 10px 'IBM Plex Mono',monospace;fill:#c08300">KPMG: $174 млн без upside · $303 млн с upside</text>`;
  const rows = V.map((v, i) => { let x = l; const y = 36 + i * 62; const segs = v.p.map(([val, n, c], j) => { const w = X(val) - X(0); const h = `<rect class="prs" data-i="${i}" x="${x}" y="${y}" width="${w}" height="30" rx="${j === 0 && v.p.length === 1 ? 8 : 4}" fill="${c}" style="transform-box:fill-box;transform-origin:left;animation:grow .9s var(--ease) ${i * 150 + j * 120}ms backwards"/>`; x += w; return h; }).join('');
    const tot = v.p.reduce((a, b) => a + b[0], 0);
    return `<text x="${l - 12}" y="${y + 13}" text-anchor="end" style="font:600 12.5px Onest,sans-serif;fill:#0a2547">${v.t}</text><text x="${l - 12}" y="${y + 27}" text-anchor="end" class="ax">${v.d}</text>${segs}<text x="${x + 8}" y="${y + 20}" style="font:600 14px Unbounded,Onest,sans-serif;fill:#0a2547">~$${fmt(tot, 0)}</text>`; }).join('');
  $('#prC', el).insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${Wd} ${H}" id="prS"><defs><pattern id="hx" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#e0284a" opacity=".25"/><line x1="0" y1="0" x2="0" y2="7" stroke="#e0284a" stroke-width="3"/></pattern><pattern id="hk" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#c08300" stroke-opacity=".35" stroke-width="2"/></pattern></defs>${band}${g}${rows}<text x="${Wd - r}" y="${H - 8}" class="ax">$ млн</text></svg>`);
  const tip = $('.tip', el), box = $('#prC', el);
  $$('.prs', el).forEach(rc => { rc.style.cursor = 'pointer'; rc.addEventListener('pointermove', e => { const v = V[+rc.dataset.i]; tip.innerHTML = `<div class="t-h">${v.d} · ${v.t}</div>${v.p.map(([val, n, c]) => `<div class="t-r"><span><i style="--c:${c.startsWith('url') ? '#e0284a' : c}"></i>${n}</span><b>$${fmt(val, 1)} млн</b></div>`).join('')}`; tip.classList.add('on'); const br = box.getBoundingClientRect(); tip.style.transform = `translate(${clamp(e.clientX - br.left + 14, 0, br.width - 260)}px,${e.clientY - br.top + 14}px)`; }); rc.addEventListener('pointerleave', () => tip.classList.remove('on')); });
};

/* ---- предложение CNOOC: водопад ---- */
W.waterfall = s => `<div class="chart" id="wfC"></div>${notesHTML(s.notes)}`;
MOUNT.waterfall = (el, s) => {
  const it = [[200, 'входной платёж', '#0a64a4'], [70, '≈50% исторических расходов', '#19a2df'], [100, 'платёж после CFO', '#0f957a']];
  const Wd = 720, H = 290, l = 40, top = 400, Y = v => 20 + (1 - v / top) * (H - 70), bw = 110; let acc = 0;
  let g = ''; for (let v = 0; v <= 400; v += 100) g += `<line class="gl" x1="${l}" x2="${Wd - 10}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${l - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`;
  const bars = it.map(([v, n, c], i) => { const x = 90 + i * 150, y1 = Y(acc + v), y0 = Y(acc); const h = `<rect x="${x}" y="${y1}" width="${bw}" height="${y0 - y1}" rx="8" fill="${c}" style="transform-box:fill-box;transform-origin:bottom;animation:growY .8s var(--ease) ${i * 250}ms backwards"/>
    <text x="${x + bw / 2}" y="${y1 - 8}" text-anchor="middle" style="font:600 15px Unbounded,Onest,sans-serif;fill:#0a2547">+$${v}</text><text x="${x + bw / 2}" y="${H - 30}" text-anchor="middle" style="font:500 11.5px Onest,sans-serif;fill:#3b5170">${n}</text>
    ${i < 2 ? `<line x1="${x + bw}" x2="${x + 150}" y1="${Y(acc + v)}" y2="${Y(acc + v)}" stroke="#7689a3" stroke-dasharray="3 3"/>` : ''}`; acc += v; return h; }).join('');
  const tx = 90 + 3 * 150;
  $('#wfC', el).innerHTML = `<svg viewBox="0 0 ${Wd} ${H}"><style>@keyframes growY{from{transform:scaleY(0)}}</style>${g}${bars}
    <rect x="${tx}" y="${Y(370)}" width="${bw}" height="${Y(0) - Y(370)}" rx="8" fill="url(#wfg)" style="transform-box:fill-box;transform-origin:bottom;animation:growY .9s var(--ease) .8s backwards"/>
    <defs><linearGradient id="wfg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e0284a"/><stop offset="1" stop-color="#0a2547"/></linearGradient></defs>
    <text x="${tx + bw / 2}" y="${Y(370) - 8}" text-anchor="middle" style="font:700 17px Unbounded,Onest,sans-serif;fill:#e0284a">~$370</text><text x="${tx + bw / 2}" y="${H - 30}" text-anchor="middle" style="font:600 11.5px Onest,sans-serif;fill:#0a2547">ориентир пакета</text>
    <text x="${l}" y="12" class="ax">$ млн · за 50% участия CNOOC</text></svg>`;
};

/* ---- структура: вариант А / Б ---- */
W.structure = s => `<div class="wtop"><div class="seg" id="stSeg"><button class="on" data-v="A">А · вход через ККО</button><button data-v="B">Б · новое СП 50/50</button></div><div class="presets" id="stSteps"></div></div>
  <div class="stru" id="stD"></div><div id="stT" style="margin-top:12px"></div>${notesHTML([s.items[s.items.length - 1]], true)}`;
MOUNT.structure = el => {
  const node = (x, y, w, t, sub, c, cls = '') => `<g class="node fade ${cls}"><rect x="${x - w / 2}" y="${y - 30}" width="${w}" height="60" rx="16" fill="#fff" fill-opacity=".9" stroke="${c}" stroke-width="1.6"/><rect x="${x - w / 2}" y="${y - 30}" width="6" height="60" rx="3" fill="${c}"/><text x="${x}" y="${y - 2}" text-anchor="middle" style="font:600 14px Unbounded,Onest,sans-serif;fill:#0a2547">${t}</text><text x="${x}" y="${y + 17}" text-anchor="middle" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:${c}">${sub}</text></g>`;
  const arr = (x1, y1, x2, y2, lab, cls = '', c = '#0a64a4') => `<g class="fade ${cls}"><path class="ln" d="M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}" style="stroke:${c}"/>${lab ? `<rect x="${(x1 + x2) / 2 - lab.length * 3.4}" y="${(y1 + y2) / 2 - 12}" width="${lab.length * 6.8}" height="22" rx="6" fill="#fff"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 3}" text-anchor="middle" style="font:500 10.5px 'IBM Plex Mono',monospace;fill:${c}">${lab}</text>` : ''}</g>`;
  const SC = {
    A: { steps: ['1 · сейчас', '2 · выкуп', '3 · вход CNOOC'], text: ['КМГ 50% и ЛУКОЙЛ 50% в ККО — по правилу 50% ККО блокировано.', 'КМГ выкупает 50% доли и права требования по займам → 100% КМГ. Нужны OFAC и одобрения.', 'CNOOC входит на 50% в ККО после разрешений. Исторические обязательства ККО требуют DD.'],
      svg: st => `<svg viewBox="0 0 760 300">${node(160, 50, 190, st >= 2 ? 'КМГ 100%' : 'КМГ 50%', 'национальный участник', '#0a64a4')}${node(600, 50, 190, 'ЛУКОЙЛ 50%', 'SDN с 22.10.2025', '#e0284a', st >= 2 ? 'gone' : '')}
        ${node(380, 230, 300, 'ККО · оператор', st >= 3 ? 'КМГ 50 / CNOOC 50 · legacy DD' : st >= 2 ? '100% КМГ' : 'блокировано по 50% rule', st >= 2 ? '#0f957a' : '#e0284a')}
        ${arr(160, 80, 330, 200, '')}${arr(600, 80, 430, 200, st >= 2 ? 'выкуп доли + займы' : '', st >= 2 ? 'gone' : '', '#e0284a')}
        ${st >= 3 ? node(600, 130, 170, 'CNOOC 50%', 'после разрешений', '#0f957a') + arr(600, 160, 470, 210, '') : ''}</svg>` },
    B: { steps: ['1 · новое СП', '2 · перенос периметра', '3 · ring-fence ККО'], text: ['КМГ и CNOOC создают чистое СП 50/50. Мешает мораторий на новые юрлица → обращение в Самрук-Қазына / АП.', 'В СП передаются права недропользования по №5181-УВС-СП, FEED/IP/DBD, активы и договоры — с разрешениями.', 'Старые долги и обязательства ККО отделяются; новое СП не наследует санкционный «след».'],
      svg: st => `<svg viewBox="0 0 760 300">${node(130, 50, 170, 'КМГ 50%', 'участник', '#0a64a4')}${node(380, 50, 170, 'CNOOC 50%', 'стратегический партнёр', '#0f957a')}
        ${node(255, 230, 250, 'Новое СП 50/50', st >= 2 ? 'оператор / участник проекта' : 'нужно разрешение', '#0a64a4')}
        ${arr(130, 80, 210, 200, '')}${arr(380, 80, 300, 200, '')}
        ${node(630, 230, 200, 'ККО', st >= 3 ? 'legacy · ring-fence' : 'текущий оператор', st >= 3 ? '#7689a3' : '#e0284a', st >= 3 ? '' : '')}
        ${st >= 2 ? arr(630, 200, 380, 215, 'недра · FEED/IP · активы', '', '#19a2df') : ''}
        ${node(630, 70, 200, 'Самрук-Қазына / АП', 'мораторий на юрлица', '#c08300')}${arr(630, 100, 330, 205, '', '', '#c08300')}</svg>` },
  };
  let v = 'A', st = 1;
  const draw = () => { const c = SC[v]; $('#stSteps', el).innerHTML = c.steps.map((t, i) => `<button type="button" data-s="${i + 1}" class="${st === i + 1 ? 'on' : ''}">${t}</button>`).join('');
    $('#stD', el).innerHTML = c.svg(st); $('#stT', el).innerHTML = `<div class="verdict ${v === 'A' && st === 1 ? 'no' : 'mid'}"><span class="ic">${st}</span><div>${esc(c.text[st - 1])}</div></div>`; };
  $('#stSeg', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; v = b.dataset.v; st = 1; $$('#stSeg button', el).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#stSteps', el).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st = +b.dataset.s; draw(); });
  draw();
};

/* ---- дорожная карта ---- */
W.roadmap = s => `<div class="chart" id="rmC" style="overflow-x:auto"><div class="tip"></div></div>${body(s)}${notesHTML(s.notes, true)}`;
MOUNT.roadmap = el => {
  const asof = DATA.meta.asof.split('-').map(Number), now = asof[0] + (asof[1] - 1 + asof[2] / 30) / 12;
  const EV = [[2023.16, 'УМК-контракт', '27.02.2023', '#0a64a4', 1], [2024.78, 'Контракт FEED', '10.10.2024 · FES/КМГИ', '#0a64a4', -1], [2025.81, 'Санкции OFAC', '22.10.2025', '#e0284a', 1], [2025.93, 'ПДПР · КТЭО', '28.11 / 23.12.2025', '#19a2df', -2],
    [2026.57, 'CNOOC — партнёр', '28.07.2026', '#0f957a', 2], [2027.62, 'Целевой FID', 'III кв. 2027 · условно', '#c08300', -1], [2031.88, 'Первая нефть', 'IV кв. 2031 · ревизия', '#e0284a', 1]];
  const Wd = 960, H = 320, l = 24, r = 24, inner = Wd - l - r;
  const X = y => y <= 2028 ? l + (y - 2023) / 5 * inner * .74 : l + inner * .74 + (y - 2028) / 4 * inner * .26;
  const Y0 = 160, LY = { 1: 14, 2: 74, '-1': 206, '-2': 262 };
  let ax = ''; for (let y = 2023; y <= 2032; y++) ax += `<line x1="${X(y)}" x2="${X(y)}" y1="${Y0 - 6}" y2="${Y0 + 6}" stroke="#7689a3"/><text class="ax" x="${X(y)}" y="${Y0 + 24}" text-anchor="middle">${y}</text>`;
  const ev = EV.map(([y, t, d, c, lv], i) => {
    const w = Math.max(t.length * 7.6, d.length * 6.4) + 26, yy = LY[lv], bx = clamp(X(y), l + w / 2, Wd - r - w / 2), up = lv > 0;
    return `<g style="animation:rise .5s var(--ease) ${i * 110}ms backwards"><path d="M${X(y)} ${Y0 + (up ? -7 : 7)} L${X(y)} ${up ? yy + 50 : yy - 10} L${bx} ${up ? yy + 44 : yy - 4}" fill="none" stroke="${c}" stroke-opacity=".45"/>
    <rect x="${bx - w / 2}" y="${yy}" width="${w}" height="44" rx="11" fill="#fff" fill-opacity=".95" stroke="${c}" stroke-opacity=".4"/>
    <text x="${bx}" y="${yy + 19}" text-anchor="middle" style="font:700 12px Montserrat,Onest,sans-serif;fill:#0a2547">${t}</text><text x="${bx}" y="${yy + 34}" text-anchor="middle" style="font:500 10px 'IBM Plex Mono',monospace;fill:${c}">${d}</text>
    <circle cx="${X(y)}" cy="${Y0}" r="6" fill="#fff" stroke="${c}" stroke-width="3"/></g>`; }).join('');
  $('#rmC', el).insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${Wd} ${H}" style="min-width:720px"><defs><linearGradient id="rmG" x1="0" x2="1"><stop offset="0" stop-color="#0a64a4"/><stop offset=".5" stop-color="#e0284a"/><stop offset="1" stop-color="#19a2df" stop-opacity=".35"/></linearGradient></defs>
    <rect x="${X(2025.81)}" y="${Y0 - 11}" width="${X(now) - X(2025.81)}" height="22" rx="4" fill="#e0284a" opacity=".08"/>
    <line x1="${l}" x2="${Wd - r}" y1="${Y0}" y2="${Y0}" stroke="url(#rmG)" stroke-width="4" stroke-linecap="round"/>
    <line x1="${X(now)}" x2="${Wd - r}" y1="${Y0}" y2="${Y0}" stroke="#fff" stroke-width="2" stroke-dasharray="4 6"/>${ax}
    <text x="${(X(2025.81) + X(now)) / 2}" y="${Y0 + 40}" text-anchor="middle" style="font:500 9.5px 'IBM Plex Mono',monospace;fill:#e0284a">пауза · санкции</text>
    <text x="${X(2029.6)}" y="${Y0 - 18}" text-anchor="middle" style="font:500 10.5px Onest,sans-serif;fill:#9aa8ba;text-decoration:line-through">первая нефть 2028 — устарело</text>
    ${ev}
    <g transform="translate(${X(now)},${Y0})"><circle r="8" fill="#e0284a"/><circle r="8" fill="none" stroke="#e0284a"><animate attributeName="r" from="8" to="24" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".8" to="0" dur="1.8s" repeatCount="indefinite"/></circle>
      <rect x="10" y="-34" width="64" height="18" rx="5" fill="#e0284a"/><text x="42" y="-21" text-anchor="middle" style="font:600 9.5px 'IBM Plex Mono',monospace;fill:#fff">СЕЙЧАС</text></g></svg>`);
};

/* ---- правильно / неправильно ---- */
W.rightwrong = s => `<div class="rw">${s.items.map(t => { const [a, b] = t.split(/\s*Правильно:\s*/); return `<div class="rw-i"><div class="no">${esc(a.replace(/^Неправильно:\s*/, ''))}</div><div class="ok">${esc(b || '')}</div></div>`; }).join('')}</div>`;

/* ---- маршрут 30 дней ---- */
W.route = s => `<div class="wtop"><span class="lbl">Отмечайте пройденное — прогресс сохраняется в этом браузере для вашей учётки</span><span class="chip info" id="rtP"></span></div><div class="route">${s.items.map(([d, x], i) => `<div class="rt" data-i="${i}" role="checkbox" tabindex="0"><label class="chk" style="pointer-events:none"><input type="checkbox"><i></i></label><span class="d">${esc(d)}</span><span class="x">${esc(x)}</span></div>`).join('')}</div>`;
MOUNT.route = el => {
  const key = 'khz-route-' + (USER.l || USER.e), done = new Set(store.get(key, []));
  const draw = () => { $$('.rt', el).forEach(r => { const on = done.has(+r.dataset.i); r.classList.toggle('done', on); $('input', r).checked = on; r.setAttribute('aria-checked', on); }); $('#rtP', el).textContent = `${done.size} / ${$$('.rt', el).length} этапов`; };
  const tog = r => { const i = +r.dataset.i; done.has(i) ? done.delete(i) : done.add(i); store.set(key, [...done]); draw(); };
  $$('.rt', el).forEach(r => { r.addEventListener('click', () => tog(r)); r.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tog(r); } }); });
  draw();
};

/* ---- глоссарий (СЛ 158 + 159) ---- */
function glossItems() {
  const out = [];
  [158, 159].forEach(n => S(n).items.forEach(it => it.split(/;\s*/).forEach(p => { const i = p.indexOf(' — '); if (i > 0) out.push([p.slice(0, i).trim(), p.slice(i + 3).replace(/\.$/, '').trim(), n]); })));
  return out;
}
W.glossary = s => `<div class="gls-s"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7689a3" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="glQ" placeholder="Найти термин: FID, UXO, TIC…"><span class="chip" id="glN"></span></div><div class="gls" id="glL"></div>`;
MOUNT.glossary = el => {
  const items = glossItems(), list = $('#glL', el);
  const draw = q => { const re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig') : null; const f = items.filter(([a, b]) => !q || (a + ' ' + b).toLowerCase().includes(q.toLowerCase()));
    const hl = t => re ? esc(t).replace(re, '<mark>$1</mark>') : esc(t);
    list.innerHTML = f.map(([a, b, n]) => `<div class="gl-i"><b>${hl(a)}</b>${hl(b)}</div>`).join('') || '<div class="gl-i">Ничего не найдено</div>'; $('#glN', el).textContent = `${f.length} из ${items.length}`; };
  $('#glQ', el).addEventListener('input', e => draw(e.target.value.trim())); draw('');
};

/* ---- мини-экзамен ---- */
const ANS = [
  ['FEED — инженерная база и смета (СЛ 061). FID — одобрение проверенной бизнес-модели: нужны санкционно чистая структура, Class 3, экономика, финансирование и решения органов (СЛ 081, 089).', '061, 081, 089'],
  ['Это две юридически разные операции: SPA на 50% долю в ТОО (~$190 млн) и уступка требований по займам с процентами (~$70 млн). Уступка делает покупателя кредитором ККО, а не даёт долю.', '104, 106'],
  ['Без канала через Уральскую седловину платформы не доставить и не смонтировать; UXO — компетенция МО РК, без акта очистки нельзя механически воздействовать на дно. Плюс сезонные окна и уровень Каспия.', '042, 047, 058'],
  ['Новое СП 50/50 отсекает санкционный «след» и legacy-обязательства ККО и снимает полный DD. Но нужно передать права недропользования, FEED/IP/DBD, активы и договоры и пройти мораторий на юрлица.', '118, 121, 122'],
  ['Подписанное дополнительное соглашение №1 (с перечнем результатов) и акты выполненных работ (АВР), подписанные обеими сторонами.', '066, 166'],
  ['«CAPEX снижен» — утверждённая Class 3 смета с BoE против принятого baseline (дек. 2025). «OFAC согласовал» — формальная лицензия или официальный ответ с точным scope, а не направленное обращение.', '069, 100, 143'],
];
W.exam = s => `<div class="exam">${s.items.map((q, i) => `<div class="fc" tabindex="0"><div class="fc-in"><div class="fc-f"><span class="lbl">вопрос ${i + 1} / ${s.items.length}</span><b>${esc(q)}</b><small>нажмите, чтобы проверить себя →</small></div><div class="fc-b"><span class="lbl" style="color:var(--good)">ответ по материалу</span><span>${esc(ANS[i] ? ANS[i][0] : '')}</span><small>слайды ${ANS[i] ? ANS[i][1] : ''}</small></div></div></div>`).join('')}</div>`;
MOUNT.exam = el => $$('.fc', el).forEach(c => { c.addEventListener('click', () => c.classList.toggle('flip')); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.classList.toggle('flip'); } }); });

/* ---- критический путь ---- */
W.flowbig = s => `${flowHTML(s.steps, 0)}${notesHTML(s.notes.concat(['Маркер «сейчас»: на 16.11.2026 OFAC рассматривает кейс, разрешение не подтверждено (СЛ 096, 112).']))}`;

/* ---- КПД 2027 ---- */
W.kpd = s => `<div class="sts" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))">${s.items.slice(0, 3).map((t, i) => `<div class="st" style="padding:18px"><span class="lbl" style="color:var(--crim)">КПД ${i + 1} · 2027</span><b style="font-size:15px;line-height:1.35;margin-top:8px">${esc(t)}</b></div>`).join('')}</div><div style="margin-top:12px">${ptsMini(s.items.slice(3), 3)}</div>`;

/* =====================================================================
   ПОИСК (Ctrl/⌘ K)
   ===================================================================== */
function initSearch() {
  const idx = Object.values(DATA.slides).filter(s => s.type !== 'divider').map(s => {
    const parts = [s.t, ...(s.items || []).flat(), ...(s.notes || []), ...(s.head || []), ...(s.rows || []).flat(), ...(s.steps || []).map(x => x.t), ...(s.cols || []).flatMap(c => [c.h, ...c.items])];
    return { n: s.n, t: s.t, x: parts.join(' · ') };
  });
  const pal = $('#pal'), q = $('#palQ'), res = $('#palR'); let sel = 0, cur = [];
  const open = () => { pal.classList.add('on'); q.value = ''; draw(''); setTimeout(() => q.focus(), 30); };
  const close = () => pal.classList.remove('on');
  const go = r => { close(); const m = MOD_OF[r.n] || 'start'; location.hash = `${m}/s${r.n}`; };
  const draw = v => {
    const terms = v.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    if (!terms.length) { cur = []; res.innerHTML = '<div class="pal-empty">Начните вводить: OFAC, канал, CPF, KPMG, Class 3, землеотвод…</div>'; $('#palN').textContent = `${idx.length} слайдов в индексе`; return; }
    cur = idx.map(r => { const lx = r.x.toLowerCase(); let sc = 0; for (const t of terms) { const c = lx.split(t).length - 1; if (!c) return null; sc += c + (r.t.toLowerCase().includes(t) ? 6 : 0); } return { ...r, sc }; }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, 30);
    sel = 0; $('#palN').textContent = `найдено ${cur.length}`;
    const re = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
    res.innerHTML = cur.map((r, i) => { const p = r.x.toLowerCase().indexOf(terms[0]); const snip = r.x.slice(Math.max(0, p - 60), p + 140); const m = DATA.modules.find(mm => mm.id === MOD_OF[r.n]);
      return `<div class="pr${i ? '' : ' on'}" data-i="${i}"><span class="sl">СЛ ${pad3(r.n)}</span><div><b>${esc(r.t).replace(re, '<mark>$1</mark>')}</b><span>${m ? esc(m.n + ' · ' + m.s) + ' — ' : ''}…${esc(snip).replace(re, '<mark>$1</mark>')}…</span></div></div>`; }).join('') || '<div class="pal-empty">Ничего не нашлось</div>';
  };
  q.addEventListener('input', () => draw(q.value));
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = clamp(sel + (e.key === 'ArrowDown' ? 1 : -1), 0, cur.length - 1); $$('.pr', res).forEach((x, i) => x.classList.toggle('on', i === sel)); $$('.pr', res)[sel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && cur[sel]) go(cur[sel]);
  });
  res.addEventListener('click', e => { const p = e.target.closest('.pr'); if (p) go(cur[+p.dataset.i]); });
  pal.addEventListener('click', e => { if (e.target === pal) close(); });
  $('#searchBtn').addEventListener('click', open);
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' || (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName))) { e.preventDefault(); open(); } if (e.key === 'Escape') { close(); document.body.classList.remove('nav'); } });
}

/* =====================================================================
   6. ЗАПУСК
   ===================================================================== */

/* ---------- живой фон: «поток данных» ---------- */
function bgFx() {
  if (RM) return;
  const cv = document.createElement('canvas'); cv.id = 'bgFx'; document.body.prepend(cv);
  const ctx = cv.getContext('2d'); let W, H, P = [], last = 0;
  const init = () => { const d = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const n = Math.round(Math.min(70, W * H / 26000)); P = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: Math.random() * 1.6 + .6, c: Math.random() < .18 ? '224,40,74' : '10,100,164' })); };
  init(); addEventListener('resize', init);
  const frame = t => {
    requestAnimationFrame(frame);
    if (document.hidden || t - last < 33) return; last = t;
    ctx.clearRect(0, 0, W, H);
    for (const p of P) { p.x += p.vx; p.y += p.vy; if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10; }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 15000) { ctx.strokeStyle = `rgba(10,100,164,${(.09 * (1 - d2 / 15000)).toFixed(3)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    for (const p of P) { ctx.fillStyle = `rgba(${p.c},.32)`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    // медленная «сканирующая» волна по экрану
    const sy = (t / 40) % (H + 300) - 150, g = ctx.createLinearGradient(0, sy - 120, 0, sy);
    g.addColorStop(0, 'rgba(25,162,223,0)'); g.addColorStop(1, 'rgba(25,162,223,.05)'); ctx.fillStyle = g; ctx.fillRect(0, sy - 120, W, 120);
  };
  requestAnimationFrame(frame);
}
function startApp() { bgFx(); shell(); route(); }
gate();
