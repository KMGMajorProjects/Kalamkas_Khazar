'use strict';
/* =====================================================================
   ВЫГРУЗКА: справка PDF · презентация PPTX · документ Word
   Всё собирается в браузере из уже расшифрованных данных — на сервер ничего не уходит.
   ===================================================================== */
const XP = { sel: new Set(), fmt: 'pdf', mode: 'brief', open: {} };
const XP_PRESETS = {
  'Кратко для руководства': [6, 7, 10, 17, 21, 63, 83, 96, 104, 116, 118, 139, 140, 141, 143, 168],
  'Санкции и выход ЛУКОЙЛа': [94, 95, 96, 97, 98, 100, 101, 103, 104, 106, 108, 110, 111, 112].map(n => n).filter(n => n !== 94),
  'CNOOC, HoA, JTS': [114, 115, 116, 117, 118, 119, 120, 122, 123, 124, 128],
  'CAPEX и финансы': [83, 84, 85, 86, 87, 89, 91, 92, 63, 69],
  'Ранние работы': [41, 42, 43, 44, 46, 47, 49, 50, 52, 55, 57],
};
const libs = {};
const loadLib = (src, test) => libs[src] ||= new Promise((res, rej) => { if (test()) return res(); const s = document.createElement('script'); s.src = src + VQ; s.onload = () => test() ? res() : rej(new Error('lib')); s.onerror = () => rej(new Error('lib ' + src)); document.head.appendChild(s); });

/* ---------- 1. общая структура контента ---------- */
function xpBlocks(s, brief) {
  const B = [], cut = (a, k) => brief ? a.slice(0, k) : a;
  switch (s.type) {
    case 'points': B.push({ k: 'list', items: cut(s.items, 4) }); break;
    case 'stats': B.push({ k: 'stats', items: s.items }); break;
    case 'flow': B.push({ k: 'flow', items: s.steps.map(x => x.t) }); break;
    case 'timeline': B.push({ k: 'tl', items: cut(s.items, 6) }); break;
    case 'compare': B.push({ k: 'cols', cols: s.cols.map(c => ({ h: c.h, items: cut(c.items, 4) })) }); break;
    case 'table': B.push({ k: 'table', head: s.head, rows: cut(s.rows, 7) }); if (brief && s.rows.length > 7) B.push({ k: 'more', text: `…ещё ${s.rows.length - 7} строк — см. СЛ ${pad3(s.n)}` }); break;
    case 'quote': B.push({ k: 'quote', text: s.items[0], sub: s.items[1] || '' }); break;
    default: B.push({ k: 'list', items: cut(s.items || [], 4) });
  }
  if (!brief && s.notes && s.notes.length) B.push({ k: 'note', items: s.notes });
  if (s.flag) B.push({ k: 'flag', text: 'В исходном слайде есть оговорка: цифры и даты требуют сверки с первичным документом.' });
  return B;
}
function xpModel() {
  const order = []; DATA.modules.forEach(m => m.slides.forEach(n => { if (XP.sel.has(n)) order.push([m, n]); }));
  [2, 3, 4].forEach(n => { if (XP.sel.has(n)) order.unshift([{ id: 'start', n: '00', s: 'Старт', t: 'Старт', d: '' }, n]); });
  const secs = []; order.forEach(([m, n]) => { let sec = secs[secs.length - 1]; if (!sec || sec.m.id !== m.id) secs.push(sec = { m, items: [] }); const s = S(n); if (s && s.type !== 'divider' && n !== 6) sec.items.push({ s, blocks: xpBlocks(s, XP.mode === 'brief') }); });
  return { title: $('#xpTitle').value.trim() || 'Справка по проекту Каламкас-море – Хазар', asof: DATA.meta.asof.split('-').reverse().join('.'), author: USER.n || USER.l, role: USER.r || '', date: new Date().toLocaleDateString('ru-RU'), key: S(6).items, secs: secs.filter(x => x.items.length), count: order.length };
}
const fileBase = () => `KKH_${XP.mode === 'brief' ? 'kratko' : 'polno'}_${DATA.meta.asof}`;
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function imgToData(src, mime = 'image/png', q = .88, maxW = 1600) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { const k = Math.min(1, maxW / im.naturalWidth), c = document.createElement('canvas'); c.width = im.naturalWidth * k; c.height = im.naturalHeight * k; const x = c.getContext('2d'); if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height); res({ data: c.toDataURL(mime, q), w: c.width, h: c.height }); }; im.onerror = rej; im.src = src; });
}

