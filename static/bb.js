/* Bốp Bốp – phần dùng chung cho App người tập và Web theo dõi */
'use strict';
const BB = window.BB = {};

/* ---------------------------------------------------------------- DOM và gọi máy chủ */
BB.$ = id => document.getElementById(id);
/* h('div.cls#id', {attr}, ...con) – dựng DOM, không dùng innerHTML để tránh chèn mã */
BB.h = function (sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i) || [];
  const e = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') e.classList.add(v); else e.id = v; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') { for (const s in v) { if (s.startsWith('--')) e.style.setProperty(s, v[s]); else e.style[s] = v[s]; } }
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return e;
};
/* Bản chạy trong trình duyệt (local-api.js): bật khi trang nằm trên GitHub Pages, mở thẳng từ tệp,
   có ?local=1, hoặc khi phát hiện không có server.py phía sau. */
BB.LOCAL = (function () {
  if (!window.BBLocal) return false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('local')) localStorage.setItem('bb.local.mode', q.get('local') === '0' ? '0' : '1');
    const m = localStorage.getItem('bb.local.mode');
    if (m) return m === '1';
  } catch (e) { /* bỏ qua */ }
  return /\.github\.io$/i.test(location.hostname) || location.protocol === 'file:';
})();
BB.LOCAL_NOTE = 'Bản chạy ngay trên trình duyệt: tài khoản và dữ liệu chỉ lưu trong trình duyệt này. Mở App và Web theo dõi ở hai tab của cùng trình duyệt để thấy thông báo đến ngay.';
async function localApi(path, body) {
  try { return await window.BBLocal.handle(path, body); }
  catch (e) { const err = new Error(e.message || 'Lỗi'); err.status = e.status || 500; throw err; }
}
BB.api = async function (path, body) {
  if (BB.LOCAL) return localApi(path, body);
  const opt = { method: body ? 'POST' : 'GET', headers: { 'X-BB': '1' }, credentials: 'same-origin' };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(path, opt); } catch (e) { const err = new Error('Không kết nối được máy chủ Bốp Bốp.'); err.status = 0; throw err; }
  let j = null; try { j = await r.json(); } catch (e) { /* không phải JSON */ }
  /* trang tĩnh không có server.py: chuyển sang bản chạy trong trình duyệt */
  if (!j && window.BBLocal && [404, 405, 501].indexOf(r.status) >= 0) { BB.LOCAL = true; return localApi(path, body); }
  if (!r.ok) { const err = new Error((j && j.error) || ('Lỗi ' + r.status)); err.status = r.status; throw err; }
  return j;
};
BB.fmt = (v, d) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d || 0).replace('.', ',');
BB.pct = v => (v == null || isNaN(v)) ? '—' : Math.round(v * 100) + '%';
BB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
BB.p2 = n => (n < 10 ? '0' : '') + n;
BB.date = ts => { const d = new Date(ts * 1000); return BB.p2(d.getDate()) + '/' + BB.p2(d.getMonth() + 1) + '/' + d.getFullYear(); };
BB.time = ts => { const d = new Date(ts * 1000); return BB.p2(d.getHours()) + ':' + BB.p2(d.getMinutes()); };
BB.when = ts => {
  const d = new Date(ts * 1000), n = new Date(), s = (Date.now() / 1000) - ts;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return Math.floor(s / 60) + ' phút trước';
  if (d.toDateString() === n.toDateString()) return 'hôm nay ' + BB.time(ts);
  return BB.time(ts) + ' · ' + BB.date(ts);
};
BB.toast = function (msg, kind) {
  let box = BB.$('bbToasts'); if (!box) { box = BB.h('div#bbToasts.toasts', { 'aria-live': 'polite' }); document.body.append(box); }
  const t = BB.h('div.toast' + (kind ? '.' + kind : ''), msg); box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'bad' ? 6000 : 3800);
};
/* luồng thông báo trực tiếp từ máy chủ */
BB.listen = function (onEvent) {
  if (BB.LOCAL) return window.BBLocal.listen(onEvent);
  let es = null;
  const open = () => {
    es = new EventSource('/api/stream');
    es.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch (err) { /* bỏ qua */ } };
  };
  open();
  return () => { if (es) es.close(); };
};