/* ---------- 2. PDF: печатный A4-документ (браузер → «Сохранить как PDF») ---------- */
function xpHTML(M) {
  const e = esc, base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const blk = b => {
    switch (b.k) {
      case 'list': return `<ul>${b.items.map(x => `<li>${e(x)}</li>`).join('')}</ul>`;
      case 'stats': return `<div class="sts">${b.items.map(([v, l]) => `<div><b>${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div>`;
      case 'flow': return `<ol class="flow">${b.items.map(x => `<li>${e(x)}</li>`).join('')}</ol>`;
      case 'tl': return `<table class="tl">${b.items.map(([d, x]) => `<tr><td>${e(d)}</td><td>${e(x)}</td></tr>`).join('')}</table>`;
      case 'cols': return `<div class="cols">${b.cols.map(c => `<div><h4>${e(c.h)}</h4><ul>${c.items.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>`).join('')}</div>`;
      case 'table': return `<table class="tb"><thead><tr>${b.head.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      case 'quote': return `<blockquote>${e(b.text)}${b.sub ? `<small>${e(b.sub)}</small>` : ''}</blockquote>`;
      case 'note': return `<p class="note">${b.items.map(e).join('<br>')}</p>`;
      case 'flag': return `<p class="flag">⚠ ${e(b.text)}</p>`;
      case 'more': return `<p class="more">${e(b.text)}</p>`;
    }
    return '';
  };
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${e(M.title)} · ${M.asof}</title><base href="${base}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Onest:wght@400;500;600&display=swap">
<style>
@page{size:A4;margin:16mm 16mm 18mm}
*{box-sizing:border-box}body{margin:0;font:10.5pt/1.5 Onest,"Segoe UI",Arial,sans-serif;color:#0a1d33}
h1,h2,h3,h4,b{font-family:Montserrat,"Segoe UI",Arial,sans-serif}
.cover{height:257mm;display:flex;flex-direction:column;page-break-after:always;position:relative}
.logos{display:flex;align-items:center;gap:18px}.logos img{height:46px}.logos .k{height:30px}.logos i{width:1px;height:36px;background:#cbd5e1}
.cv-ph{margin:22mm -16mm 0;height:78mm;background:url(platform-hd.webp) 85% 60%/cover;position:relative}
.cv-ph:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#fff 0,rgba(255,255,255,.75) 38%,rgba(255,255,255,0) 70%)}
.cv-t{margin-top:-60mm;position:relative;z-index:1;max-width:120mm}
.eyebrow{font:600 8pt Montserrat,Arial;letter-spacing:.14em;text-transform:uppercase;color:#0a64a4}
.cover h1{font-size:26pt;line-height:1.08;color:#0a2547;margin:6px 0 10px;letter-spacing:-.02em}
.cv-meta{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border-top:2px solid #0a64a4;padding-top:12px;font-size:9pt}
.cv-meta span{display:block;color:#64748b;font-size:7.5pt;text-transform:uppercase;letter-spacing:.08em}
.conf{margin-top:10px;font-size:8pt;color:#c0392b}
.key{border:1px solid #d6e2ee;border-radius:10px;padding:10px 12px;margin:0 0 14px;background:#f5f9fd}
.key h3{margin:0 0 8px;font-size:10pt;color:#0a64a4}
.sts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0}
.sts div{border:1px solid #d6e2ee;border-top:3px solid #0a64a4;border-radius:8px;padding:7px 9px;background:#fff;page-break-inside:avoid}
.sts b{display:block;font-size:13pt;color:#0a2547}.sts span{font-size:8.5pt;color:#475569;line-height:1.3;display:block;margin-top:2px}
.toc{columns:2;font-size:9.5pt;margin:0 0 6px;padding-left:18px}
.sec{margin-top:18px}.sec>h2{border-bottom:2px solid #0a64a4;padding-bottom:4px;page-break-after:avoid}.brief .cover{height:auto;page-break-after:auto;margin-bottom:12px}.brief .cv-ph{height:52mm;margin-top:8mm}.brief .cv-t{margin-top:-42mm}.brief .cv-meta{margin-top:14px}
.sec>h2{font-size:16pt;color:#0a2547;margin:0 0 4px;display:flex;gap:10px;align-items:baseline}
.sec>h2 em{font-style:normal;font-size:10pt;color:#fff;background:#0a64a4;border-radius:5px;padding:2px 7px}
.sec>p.d{margin:0 0 12px;color:#475569;font-size:9.5pt;break-after:avoid;page-break-after:avoid}
.it{margin:0 0 12px;page-break-inside:avoid;break-inside:avoid}.it.long{page-break-inside:auto;break-inside:auto}.it h3{page-break-after:avoid;break-after:avoid}
.it h3{font-size:11.5pt;color:#0a2547;margin:0 0 5px;padding-top:6px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px}
.it h3 small{font:500 7.5pt Onest,Arial;color:#94a3b8;white-space:nowrap}
ul{margin:3px 0 6px;padding-left:16px}li{margin:2px 0}
ol.flow{display:flex;gap:6px;padding:0;margin:4px 0 6px;list-style:none;counter-reset:f}
ol.flow li{flex:1;border:1px solid #d6e2ee;border-radius:7px;padding:6px 7px;font-size:8.8pt;background:#f8fbfe;counter-increment:f}
ol.flow li:before{content:counter(f,decimal-leading-zero);display:block;font:600 7pt Montserrat,Arial;color:#0a64a4}
table{width:100%;border-collapse:collapse;font-size:8.8pt;margin:4px 0 6px}
.tb th{background:#0a2547;color:#fff;text-align:left;padding:5px 7px;font:600 7.5pt Montserrat,Arial;text-transform:uppercase;letter-spacing:.04em}
.tb td{border-bottom:1px solid #e2e8f0;padding:5px 7px;vertical-align:top}.tb td:first-child{font-weight:600;color:#0a2547}
.tb tr{page-break-inside:avoid}
.tl td{padding:4px 7px;border-bottom:1px solid #eef2f7;vertical-align:top}.tl td:first-child{width:28%;color:#0a64a4;font-weight:600}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:10px}
.cols>div{border:1px solid #d6e2ee;border-top:3px solid #0a64a4;border-radius:8px;padding:6px 9px}
.cols>div:nth-child(2){border-top-color:#e0284a}.cols h4{margin:0 0 4px;font-size:8.5pt;color:#0a64a4}
blockquote{margin:4px 0;padding:8px 12px;border-left:4px solid #0a64a4;background:#f5f9fd;font:600 11.5pt/1.4 Montserrat,Arial;color:#0a2547}
blockquote small{display:block;margin-top:6px;font:400 9pt Onest,Arial;color:#475569}
.note{font-size:8.5pt;color:#475569;background:#f8fafc;border-radius:6px;padding:5px 8px;margin:4px 0}
.flag{font-size:8.3pt;color:#8a5a00;background:#fff7e6;border-radius:6px;padding:4px 8px;margin:4px 0}
.more{font-size:8.3pt;color:#64748b;font-style:italic;margin:2px 0}
.src{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:8pt;color:#64748b}
</style></head><body class="${XP.mode === 'brief' ? 'brief' : ''}">
<section class="cover"><div class="logos"><img src="kko.png" alt=""><i></i><img class="k" src="kmg.webp" alt=""></div>
<div class="cv-ph"></div><div class="cv-t"><div class="eyebrow">ДКНП КМГ · ${XP.mode === 'brief' ? 'краткая справка' : 'подробная справка'}</div><h1>${e(M.title)}</h1><div>По материалам программы погружения · данные обновлены ${M.asof}</div></div>
<div class="cv-meta"><div><span>Подготовил</span>${e(M.author)}</div><div><span>Дата формирования</span>${M.date}</div><div><span>Объём</span>${M.count} слайдов · ${M.secs.length} разделов</div></div>
<div class="conf">Внутренний рабочий материал. Не для внешнего распространения.</div></section>
<div class="key"><h3>Ключевые параметры проекта (СЛ 006)</h3><div class="sts">${M.key.map(([v, l]) => `<div><b>${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div>
<h3 style="margin-top:10px">Содержание</h3><ol class="toc">${M.secs.map(x => `<li>${e(x.m.s)} (${x.items.length})</li>`).join('')}</ol></div>
${M.secs.map(sec => `<section class="sec"><h2><em>${sec.m.n}</em>${e(sec.m.t)}</h2>${sec.m.d ? `<p class="d">${e(sec.m.d)}</p>` : ''}
${sec.items.map(it => `<div class="it${JSON.stringify(it.blocks).length > 1800 ? ' long' : ''}"><h3><span>${e(it.s.t)}</span><small>СЛ ${pad3(it.s.n)}</small></h3>${it.blocks.map(blk).join('')}</div>`).join('')}</section>`).join('')}
<p class="src">Источник: программа погружения ДКНП «Каламкас-море – Хазар», ${DATA.meta.count} слайдов, данные на ${M.asof}. Формулировки приведены по слайдам; перед использованием в управленческих документах сверять с первичными документами.</p>
</body></html>`;
}
async function xpPDF(M) {
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(fr);
  const d = fr.contentDocument; d.open(); d.write(xpHTML(M)); d.close();
  await new Promise(r => fr.onload ? (fr.onload = r, setTimeout(r, 2500)) : setTimeout(r, 1500));
  try { await fr.contentDocument.fonts.ready; } catch (e) { }
  await Promise.all([...fr.contentDocument.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  await sleep(300);
  fr.contentWindow.focus(); fr.contentWindow.print();
  setTimeout(() => fr.remove(), 60000);
}

/* ---------- 3. PPTX ---------- */
async function xpPPTX(M) {
  await loadLib('lib-pptx.js', () => !!window.PptxGenJS);
  const P = new PptxGenJS(); P.layout = 'LAYOUT_WIDE'; P.title = M.title; P.author = M.author; P.company = 'Kalamkas-Khazar Operating';
  const F = 'Arial', NAVY = '0A2547', BLUE = '0A64A4', CYAN = '19A2DF', CRIM = 'E0284A', GREY = '64748B', LINE = 'D6E2EE';
  const [kko, kmg, cov] = await Promise.all([imgToData('kko.png'), imgToData('kmg.webp'), imgToData('platform-hd.webp', 'image/jpeg', .86, 1800)]);
  const photo = {}; for (const sec of M.secs) { const m = sec.m; if (m.id === 'start') continue; const f = HAS.has(`ban-${m.id}.webp`) ? `ban-${m.id}.webp` : `${m.photo}.webp`; try { photo[m.id] = await imgToData(f, 'image/jpeg', .84, 1400); } catch (e) { } }
  P.defineSlideMaster({ title: 'C', background: { color: 'FFFFFF' }, objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: .09, fill: { color: BLUE } } },
    { image: { data: kko.data, x: 12.15, y: .28, w: .85, h: .85 * kko.h / kko.w } },
    { line: { x: .6, y: 7.0, w: 12.13, h: 0, line: { color: LINE, width: .75 } } },
    { text: { text: 'Каламкас-море – Хазар · внутренний рабочий материал', options: { x: .6, y: 7.05, w: 8, h: .3, fontFace: F, fontSize: 9, color: GREY } } },
  ], slideNumber: { x: 12.3, y: 7.05, w: .5, h: .3, fontFace: F, fontSize: 9, color: GREY, align: 'right' } });
  // титул
  let sl = P.addSlide(); sl.background = { color: 'FFFFFF' };
  sl.addImage({ data: cov.data, x: 5.6, y: 0, w: 7.733, h: 7.5, sizing: { type: 'cover', w: 7.733, h: 7.5 } });
  sl.addShape(P.ShapeType.rect, { x: 5.6, y: 0, w: 3.2, h: 7.5, fill: { color: 'FFFFFF', transparency: 15 }, line: { type: 'none' } });
  sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 5.6, h: 7.5, fill: { color: 'FFFFFF' }, line: { type: 'none' } });
  sl.addImage({ data: kko.data, x: .7, y: .6, w: 1.25, h: 1.25 * kko.h / kko.w });
  sl.addImage({ data: kmg.data, x: 2.25, y: .78, w: 2.0, h: 2.0 * kmg.h / kmg.w });
  sl.addText(`ДКНП КМГ · ${XP.mode === 'brief' ? 'краткая справка' : 'подробная справка'}`.toUpperCase(), { x: .7, y: 2.2, w: 6.5, h: .35, fontFace: F, fontSize: 11, bold: true, color: BLUE, charSpacing: 2 });
  sl.addText(M.title, { x: .7, y: 2.6, w: 6.6, h: 2.0, fontFace: F, fontSize: M.title.length > 50 ? 30 : 36, bold: true, color: NAVY, valign: 'top', fit: 'shrink' });
  sl.addText(`По материалам программы погружения\nданные обновлены ${M.asof}`, { x: .7, y: 4.7, w: 6, h: .8, fontFace: F, fontSize: 14, color: '3B5170' });
  sl.addShape(P.ShapeType.rect, { x: .7, y: 5.9, w: 4.4, h: .04, fill: { color: BLUE }, line: { type: 'none' } });
  sl.addText([{ text: 'Подготовил: ', options: { color: GREY } }, { text: M.author + '\n', options: { bold: true } }, { text: 'Дата: ', options: { color: GREY } }, { text: `${M.date}  ·  ${M.count} слайдов` }], { x: .7, y: 6.0, w: 5.5, h: .8, fontFace: F, fontSize: 12, color: NAVY });
  // ключевые параметры
  sl = P.addSlide({ masterName: 'C' }); head(sl, 'Ключевые параметры проекта', 'СЛ 006');
  M.key.forEach(([v, l], i) => { const x = .6 + (i % 2) * 6.1, y = 1.55 + Math.floor(i / 2) * 2.55; card(sl, x, y, 5.9, 2.3, BLUE);
    sl.addText(v, { x: x + .3, y: y + .3, w: 5.3, h: .95, fontFace: F, fontSize: 36, bold: true, color: NAVY, fit: 'shrink' }); sl.addText(l, { x: x + .3, y: y + 1.25, w: 5.3, h: .8, fontFace: F, fontSize: 15, color: '3B5170', valign: 'top' }); });
  // содержание
  sl = P.addSlide({ masterName: 'C' }); head(sl, 'Содержание', '');
  const half = Math.ceil(M.secs.length / 2);
  [M.secs.slice(0, half), M.secs.slice(half)].forEach((col, c) => sl.addText(col.map(x => ({ text: `${x.m.n}   ${x.m.s}   ·  ${x.items.length}`, options: { breakLine: true, paraSpaceAfter: 10 } })), { x: .7 + c * 6.1, y: 1.5, w: 5.8, h: 5.2, fontFace: F, fontSize: 18, color: NAVY, valign: 'top' }));
  // разделы
  for (const sec of M.secs) {
    if (sec.m.id !== 'start' && XP.mode === 'full') {
      sl = P.addSlide(); const ph = photo[sec.m.id];
      if (ph) sl.addImage({ data: ph.data, x: 6.2, y: 0, w: 7.133, h: 7.5, sizing: { type: 'cover', w: 7.133, h: 7.5 } });
      sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 6.2, h: 7.5, fill: { color: 'F3F7FB' }, line: { type: 'none' } });
      sl.addText(sec.m.n, { x: .7, y: .8, w: 4, h: 1.6, fontFace: F, fontSize: 96, bold: true, color: BLUE });
      sl.addText(sec.m.t, { x: .7, y: 2.7, w: 5.2, h: 2.0, fontFace: F, fontSize: 28, bold: true, color: NAVY, valign: 'top', fit: 'shrink' });
      sl.addText(sec.m.d, { x: .7, y: 4.8, w: 5.1, h: 1.8, fontFace: F, fontSize: 14, color: '3B5170', valign: 'top', fit: 'shrink' });
    }
    for (const it of sec.items) pptxItem(P, it, { F, NAVY, BLUE, CYAN, CRIM, GREY, LINE }, sec.m);
  }
  sl = P.addSlide({ masterName: 'C' }); head(sl, 'Источник и оговорки', '');
  sl.addText(`Программа погружения ДКНП «Каламкас-море – Хазар», ${DATA.meta.count} слайдов, данные на ${M.asof}.\n\nФормулировки приведены по слайдам. Перед использованием в управленческих документах сверять с первичными документами (протоколы, письма, решения органов).`, { x: .7, y: 1.6, w: 11.8, h: 3, fontFace: F, fontSize: 18, color: NAVY, valign: 'top' });
  await P.writeFile({ fileName: fileBase() + '.pptx' });

  function head(s, t, ref) { s.addText(t, { x: .6, y: .3, w: 10.9, h: .85, fontFace: F, fontSize: t.length > 70 ? 20 : 24, bold: true, color: NAVY, valign: 'middle', fit: 'shrink' }); if (ref) s.addText(ref, { x: 10.4, y: 1.12, w: 2.33, h: .3, fontFace: F, fontSize: 10, color: GREY, align: 'right' }); s.addShape(P.ShapeType.rect, { x: .6, y: 1.18, w: 1.2, h: .05, fill: { color: CYAN }, line: { type: 'none' } }); }
  function card(s, x, y, w, h, c) { s.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: .12, fill: { color: 'F5F9FD' }, line: { color: LINE, width: .75 } }); s.addShape(P.ShapeType.rect, { x: x + .02, y: y + .02, w: w - .04, h: .07, fill: { color: c }, line: { type: 'none' } }); }
}
function fitSize(chars, lines, area) { // подбор кегля под объём текста
  const s = [20, 18, 16, 15, 14, 13, 12, 11]; for (const f of s) { const cpl = area.w * 72 / (f * .52), est = Math.ceil(chars / cpl) + lines * .4; if (est * f * 1.32 / 72 <= area.h) return f; } return 10.5;
}
function pptxItem(P, it, C, m) {
  const { F, NAVY, BLUE, CYAN, CRIM, GREY, LINE } = C, s = it.s, ref = `${m && m.id !== 'start' ? m.n + ' · ' + m.s + '  ·  ' : ''}СЛ ${pad3(s.n)}`;
  const mk = (cont) => { const sl = P.addSlide({ masterName: 'C' }); const t = s.t + (cont ? ' (продолжение)' : '');
    sl.addText(t, { x: .6, y: .3, w: 10.9, h: .85, fontFace: F, fontSize: t.length > 75 ? 19 : 23, bold: true, color: NAVY, valign: 'middle', fit: 'shrink' });
    sl.addText(ref, { x: 7.7, y: 1.12, w: 5.03, h: .3, fontFace: F, fontSize: 10, color: GREY, align: 'right' });
    sl.addShape(P.ShapeType.rect, { x: .6, y: 1.18, w: 1.2, h: .05, fill: { color: CYAN }, line: { type: 'none' } }); return sl; };
  const main = it.blocks.find(b => !['note', 'flag', 'more'].includes(b.k)), extra = it.blocks.filter(b => ['note', 'flag', 'more'].includes(b.k));
  const foot = (sl, y) => { const t = extra.map(b => b.k === 'note' ? b.items.join(' ') : b.text).join('  ·  '); if (t) sl.addText(t, { x: .6, y, w: 12.1, h: 6.9 - y, fontFace: F, fontSize: t.length > 260 ? 10 : 11, italic: true, color: extra.some(b => b.k === 'flag') ? '8A5A00' : GREY, valign: 'top', fit: 'shrink' }); };
  const footH = extra.length ? (extra.reduce((a, b) => a + (b.items ? b.items.join(' ').length : b.text.length), 0) > 220 ? 1.0 : .6) : 0;
  const top = 1.5, bottom = 6.85 - footH;
  if (!main) { const sl = mk(); foot(sl, top); return; }
  if (main.k === 'list' || main.k === 'flow' && main.items.length > 6) {
    const items = main.items; const chunks = []; let cur = [], len = 0;
    items.forEach(t => { if (cur.length && (cur.length >= 6 || len + t.length > 820)) { chunks.push(cur); cur = []; len = 0; } cur.push(t); len += t.length; }); if (cur.length) chunks.push(cur);
    chunks.forEach((ch, ci) => { const sl = mk(ci > 0), h = bottom - top, f = fitSize(ch.join(' ').length, ch.length, { w: 11.9, h });
      sl.addText(ch.map((t, i) => ({ text: t, options: { bullet: main.k === 'flow' ? { type: 'number' } : { code: '25A0' }, breakLine: true, paraSpaceAfter: 8 } })), { x: .7, y: top, w: 11.9, h, fontFace: F, fontSize: f, color: NAVY, valign: 'top' });
      if (ci === chunks.length - 1) foot(sl, bottom + .08); });
    return;
  }
  const sl = mk();
  if (main.k === 'stats') {
    const n = main.items.length, cols = n <= 4 ? n : 3, rows = Math.ceil(n / cols), gw = 12.1, w = (gw - (cols - 1) * .3) / cols, h = Math.min(rows === 1 ? 3.0 : 2.3, (bottom - top - .3 - (rows - 1) * .3) / rows), y0 = top + Math.max(.2, (bottom - top - (rows * h + (rows - 1) * .3)) / 2 - .2);
    main.items.forEach(([v, l], i) => { const x = .6 + (i % cols) * (w + .3), y = y0 + Math.floor(i / cols) * (h + .3);
      sl.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: .12, fill: { color: 'F5F9FD' }, line: { color: LINE, width: .75 } }); sl.addShape(P.ShapeType.rect, { x: x + .02, y: y + .02, w: w - .04, h: .07, fill: { color: i % 2 ? CRIM : BLUE }, line: { type: 'none' } });
      sl.addText(v, { x: x + .25, y: y + .3, w: w - .5, h: h * .42, fontFace: F, fontSize: cols <= 3 ? 36 : 30, bold: true, color: NAVY, fit: 'shrink', valign: 'middle' });
      sl.addText(l, { x: x + .25, y: y + .3 + h * .42, w: w - .5, h: h * .48, fontFace: F, fontSize: l.length > 60 ? 13 : 15, color: '3B5170', valign: 'top', fit: 'shrink' }); });
    foot(sl, y0 + rows * (h + .3) + .05);
  } else if (main.k === 'flow') {
    const n = main.items.length, w = (12.1 - (n - 1) * .35) / n, f = fitSize(Math.max(...main.items.map(t => t.length)), 1, { w: w - .3, h: 1.6 });
    main.items.forEach((t, i) => { const x = .6 + i * (w + .35); sl.addShape(P.ShapeType.roundRect, { x, y: 2.4, w, h: 2.2, rectRadius: .12, fill: { color: i === 0 ? 'E8F4FC' : 'F5F9FD' }, line: { color: i === 0 ? CYAN : LINE, width: 1 } });
      sl.addText(String(i + 1).padStart(2, '0'), { x: x + .15, y: 2.5, w: w - .3, h: .35, fontFace: F, fontSize: 11, bold: true, color: BLUE });
      sl.addText(t, { x: x + .15, y: 2.85, w: w - .3, h: 1.65, fontFace: F, fontSize: f, color: NAVY, valign: 'top', fit: 'shrink' });
      if (i < n - 1) sl.addShape(P.ShapeType.rightArrow, { x: x + w + .05, y: 3.35, w: .25, h: .3, fill: { color: CYAN }, line: { type: 'none' } }); });
    foot(sl, 4.9);
  } else if (main.k === 'table' || main.k === 'tl') {
    const head = main.k === 'tl' ? null : main.head, rows = main.k === 'tl' ? main.items : main.rows;
    const per = 8, chunks = []; for (let i = 0; i < rows.length; i += per) chunks.push(rows.slice(i, i + per));
    chunks.forEach((ch, ci) => { const t = ci ? mk(true) : sl, total = ch.flat().join(' ').length, avg = total / ch.length, f = total > 1300 ? 11 : total > 900 ? 12 : ch.length <= 4 && avg < 140 ? 17 : ch.length <= 6 && avg < 160 ? 15 : 13, rh = Math.min(.9, Math.max(.42, (bottom - top - .2) / (ch.length + (head ? 1 : 0))));
      const cols = (head || ch[0]).length, cw = main.k === 'tl' ? [3, 9.1] : Array.from({ length: cols }, (_, i) => i === 0 ? 12.1 * (cols > 2 ? .26 : .32) : 12.1 * (1 - (cols > 2 ? .26 : .32)) / (cols - 1));
      const data = []; if (head) data.push(head.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: f - 1 } })));
      ch.forEach(r => data.push(r.map((c, i) => ({ text: c, options: { bold: i === 0, color: i === 0 ? (main.k === 'tl' ? BLUE : NAVY) : '1E293B' } }))));
      t.addTable(data, { x: .6, y: top, w: 12.1, colW: cw, fontFace: F, fontSize: f, border: { type: 'solid', color: LINE, pt: .75 }, fill: { color: 'FFFFFF' }, valign: 'middle', margin: .1, rowH: rh, autoPage: false });
      if (ci === chunks.length - 1) foot(t, Math.min(6.2, top + rh * (ch.length + (head ? 1 : 0)) + .35)); });
  } else if (main.k === 'cols') {
    const n = main.cols.length, w = (12.1 - (n - 1) * .3) / n;
    main.cols.forEach((c, i) => { const x = .6 + i * (w + .3), h = bottom - top, f = fitSize(c.items.join(' ').length, c.items.length, { w: w - .4, h: h - .8 });
      sl.addShape(P.ShapeType.roundRect, { x, y: top, w, h, rectRadius: .1, fill: { color: 'F5F9FD' }, line: { color: LINE, width: .75 } }); sl.addShape(P.ShapeType.rect, { x: x + .02, y: top + .02, w: w - .04, h: .07, fill: { color: i === 1 ? CRIM : BLUE }, line: { type: 'none' } });
      sl.addText(c.h, { x: x + .2, y: top + .2, w: w - .4, h: .5, fontFace: F, fontSize: 13, bold: true, color: i === 1 ? CRIM : BLUE, fit: 'shrink' });
      sl.addText(c.items.map(t => ({ text: t, options: { bullet: { code: '25A0' }, breakLine: true, paraSpaceAfter: 6 } })), { x: x + .2, y: top + .75, w: w - .4, h: h - .9, fontFace: F, fontSize: Math.min(f, 16), color: NAVY, valign: 'top' }); });
    foot(sl, bottom + .08);
  } else if (main.k === 'quote') {
    sl.addShape(P.ShapeType.rect, { x: .9, y: 2.2, w: .09, h: 2.6, fill: { color: BLUE }, line: { type: 'none' } });
    sl.addText(main.text, { x: 1.2, y: 2.0, w: 11, h: 3.0, fontFace: F, fontSize: 26, bold: true, color: NAVY, valign: 'middle', fit: 'shrink' });
    if (main.sub) sl.addText(main.sub, { x: 1.2, y: 5.1, w: 11, h: 1.2, fontFace: F, fontSize: 15, color: '3B5170', valign: 'top' });
  }
}

/* ---------- 4. DOCX ---------- */
async function xpDOCX(M) {
  await loadLib('lib-docx.js', () => !!window.docx);
  const D = window.docx, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType, BorderStyle, ImageRun, PageBreak, Footer, PageNumber } = D;
  const F = 'Arial', run = (t, o = {}) => new TextRun({ text: t, font: F, size: o.size || 21, bold: o.bold, italics: o.italic, color: o.color || '0A1D33' });
  const P = (t, o = {}) => new Paragraph({ children: Array.isArray(t) ? t : [run(t, o)], spacing: { after: o.after ?? 80, before: o.before || 0 }, alignment: o.align, bullet: o.bullet ? { level: 0 } : undefined, numbering: o.num ? { reference: 'num', level: 0, instance: o.num } : undefined });
  const bd = { style: BorderStyle.SINGLE, size: 4, color: 'D6E2EE' }, borders = { top: bd, bottom: bd, left: bd, right: bd };
  const cell = (t, o = {}) => new TableCell({ children: [P(t, { size: o.size || 19, bold: o.bold, color: o.color, after: 20 })], shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined, borders, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 } });
  const table = (rows, head, widths) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [...(head ? [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, color: 'FFFFFF', fill: '0A2547', size: 17, w: widths && widths[i] })) })] : []), ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, { bold: i === 0, color: i === 0 ? '0A2547' : undefined, w: widths && widths[i] })) }))] });
  const [kko, kmg] = await Promise.all([imgToData('kko.png'), imgToData('kmg.webp')]);
  const b64 = d => Uint8Array.from(atob(d.split(',')[1]), c => c.charCodeAt(0));
  const kids = [];
  kids.push(new Paragraph({ children: [new ImageRun({ data: b64(kko.data), transformation: { width: 90, height: 90 * kko.h / kko.w } }), run('     '), new ImageRun({ data: b64(kmg.data), transformation: { width: 170, height: 170 * kmg.h / kmg.w } })], spacing: { after: 300 } }));
  kids.push(P(`ДКНП КМГ · ${XP.mode === 'brief' ? 'КРАТКАЯ СПРАВКА' : 'ПОДРОБНАЯ СПРАВКА'}`, { size: 18, bold: true, color: '0A64A4', after: 60 }));
  kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [run(M.title, { size: 40, bold: true, color: '0A2547' })], spacing: { after: 120 } }));
  kids.push(P(`По материалам программы погружения · данные обновлены ${M.asof}`, { color: '3B5170', after: 40 }));
  kids.push(P([run('Подготовил: ', { color: '64748B' }), run(`${M.author}${M.role ? ', ' + M.role : ''}`, { bold: true }), run(`   ·   Дата: ${M.date}`, { color: '64748B' })], { after: 60 }));
  kids.push(P('Внутренний рабочий материал. Не для внешнего распространения.', { size: 17, color: 'C0392B', after: 240 }));
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run('Ключевые параметры проекта', { size: 26, bold: true, color: '0A64A4' })], spacing: { after: 100 } }));
  kids.push(table(M.key.map(([v, l]) => [v, l]), null, [28, 72]));
  let numI = 1;
  M.secs.forEach(sec => {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '0A64A4', space: 2 } }, children: [run(`${sec.m.n}  ${sec.m.t}`, { size: 30, bold: true, color: '0A2547' })], spacing: { before: 360, after: 80 } }));
    if (sec.m.d) kids.push(P(sec.m.d, { color: '475569', size: 19, after: 200 }));
    sec.items.forEach(it => {
      kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [run(it.s.t, { size: 24, bold: true, color: '0A2547' }), run(`   СЛ ${pad3(it.s.n)}`, { size: 16, color: '94A3B8' })], spacing: { before: 220, after: 80 } }));
      it.blocks.forEach(b => {
        if (b.k === 'list') b.items.forEach(t => kids.push(P(t, { bullet: true, after: 40 })));
        else if (b.k === 'flow') { const n = numI++; b.items.forEach(t => kids.push(P(t, { num: n, after: 40 }))); }
        else if (b.k === 'stats') kids.push(table(b.items.map(([v, l]) => [v, l]), null, [28, 72]));
        else if (b.k === 'tl') kids.push(table(b.items, null, [26, 74]));
        else if (b.k === 'table') kids.push(table(b.rows, b.head));
        else if (b.k === 'cols') kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: b.cols.map(c => new TableCell({ borders, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [P(c.h, { bold: true, color: '0A64A4', size: 18 }), ...c.items.map(t => P(t, { bullet: true, size: 19, after: 30 }))] })) })] }));
        else if (b.k === 'quote') { kids.push(P(b.text, { bold: true, size: 25, color: '0A2547', after: 60 })); if (b.sub) kids.push(P(b.sub, { color: '475569' })); }
        else if (b.k === 'note') b.items.forEach(t => kids.push(P(t, { italic: true, size: 18, color: '475569', after: 40 })));
        else if (b.k === 'flag') kids.push(P('⚠ ' + b.text, { size: 17, color: '8A5A00', after: 40 }));
        else if (b.k === 'more') kids.push(P(b.text, { italic: true, size: 17, color: '64748B' }));
      });
    });
  });
  kids.push(P(`Источник: программа погружения ДКНП «Каламкас-море – Хазар», ${DATA.meta.count} слайдов, данные на ${M.asof}. Перед использованием сверять с первичными документами.`, { size: 17, color: '64748B', before: 300 }));
  const doc = new D.Document({ creator: M.author, title: M.title,
    numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] }] },
    styles: { default: { document: { run: { font: F, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Каламкас-море – Хазар · внутренний материал · стр. ', font: F, size: 16, color: '94A3B8' }), new TextRun({ children: [PageNumber.CURRENT], font: F, size: 16, color: '94A3B8' })] })] }) },
      children: kids }] });
  download(await D.Packer.toBlob(doc), fileBase() + '.docx');
}

/* ---------- 5. окно выбора ---------- */
function xpInit() {
  document.body.insertAdjacentHTML('beforeend', `<div class="xp" id="xp" role="dialog" aria-label="Выгрузка"><div class="xp-box glass prism">
    <div class="xp-h"><div><div class="eyebrow">Выгрузка</div><h2>Справка · презентация · документ</h2><p>Отметьте нужные пункты — файл соберётся автоматически в вашем браузере.</p></div><button class="xp-x" id="xpX" aria-label="Закрыть">✕</button></div>
    <div class="xp-b">
      <div class="xp-l">
        <div class="xp-pre" id="xpPre">${Object.keys(XP_PRESETS).map(k => `<button type="button" data-p="${k}">${k}</button>`).join('')}<button type="button" data-p="*">Всё</button><button type="button" data-p="-">Очистить</button></div>
        <div class="xp-tree" id="xpTree"></div>
      </div>
      <div class="xp-r">
        <div class="lbl">Формат</div>
        <div class="xp-fmt" id="xpFmt">
          <button type="button" data-f="pdf" class="on"><b>Справка PDF</b><span>A4, печать → «Сохранить как PDF»</span></button>
          <button type="button" data-f="pptx"><b>Презентация PPTX</b><span>16:9, слайд на каждый пункт</span></button>
          <button type="button" data-f="docx"><b>Документ Word</b><span>.docx, редактируемый</span></button>
        </div>
        <div class="lbl" style="margin-top:14px">Объём</div>
        <div class="seg" id="xpMode"><button type="button" data-m="brief" class="on">Кратко</button><button type="button" data-m="full">Полностью</button></div>
        <p class="xp-hint" id="xpHint"></p>
        <label class="lbl" for="xpTitle" style="display:block;margin-top:12px">Заголовок</label>
        <input id="xpTitle" class="xp-in" value="Справка по проекту Каламкас-море – Хазар">
        <div class="xp-sum" id="xpSum"></div>
        <button class="btn-primary" id="xpGo" type="button"><span id="xpGoT">Сформировать</span></button>
        <p class="xp-st" id="xpSt" role="status"></p>
      </div>
    </div></div></div>`);
  const tree = $('#xpTree');
  const draw = () => {
    tree.innerHTML = DATA.modules.map(m => { const on = m.slides.filter(n => XP.sel.has(n)).length, all = m.slides.length;
      return `<div class="xt${XP.open[m.id] ? ' open' : ''}"><div class="xt-h"><label class="chk"><input type="checkbox" data-m="${m.id}" ${on === all ? 'checked' : ''}><i class="${on && on < all ? 'part' : ''}"></i></label>${sq(m.id)}<button type="button" class="xt-n" data-o="${m.id}"><b>${m.n} · ${esc(m.s)}</b><span>${on} из ${all}</span></button><button type="button" class="xt-a" data-o="${m.id}" aria-label="Раскрыть">▾</button></div>
        <div class="xt-s">${m.slides.map(n => `<label class="chk xs"><input type="checkbox" data-n="${n}" ${XP.sel.has(n) ? 'checked' : ''}><i></i><span><em>${pad3(n)}</em>${esc(S(n).t)}</span></label>`).join('')}</div></div>`; }).join('');
    const n = XP.sel.size, est = XP.fmt === 'pptx' ? `≈ ${n + 3 + new Set([...XP.sel].map(x => MOD_OF[x])).size} слайдов` : XP.fmt === 'pdf' ? `≈ ${Math.max(2, Math.round(n / (XP.mode === 'brief' ? 3.2 : 1.8)) + 2)} стр. A4` : `≈ ${Math.max(2, Math.round(n / (XP.mode === 'brief' ? 3 : 1.7)) + 2)} стр.`;
    $('#xpSum').innerHTML = `<b>${n}</b> пунктов выбрано · ${est}`; $('#xpGo').disabled = !n;
    $('#xpHint').textContent = XP.mode === 'brief' ? 'Кратко: первые пункты каждого слайда, таблицы до 7 строк, без примечаний.' : 'Полностью: весь текст слайдов, все строки таблиц и примечания.';
  };
  tree.addEventListener('change', e => { const t = e.target; if (t.dataset.m) { const m = DATA.modules.find(x => x.id === t.dataset.m); m.slides.forEach(n => t.checked ? XP.sel.add(n) : XP.sel.delete(n)); } if (t.dataset.n) t.checked ? XP.sel.add(+t.dataset.n) : XP.sel.delete(+t.dataset.n); $$('#xpPre button').forEach(b => b.classList.remove('on')); draw(); });
  tree.addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) { XP.open[b.dataset.o] = !XP.open[b.dataset.o]; draw(); } });
  $('#xpPre').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const p = b.dataset.p; XP.sel = new Set(p === '*' ? DATA.modules.flatMap(m => m.slides) : p === '-' ? [] : XP_PRESETS[p]); $$('#xpPre button').forEach(x => x.classList.toggle('on', x === b && p !== '-')); if (XP_PRESETS[p]) $('#xpTitle').value = p === 'Кратко для руководства' ? 'Справка по проекту Каламкас-море – Хазар' : `Каламкас-море – Хазар: ${p.toLowerCase()}`; draw(); });
  $('#xpFmt').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; XP.fmt = b.dataset.f; $$('#xpFmt button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#xpMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; XP.mode = b.dataset.m; $$('#xpMode button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  const close = () => $('#xp').classList.remove('on');
  $('#xpX').addEventListener('click', close); $('#xp').addEventListener('click', e => { if (e.target.id === 'xp') close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('#exportBtn').addEventListener('click', () => {
    if (!XP.sel.size) { const m = DATA.modules.find(x => x.id === ROUTE.page); XP.sel = new Set(m ? m.slides : XP_PRESETS['Кратко для руководства']); if (m) XP.open[m.id] = true; $('#xpTitle').value = m ? `Каламкас-море – Хазар: ${m.s.toLowerCase()}` : 'Справка по проекту Каламкас-море – Хазар'; }
    draw(); $('#xp').classList.add('on');
  });
  $('#xpGo').addEventListener('click', async () => {
    const go = $('#xpGo'), st = $('#xpSt'); go.disabled = true; $('#xpGoT').textContent = 'Собираю…'; st.textContent = '';
    try { const M = xpModel(); if (XP.fmt === 'pdf') { await xpPDF(M); st.textContent = 'Открылось окно печати: выберите «Сохранить как PDF».'; } else if (XP.fmt === 'pptx') { await xpPPTX(M); st.textContent = 'Презентация скачана.'; } else { await xpDOCX(M); st.textContent = 'Документ скачан.'; } }
    catch (e) { console.error(e); st.textContent = 'Не получилось собрать файл: ' + (e.message || e); }
    go.disabled = false; $('#xpGoT').textContent = 'Сформировать';
  });
}