/* ---------------------------------------------------------------- 9 bài, 3 mức (đúng bảng trong hồ sơ) */
/* kind: rise (đưa tới góc/tầm/độ mở), force (dùng lực tới đích, giữ), track (giữ lực trong vùng – Chim bay),
   rhythm (kẹp theo nhịp – Hái táo), pick (nhặt đồ bỏ giỏ – Đi chợ), react (thả/mở khi có tín hiệu), steer (xoay núm – Lái xe) */
const CAM = 'Đặt điện thoại lên đế, camera nhìn xuống thảm';
BB.EXS = {
  1: { name: 'Nâng tay', area: 'Vai', measure: 'Góc nâng tay', unit: '°', metric: 'raise', levels: 'ABC',
    what: 'Nâng cả cánh tay lên phía trước rồi hạ xuống.',
    L: { A: { label: 'Tay lành đỡ', kind: 'rise', target: 75, cap: 'raise', viz: 'arm', core: 'Đeo lõi ở cổ tay', assist: true },
         B: { label: 'Tự nâng', kind: 'rise', target: 90, cap: 'raise', viz: 'arm', core: 'Đeo lõi ở cổ tay' },
         C: { label: 'Tự nâng, giữ 3 giây', kind: 'rise', target: 90, hold: 3, cap: 'raise', viz: 'arm', core: 'Đeo lõi ở cổ tay' } } },
  2: { name: 'Trượt tay trên bàn', area: 'Vai, khuỷu', measure: 'Tầm với', unit: 'cm', levels: 'ABC',
    what: 'Trượt bàn tay trên thảm ra xa tới vạch rồi kéo về.',
    L: { A: { label: 'Tay lành đẩy', kind: 'rise', target: 15, cap: 'reach', viz: 'slide', core: CAM, assist: true },
         B: { label: 'Tự trượt', kind: 'rise', target: 20, cap: 'reach', viz: 'slide', core: CAM },
         C: { label: 'Đẩy tay kéo đẩy', kind: 'force', dir: 'push', target: 3, hold: 2, cap: 'push', viz: 'push', measure: 'Lực đẩy', unit: 'kg', core: 'Gắn lõi vào tay kéo đẩy', force: true } } },
  3: { name: 'Co duỗi khuỷu', area: 'Khuỷu', measure: 'Góc khuỷu', unit: '°', levels: 'ABC',
    what: 'Gập khuỷu đưa bàn tay về phía vai rồi duỗi ra.',
    L: { A: { label: 'Tay lành đỡ', kind: 'rise', target: 90, cap: 'elbow', viz: 'elbow', core: 'Đeo lõi ở cổ tay', assist: true },
         B: { label: 'Tự làm', kind: 'rise', target: 110, cap: 'elbow', viz: 'elbow', core: 'Đeo lõi ở cổ tay' },
         C: { label: 'Kéo co', game: 'Kéo co', kind: 'force', dir: 'pull', target: 3, hold: 2, cap: 'pull', viz: 'tug', measure: 'Lực kéo', unit: 'kg', core: 'Gắn lõi vào tay kéo đẩy', force: true } } },
  4: { name: 'Mở và nắm bàn tay', area: 'Bàn tay', measure: 'Độ mở bàn tay', unit: '%', metric: 'open', levels: 'ABC',
    what: 'Mở rộng bàn tay rồi nắm lại.',
    L: { A: { label: 'Tay lành giúp mở', kind: 'rise', target: 60, cap: 'open', viz: 'hand', core: CAM, assist: true },
         B: { label: 'Mở nắm tay', game: 'Mở nắm tay', kind: 'rise', target: 70, cap: 'open', viz: 'flower', core: CAM },
         C: { label: 'Mở nhanh theo tín hiệu', kind: 'react', react: 'open', good: 1.0, viz: 'hand', measure: 'Thời gian mở', unit: 's', core: CAM } } },
  5: { name: 'Bóp bóng', area: 'Bàn tay', measure: 'Lực bóp', unit: 'kg', metric: 'grip', levels: 'ABC',
    what: 'Bóp trứng bằng cả bàn tay.',
    L: { A: { label: 'Bóp nhẹ, xem có lực chưa', kind: 'force', zone: 'grip', pct: 0, target: 1, hold: 0.5, cap: 'grip', viz: 'egg', core: 'Gắn lõi vào trứng bóp', force: true },
         B: { label: 'Giữ 3–5 giây rồi thả', kind: 'force', zone: 'grip', pct: 0.3, hold: 3, release: true, cap: 'grip', viz: 'egg', core: 'Gắn lõi vào trứng bóp', force: true },
         C: { label: 'Chim bay', game: 'Chim bay', kind: 'track', zone: 'grip', band: [0.3, 0.5], cap: 'grip', viz: 'bird', core: 'Gắn lõi vào trứng bóp', force: true, measure: 'Thời gian trong vùng', unit: '%' } } },
  6: { name: 'Kẹp và thả vật', area: 'Ngón tay', measure: 'Lực kẹp', unit: 'kg', metric: 'pinch', levels: 'ABC',
    what: 'Kẹp bằng ngón cái và ngón trỏ.',
    L: { A: { label: 'Kẹp dụng cụ, chưa di chuyển', kind: 'force', zone: 'pinch', pct: 0.3, hold: 2, cap: 'pinch', viz: 'pinch', core: 'Gắn lõi vào kẹp ngón', force: true },
         B: { label: 'Hái táo (kẹp theo nhịp)', game: 'Hái táo', kind: 'rhythm', zone: 'pinch', pct: 0.4, beat: 2.2, cap: 'pinch', viz: 'apples', core: 'Gắn lõi vào kẹp ngón', force: true },
         C: { label: 'Đi chợ (nhặt đồ trên thảm bỏ vào giỏ)', game: 'Đi chợ', kind: 'pick', viz: 'market', core: CAM, measure: 'Số vật', unit: 'vật' } } },
  7: { name: 'Duỗi cổ tay', area: 'Cổ tay', measure: 'Góc duỗi cổ tay', unit: '°', metric: 'wrist', levels: 'ABC',
    what: 'Cẳng tay đặt trên thảm, nâng bàn tay lên rồi hạ xuống.',
    L: { A: { label: 'Tay lành đỡ bên dưới', kind: 'rise', target: 30, cap: 'wrist', viz: 'wrist', core: 'Đeo lõi ở mu bàn tay', assist: true },
         B: { label: 'Tự duỗi', kind: 'rise', target: 40, cap: 'wrist', viz: 'wrist', core: 'Đeo lõi ở mu bàn tay' },
         C: { label: 'Cầm chai nước nhỏ', kind: 'rise', target: 35, hold: 2, load: true, cap: 'wrist', viz: 'wrist', core: 'Đeo lõi ở mu bàn tay' } } },
  8: { name: 'Xoay cẳng tay', area: 'Cẳng tay', measure: 'Góc sấp, ngửa', unit: '°', metric: 'rot', levels: 'BC',
    what: 'Nắm núm và xoay cẳng tay: sang phải là ngửa, sang trái là sấp.',
    L: { B: { label: 'Lái xe (xoay núm tới góc mục tiêu)', game: 'Lái xe', kind: 'steer', target: 45, hold: 1, cap: 'rot', viz: 'car', core: 'Gắn lõi vào núm vặn' },
         C: { label: 'Xoay nhanh đủ hai chiều', kind: 'steer', target: 40, hold: 0, cap: 'rot', viz: 'car', core: 'Gắn lõi vào núm vặn', fast: true } } },
  9: { name: 'Thả lực nhanh', area: 'Bàn tay', measure: 'Thời gian thả', unit: 's', metric: 'release', levels: 'BC',
    what: 'Bóp trứng và giữ; khi có tín hiệu thì nhả thật nhanh.',
    L: { B: { label: 'Bóp rồi thả khi có tín hiệu', kind: 'react', react: 'release', zone: 'grip', pct: 0.2, good: 0.8, viz: 'egg', core: 'Gắn lõi vào trứng bóp', force: true },
         C: { label: 'Thả trong trò chơi', game: 'Thả đúng lúc', kind: 'react', react: 'release', zone: 'grip', pct: 0.2, good: 0.6, decoy: true, viz: 'lights', core: 'Gắn lõi vào trứng bóp', force: true } } }
};
BB.ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/* ---------------------------------------------------------------- 2 chương trình */
BB.PROGRAMS = {
  dotquy: { name: 'Đột quỵ', short: 'Đột quỵ', base: [1, 2, 3, 4, 5, 6, 7, 8, 9], force: [], focus: [4, 5, 6, 9],
    note: 'Tập đủ 9 bài, nhấn mạnh bài 4, 5, 6, 9.',
    safetyQ: 'Hôm nay tay có yếu đi đột ngột, méo miệng hoặc nói khó không?' },
  chanthuong: { name: 'Chấn thương (sau tháo bột)', short: 'Chấn thương', base: [4, 7, 8], force: [3, 5, 6], focus: [],
    note: 'Sau tháo bột chỉ tập bài 4, 7, 8. Khi bác sĩ cho phép tập lực thì thêm bài 3, 5, 6.',
    safetyQ: 'Tay có sưng, đau tăng hoặc tê không?' }
};
/* danh sách bài của hôm nay kèm trạng thái khoá */
BB.planFor = function (p) {
  const prog = BB.PROGRAMS[p.program], out = [];
  BB.ORDER.forEach(ex => {
    if (prog.base.indexOf(ex) >= 0) out.push({ ex: ex, level: p.levels[ex] || BB.EXS[ex].levels[0], locked: false, focus: prog.focus.indexOf(ex) >= 0 });
    else if (prog.force.indexOf(ex) >= 0) out.push({ ex: ex, level: p.levels[ex] || BB.EXS[ex].levels[0], locked: !p.force_allowed, lockReason: 'Chờ bác sĩ cho phép tập lực', focus: false });
  });
  return out;
};

/* ---------------------------------------------------------------- mô phỏng tay (thay cho cảm biến trong bản thử) */
BB.SIM = {
  healthy:    { raise: 165, reach: 30, elbow: 140, open: 100, wrist: 70, rot: 85, grip: 30, pinch: 7, push: 14, pull: 14, lag: 0.05 },
  dotquy:     { raise: 110, reach: 22, elbow: 115, open: 75, wrist: 45, rot: 55, grip: 11, pinch: 3, push: 7, pull: 7, lag: 0.35 },
  chanthuong: { raise: 150, reach: 26, elbow: 125, open: 82, wrist: 48, rot: 52, grip: 14, pinch: 4, push: 9, pull: 9, lag: 0.15 }
};

/* lực tối đa tay yếu của lần kiểm tra tuần gần nhất (mặc định khi chưa kiểm tra) */
BB.weakMax = function (p, key) {
  const t = p.latest_test && p.latest_test.data && p.latest_test.data.metrics;
  if (t && t[key] && t[key].weak > 0) return t[key].weak;
  return key === 'grip' ? 10 : 3;
};

/* cấu hình chạy một bài cho người tập p */
BB.exConfig = function (p, ex, level) {
  const E = BB.EXS[ex], L = E.L[level], demo = !!p.demo_mode, sim = BB.SIM[p.program];
  const c = Object.assign({ ex: ex, level: level, name: E.name, measure: E.measure, unit: E.unit, mode: 'session' }, L);
  c.reps = demo ? 3 : 10; c.sets = 2; c.rest = demo ? 5 : 30;
  c.cap = (L.cap && sim[L.cap]) || 10;
  if (L.assist) c.cap *= 1.3;            /* mức A: tay lành hỗ trợ, nên tầm vận động lớn hơn */
  if (L.load) c.cap *= 0.9;
  c.lag = sim.lag;
  if (L.kind === 'track') c.dur = demo ? 10 : 20;
  if (L.kind === 'rhythm') c.reps = demo ? 4 : 10;
  if (L.kind === 'pick') c.reps = demo ? 3 : 6;
  if (L.zone) {                          /* vùng lực = 30–50% lực tối đa tuần gần nhất */
    const mx = BB.weakMax(p, L.zone);
    if (L.kind === 'track') c.band = [Math.max(1, +(mx * L.band[0]).toFixed(1)), Math.max(1.6, +(mx * L.band[1]).toFixed(1))];
    else if (L.pct) c.target = Math.max(L.zone === 'pinch' ? 0.6 : 1.2, +(mx * L.pct).toFixed(1));
    c.zoneMax = mx;
  }
  if (p.program === 'chanthuong' && L.force) {   /* giới hạn lực tối đa theo tuần */
    c.forceLimit = p.force_limit;
    if (c.target) c.target = Math.min(c.target, +(p.force_limit * 0.8).toFixed(1));
    if (c.band) c.band = [Math.min(c.band[0], p.force_limit * 0.6), Math.min(c.band[1], p.force_limit * 0.9)];
  }
  if (p.program === 'dotquy' && ex === 1 && !p.shoulder_unlocked) c.warnAbove = 95;   /* ngang vai, cho phép lệch 5° */
  return c;
};
BB.doseText = function (c) {
  if (c.kind === 'track') return c.sets + ' hiệp × ' + c.dur + ' giây · giữ lực ' + BB.fmt(c.band[0], 1) + '–' + BB.fmt(c.band[1], 1) + ' kg';
  if (c.kind === 'rhythm') return c.sets + ' hiệp × ' + c.reps + ' nhịp · kẹp tới ' + BB.fmt(c.target, 1) + ' kg';
  if (c.kind === 'pick') return c.sets + ' hiệp × ' + c.reps + ' món';
  if (c.kind === 'react') return c.sets + ' hiệp × ' + c.reps + ' lượt · phản ứng dưới ' + BB.fmt(c.good, 1) + ' s';
  if (c.kind === 'steer') return c.sets + ' hiệp × ' + c.reps + ' lần · xoay tới ±' + c.target + '°' + (c.hold ? ' · giữ ' + c.hold + ' s' : '');
  const u = c.unit === 'kg' ? ' kg' : c.unit === 'cm' ? ' cm' : c.unit;
  return c.sets + ' hiệp × ' + c.reps + ' lần · đích ' + BB.fmt(c.target, c.target % 1 ? 1 : 0) + u + (c.hold ? ' · giữ ' + BB.fmt(c.hold, c.hold % 1 ? 1 : 0) + ' s' : '');
};

/* ---------------------------------------------------------------- kiểm tra tuần */
BB.TEST = [
  { key: 'grip', name: 'Lực nắm', unit: 'kg', kind: 'force', trials: 3, cap: 'grip', viz: 'egg', core: 'Gắn lõi vào trứng bóp', how: 'Bóp hết sức rồi thả, 3 lần.' },
  { key: 'pinch', name: 'Lực kẹp', unit: 'kg', kind: 'force', trials: 3, cap: 'pinch', viz: 'pinch', core: 'Gắn lõi vào kẹp ngón', how: 'Kẹp hết sức rồi thả, 3 lần.' },
  { key: 'raise', name: 'Góc nâng tay', unit: '°', kind: 'rise', cap: 'raise', viz: 'arm', core: 'Đeo lõi ở cổ tay', how: 'Nâng tay cao nhất có thể rồi bấm Ghi.' },
  { key: 'wrist', name: 'Góc duỗi cổ tay', unit: '°', kind: 'rise', cap: 'wrist', viz: 'wrist', core: 'Đeo lõi ở mu bàn tay', how: 'Duỗi cổ tay hết mức rồi bấm Ghi.' },
  { key: 'pron', name: 'Góc sấp', unit: '°', kind: 'rise', cap: 'rot', viz: 'knob', core: 'Gắn lõi vào núm vặn', how: 'Xoay núm sang trái (sấp) hết mức rồi bấm Ghi.' },
  { key: 'sup', name: 'Góc ngửa', unit: '°', kind: 'rise', cap: 'rot', viz: 'knob', core: 'Gắn lõi vào núm vặn', how: 'Xoay núm sang phải (ngửa) hết mức rồi bấm Ghi.' },
  { key: 'open', name: 'Độ mở bàn tay', unit: '%', kind: 'rise', cap: 'open', viz: 'hand', core: CAM, how: 'Mở bàn tay rộng nhất rồi bấm Ghi.' },
  { key: 'release', name: 'Thời gian thả lực', unit: 's', kind: 'react', trials: 3, lower: true, viz: 'egg', core: 'Gắn lõi vào trứng bóp', how: 'Bóp và giữ; thấy chữ THẢ thì nhả ngay. 3 lượt.' },
  { key: 'pick60', name: 'Số vật chuyển trong 60 giây', unit: 'vật', kind: 'pick', viz: 'market', core: CAM, how: 'Chuyển càng nhiều đồ vào giỏ càng tốt trong 60 giây.' }
];
BB.TEST_EXTRA = { grip_sd: { name: 'Độ dao động lực khi giữ', unit: 'kg', lower: true } };
BB.testName = k => (BB.TEST.find(t => t.key === k) || BB.TEST_EXTRA[k] || { name: k }).name;
BB.testUnit = k => (BB.TEST.find(t => t.key === k) || BB.TEST_EXTRA[k] || { unit: '' }).unit;
BB.isLower = k => k === 'release' || k === 'grip_sd';
/* % so với tay lành; với số càng nhỏ càng tốt thì lấy tay lành ÷ tay yếu */
BB.vsPct = (k, healthy, weak) => {
  if (!(healthy > 0) || !(weak > 0)) return null;
  return BB.isLower(k) ? healthy / weak : weak / healthy;
};

/* % so với tay lành cho kết quả một bài, dựa trên kiểm tra tuần gần nhất */
BB.vsHealthy = function (r, test) {
  const m = test && test.metrics; if (!m) return null;
  const meas = k => { const x = (r.measures || []).find(q => q.key === k); return x ? x.value : null; };
  const L = BB.EXS[r.ex].L[r.level], k = L && L.kind;
  if (r.ex === 1 && m.raise) return BB.vsPct('raise', m.raise.healthy, meas('peak'));
  if (r.ex === 4 && k === 'rise' && m.open) return BB.vsPct('open', m.open.healthy, meas('peak'));
  if (r.ex === 5 && m.grip) return BB.vsPct('grip', m.grip.healthy, meas('force'));
  if (r.ex === 6 && k !== 'pick' && m.pinch) return BB.vsPct('pinch', m.pinch.healthy, meas('force'));
  if (r.ex === 7 && m.wrist) return BB.vsPct('wrist', m.wrist.healthy, meas('peak'));
  if (r.ex === 8 && m.pron && m.sup) { const a = BB.vsPct('pron', m.pron.healthy, meas('neg')), b = BB.vsPct('sup', m.sup.healthy, meas('pos')); return a && b ? (a + b) / 2 : (a || b); }
  if (r.ex === 9 && m.release) return BB.vsPct('release', m.release.healthy, meas('time'));
  return null;
};

BB.ROLE = { chuyenvien: 'Chuyên viên', nguoinha: 'Người nhà' };
BB.SEV = { high: 'Khẩn', medium: 'Cần xem', low: 'Thông tin' };
BB.logo = function (size) {
  const s = size || 36, NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('aria-hidden', 'true');
  const add = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
  add('path', { d: 'M32 6c14 0 24 10 24 25 0 15-11 27-24 27S8 46 8 31C8 16 18 6 32 6z', fill: '#FF6A1A' });
  add('path', { d: 'M20 21c3-5 8-7 13-7', stroke: '#FFD2B8', 'stroke-width': '4', 'stroke-linecap': 'round', fill: 'none' });
  add('circle', { cx: '24', cy: '34', r: '3.2', fill: '#231A14' }); add('circle', { cx: '40', cy: '34', r: '3.2', fill: '#231A14' });
  add('path', { d: 'M26 43c3 3 9 3 12 0', stroke: '#231A14', 'stroke-width': '3', 'stroke-linecap': 'round', fill: 'none' });
  return svg;
};
