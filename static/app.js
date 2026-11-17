/* Bốp Bốp – App người tập */
'use strict';
(function () {
const { h, api, $ } = BB;
const view = $('view'), nav = $('nav');
const st = { me: null, patients: [], p: null, trainings: [], msgs: [], tab: 'home', busy: false, stopListen: null };
let cur = null;           /* bài đang chạy: { eng, raf, ... } */
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } } };

function show(...nodes) { stopPlay(); view.textContent = ''; nodes.flat().forEach(n => n && view.append(n)); window.scrollTo(0, 0); }
function err(e) { BB.toast(e.message || String(e), 'bad'); }
const call = () => st.p ? st.p.call_name : '';
const lo = s => s.charAt(0).toLowerCase() + s.slice(1);

/* ---------------------------------------------------------------- khởi động, đăng nhập */
async function boot() {
  try { st.me = await api('/api/me'); }
  catch (e) { if (e.status === 401) return renderAuth(); return show(h('div.card', h('h2', 'Không kết nối được'), h('p.mute', e.message), h('button.btn', { onclick: boot }, 'Thử lại'))); }
  if (!st.stopListen) st.stopListen = BB.listen(onEvent);
  await loadPatients();
}
function renderAuth(mode) {
  mode = mode || 'login';
  nav.hidden = true;
  const u = h('input.inp', { autocomplete: 'username', required: true }), pw = h('input.inp', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true }),
        nm = h('input.inp', { autocomplete: 'name' });
  const msg = h('p.notice.bad', { hidden: true });
  const form = h('form.col', { onsubmit: async e => {
    e.preventDefault(); msg.hidden = true;
    try { st.me = await api(mode === 'login' ? '/api/login' : '/api/register', { username: u.value, password: pw.value, name: nm.value || u.value }); boot(); }
    catch (x) { msg.textContent = x.message; msg.hidden = false; }
  } },
    mode === 'register' ? h('label.f', 'Tên hiển thị (ví dụ: Gia đình Minh)', nm) : null,
    h('label.f', 'Tên đăng nhập', u), h('label.f', 'Mật khẩu (ít nhất 6 ký tự)', pw), msg,
    h('button.btn.big.block', { type: 'submit' }, mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'));
  show(h('div.auth.col',
    h('div.row', BB.logo(48), h('div', h('div.brand', 'Bốp Bốp'), h('div.mute', 'App người tập'))),
    h('div.card.col', h('h2', mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'), form,
      h('button.linkbtn', { onclick: () => renderAuth(mode === 'login' ? 'register' : 'login') }, mode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập')),
    BB.LOCAL ? h('p.notice', BB.LOCAL_NOTE) : null,
    h('p.small.mute.center', 'Bản thử nghiệm: dùng bàn phím hoặc chạm thay cho cảm biến, mọi số đo là mô phỏng.')));
  u.focus();
}
async function loadPatients() {
  st.patients = await api('/api/patients');
  const saved = +store.get('bb.app.p');
  const p = st.patients.find(x => x.id === saved) || (st.patients.length === 1 ? st.patients[0] : null);
  if (!p) return renderPick();
  await openPatient(p.id);
}
async function openPatient(id) {
  st.p = await api('/api/patients/' + id); store.set('bb.app.p', id);
  await Promise.all([loadTrainings(), loadMsgs()]);
  go('home');
}
async function loadTrainings() { st.trainings = await api('/api/patients/' + st.p.id + '/trainings'); }
async function loadMsgs() { st.msgs = await api('/api/patients/' + st.p.id + '/messages'); }
async function logout() { try { await api('/api/logout', {}); } catch (e) { /* bỏ qua */ } st.me = null; st.p = null; if (st.stopListen) { st.stopListen(); st.stopListen = null; } renderAuth(); }

function renderPick() {
  nav.hidden = true;
  const list = h('div.col', st.patients.map(p => h('button.exitem', { onclick: () => openPatient(p.id) },
    h('span.lv', p.call_name.charAt(0)), h('div.grow', h('div.nm', p.call_name + ' ' + p.name), h('div.sub', BB.PROGRAMS[p.program].short + ' · ' + BB.ROLE[p.role])))));
  const name = h('input.inp', { placeholder: 'Ví dụ: Nguyễn Văn Minh' }), age = h('input.inp', { type: 'number', min: 1, max: 120, value: 62 });
  const callSel = h('select.inp', ['Bố', 'Mẹ', 'Ông', 'Bà', 'Anh', 'Chị', 'Cô', 'Chú'].map(x => h('option', x)));
  const sex = h('select.inp', h('option', { value: 'M' }, 'Nam'), h('option', { value: 'F' }, 'Nữ'));
  const prog = h('select.inp', h('option', { value: 'dotquy' }, 'Đột quỵ'), h('option', { value: 'chanthuong' }, 'Chấn thương (sau tháo bột)'));
  const role = h('select.inp', h('option', { value: 'nguoinha' }, 'Người nhà'), h('option', { value: 'chuyenvien' }, 'Chuyên viên'));
  const code = h('input.inp', { placeholder: 'Mã 6 ký tự', maxlength: 6, style: { textTransform: 'uppercase' } });
  show(h('div.top', h('div.brand', BB.logo(36), 'Bốp Bốp'), h('button.linkbtn', { onclick: logout }, 'Đăng xuất')),
    h('h1', 'Chọn người tập'), h('p.lead', 'Tài khoản ' + st.me.name + ' chỉ thấy những người tập của mình.'),
    st.patients.length ? list : h('p.mute', 'Chưa có người tập nào.'),
    h('div.card.col', { style: { marginTop: '18px' } }, h('h2', 'Thêm người tập'),
      h('label.f', 'Họ tên', name), h('div.row', h('label.f.grow', 'Gia đình gọi là', callSel), h('label.f.grow', 'Giới tính', sex), h('label.f.grow', 'Tuổi', age)),
      h('label.f', 'Chương trình', prog), h('label.f', 'Tôi là', role),
      h('button.btn.block', { onclick: async () => {
        try { const p = await api('/api/patients', { name: name.value, call_name: callSel.value, sex: sex.value, age: +age.value, program: prog.value, my_role: role.value }); await openPatient(p.id); } catch (e) { err(e); }
      } }, 'Thêm và bắt đầu')),
    h('div.card.col', { style: { marginTop: '14px' } }, h('h2', 'Có mã mời?'), h('p.mute', 'Nhập mã người nhà hoặc mã chuyên viên mà người tạo hồ sơ gửi cho bạn.'), code,
      h('button.btn.ghost.block', { onclick: async () => { try { const r = await api('/api/join', { code: code.value }); await openPatient(r.patient_id); } catch (e) { err(e); } } }, 'Vào bằng mã')));
}

/* ---------------------------------------------------------------- điều hướng */
function go(tab) {
  st.tab = tab; nav.hidden = false;
  nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  ({ home: renderHome, test: renderTestIntro, games: renderGames, msgs: renderMsgs })[tab]();
}
nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (!st.busy) go(b.dataset.tab); }));
function topBar() {
  return h('div.top', h('div.brand', BB.logo(34), h('div', 'Bốp Bốp', h('small', call() + ' ' + st.p.name))),
    h('div.row', st.patients.length > 1 ? h('button.linkbtn', { onclick: () => { st.p = null; renderPick(); } }, 'Đổi') : null, h('button.linkbtn', { onclick: logout }, 'Thoát')));
}
async function onEvent(ev) {
  if (!st.p || ev.patient_id !== st.p.id) return;
  if (ev.type === 'patient') {
    const before = JSON.stringify([st.p.levels, st.p.force_allowed, st.p.shoulder_unlocked, st.p.force_limit, st.p.program, st.p.demo_mode]);
    st.p = await api('/api/patients/' + st.p.id);
    const after = JSON.stringify([st.p.levels, st.p.force_allowed, st.p.shoulder_unlocked, st.p.force_limit, st.p.program, st.p.demo_mode]);
    if (before !== after) BB.toast(st.busy ? 'Chuyên viên vừa cập nhật lịch tập; áp dụng từ buổi sau.' : 'Chuyên viên vừa cập nhật lịch tập.', 'bopt');
    if (!st.busy && st.tab === 'home') renderHome();
  } else if (ev.type === 'message') {
    await loadMsgs(); if (!st.busy && st.tab === 'msgs') renderMsgs(); else if (!st.busy) BB.toast('Có lời nhắn mới cho ' + lo(call()) + '.', 'bopt');
  }
}

/* ---------------------------------------------------------------- trang chính: buổi tập hôm nay */
function todayDone() { const d = new Date().toDateString(); return st.trainings.find(t => new Date(t.created * 1000).toDateString() === d && t.status !== 'blocked'); }
function renderHome() {
  const p = st.p, prog = BB.PROGRAMS[p.program], plan = BB.planFor(p), active = plan.filter(x => !x.locked), td = todayDone();
  const mins = Math.round(active.length * (p.demo_mode ? 1.2 : 3.5));
  const now = new Date(), monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((n, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const done = st.trainings.some(t => t.status !== 'blocked' && new Date(t.created * 1000).toDateString() === d.toDateString());
    return h('div' + (done ? '.done' : '') + (d.toDateString() === now.toDateString() ? '.today' : ''), n, h('b', done ? '✓' : d.getDate()));
  });
  const doneThisWeek = week.filter(x => x.classList.contains('done')).length;
  const lastTest = p.latest_test, testDue = !lastTest || (Date.now() / 1000 - lastTest.created) > 6.5 * 86400;
  const latest = st.msgs.filter(m => m.kind !== 'auto').slice(0, 2);
  show(topBar(),
    h('h1', 'Chào ' + call() + '!'),
    h('p.lead', { style: { margin: '4px 0 16px' } }, 'Chương trình ' + lo(prog.name) + '. ' + prog.note),
    h('div.hero-card.col',
      h('div.row.space', h('h2', 'Buổi tập hôm nay'), h('span.tag', { style: { background: 'rgba(255,255,255,.55)', color: 'var(--ink)' } }, active.length + ' bài · ~' + mins + ' phút')),
      td ? h('p', { style: { fontWeight: 700 } }, '✓ Đã tập lúc ' + BB.time(td.created) + ', hoàn thành ' + BB.pct(td.avg_completion) + '.') : h('p', 'Hỏi nhanh 3 câu, rồi tập từng bài theo hướng dẫn.'),
      h('button.btn.dark.big.block', { onclick: startSession, disabled: !active.length }, td ? 'Tập thêm một buổi' : 'Bắt đầu buổi tập')),
    p.demo_mode ? h('p.small.mute', { style: { marginTop: '8px' } }, 'Đang bật chế độ trình diễn: mỗi bài 2 hiệp × 3 lần, nghỉ 5 giây. Liều thật: 2 hiệp × 10 lần.') : null,
    h('div.row.space', { style: { margin: '20px 0 8px' } }, h('h2', 'Tuần này'), h('span.mute', doneThisWeek + '/5 buổi')),
    h('div.week', week),
    testDue ? h('div.card.tint.row', { style: { marginTop: '14px' } }, h('div.grow', h('b', 'Đến lúc kiểm tra tuần'), h('div.small.mute', 'Đo cả hai tay để biết tay yếu bằng bao nhiêu % tay lành.')), h('button.btn.sm', { onclick: () => go('test') }, 'Đo ngay')) : null,
    h('h2', { style: { margin: '20px 0 8px' } }, 'Các bài trong buổi'),
    h('div.exlist', plan.map((x, i) => {
      const E = BB.EXS[x.ex], L = E.L[x.level];
      return h('div.exitem' + (x.locked ? '.locked' : ''),
        h('span.lv', x.level), h('div.grow', h('div.nm', x.ex + '. ' + E.name + (L.game ? ' · ' + L.game : '')),
          h('div.sub', L.label + ' · ' + L.core)),
        x.locked ? h('span.tag.gray', '🔒 ' + x.lockReason) : x.focus ? h('span.tag', 'Trọng tâm') : null);
    })),
    latest.length ? h('h2', { style: { margin: '20px 0 8px' } }, 'Lời nhắn mới') : null,
    latest.map(m => msgCard(m)));
}

/* ---------------------------------------------------------------- buổi tập */
let SES = null;
function newSes() { return { pre: {}, post: {}, results: [], status: 'done', stop_reason: null, plan: [], i: 0, alerts: {} }; }
async function sendAlert(type, message) {
  try { await api('/api/patients/' + st.p.id + '/alerts', { type: type, message: message }); } catch (e) { err(e); }
}
function painSeg(onPick, val) {
  const box = h('div.seg.pain');
  for (let i = 0; i <= 10; i++) box.append(h('button', { type: 'button', 'data-v': i, 'aria-pressed': val === i ? 'true' : 'false', onclick: () => { box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); box.children[i].setAttribute('aria-pressed', 'true'); onPick(i); } }, i));
  return box;
}
function ynBtns(onPick) {
  const b = h('div.yn'); const mk = (v, t) => h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { b.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.children[v ? 0 : 1].setAttribute('aria-pressed', 'true'); onPick(v); } }, t);
  b.append(mk(true, 'Có'), mk(false, 'Không')); return b;
}
function startSession() {
  SES = newSes(); st.busy = true; nav.hidden = true;
  const prog = BB.PROGRAMS[st.p.program], a = SES.pre;
  const next = h('button.btn.big.block', { disabled: true, onclick: afterPre }, 'Tiếp tục');
  const check = () => { next.disabled = !(a.pain != null && a.fatigue != null && a.safe != null); };
  show(h('div.top', h('button.linkbtn', { onclick: cancelSession }, '← Thôi, để sau'), h('span.tag', 'Trước khi tập')),
    h('h1', 'Hỏi nhanh trước khi tập'),
    h('div.card', h('div.q', h('div.ql', '1. Lúc nghỉ, tay đau mức nào? (0 là không đau)'), painSeg(v => { a.pain = v; check(); })),
      h('div.q', h('div.ql', '2. Hôm nay thấy mệt mức nào? (0 là khoẻ)'), painSeg(v => { a.fatigue = v; check(); })),
      h('div.q', h('div.ql', '3. ' + prog.safetyQ), ynBtns(v => { a.safe = v; check(); }))),
    h('div', { style: { marginTop: '16px' } }, next));
}
function cancelSession() { st.busy = false; SES = null; go('home'); }
async function saveTraining() {
  const pre = { pain: SES.pre.pain, fatigue: SES.pre.fatigue }; if (st.p.program === 'dotquy') pre.weak_sudden = !!SES.pre.safe; else pre.swelling = !!SES.pre.safe;
  const body = { status: SES.status, stop_reason: SES.stop_reason, pre: pre, post: SES.post, results: SES.results };
  try { const r = await api('/api/patients/' + st.p.id + '/trainings', body); loadTrainings().catch(() => {}); return r; }
  catch (e) { err(e); return null; }
}
async function afterPre() {
  const a = SES.pre, c = call();
  if (st.p.program === 'dotquy' && a.safe) {
    SES.status = 'blocked'; SES.stop_reason = 'báo tay yếu đi đột ngột, méo miệng hoặc nói khó';
    sendAlert('stroke_115', c + ' báo tay yếu đi đột ngột / méo miệng / nói khó trước buổi tập. App đã hiện màn hình gọi cấp cứu 115.');
    saveTraining(); return renderEmergency();
  }
  if (st.p.program === 'chanthuong' && a.safe) {
    SES.status = 'blocked'; SES.stop_reason = 'tay sưng, đau tăng hoặc tê';
    sendAlert('injury_symptom', c + ' báo tay sưng, đau tăng hoặc tê trước buổi tập. App đã nhắc dừng tập và đi khám.');
    saveTraining(); return renderSeeDoctor('trước buổi tập');
  }
  if (a.pain >= 4) {
    SES.status = 'blocked'; SES.stop_reason = 'đau lúc nghỉ ' + a.pain + '/10';
    sendAlert('pain_rest', c + ' đau lúc nghỉ ' + a.pain + '/10 nên không tập hôm nay.');
    saveTraining();
    return show(h('div.col', { style: { paddingTop: '8vh' } }, h('div.center', { style: { fontSize: '64px' } }, '🛑'), h('h1.center', 'Hôm nay không tập'),
      h('p.lead.center', 'Tay đang đau ' + a.pain + '/10 lúc nghỉ (từ 4/10 trở lên thì không tập). Nghỉ ngơi, chườm theo hướng dẫn và báo chuyên viên nếu đau kéo dài.'),
      h('p.notice.center', 'Đã gửi cảnh báo tới Web theo dõi của gia đình và chuyên viên.'),
      h('button.btn.big.block', { onclick: cancelSession }, 'Về trang chính')));
  }
  SES.plan = BB.planFor(st.p).filter(x => !x.locked); SES.i = 0;
  renderIntro();
}
function renderEmergency() {
  st.busy = false; nav.hidden = true;
  const box = h('div.emergency', { role: 'alertdialog', 'aria-labelledby': 'emT' },
    h('h1#emT', 'Gọi cấp cứu 115'), h('div.num', '115'), h('div.words', 'một – một – năm'),
    h('p', { style: { maxWidth: '460px', fontSize: '19px' } }, 'Tay yếu đi đột ngột, méo miệng hoặc nói khó có thể là dấu hiệu đột quỵ. Gọi ngay 115, ghi lại giờ bắt đầu có dấu hiệu, không tự đi lại một mình.'),
    h('a.btn.big', { href: 'tel:115' }, 'Gọi 115'),
    h('button.btn.em-back', { onclick: () => { box.remove(); go('home'); } }, 'Đã gọi / Quay lại'),
    h('p.small', 'Đã gửi cảnh báo khẩn tới gia đình và chuyên viên.'));
  show(); document.body.append(box);
}
function renderSeeDoctor(when) {
  st.busy = false;
  show(h('div.col', { style: { paddingTop: '8vh' } }, h('div.center', { style: { fontSize: '64px' } }, '🩺'), h('h1.center', 'Dừng tập và đi khám'),
    h('p.lead.center', 'Tay sưng, đau tăng hoặc tê ' + when + ' cần bác sĩ xem lại. Hôm nay không tập tiếp.'),
    h('p.notice.center', 'Đã gửi cảnh báo tới Web theo dõi.'),
    h('button.btn.big.block', { onclick: () => go('home') }, 'Về trang chính')));
}
function renderIntro() {
  const it = SES.plan[SES.i], cfg = BB.exConfig(st.p, it.ex, it.level), E = BB.EXS[it.ex], L = E.L[it.level];
  show(h('div.top', h('span.tag', 'Bài ' + (SES.i + 1) + '/' + SES.plan.length), h('button.linkbtn', { onclick: () => { if (confirm('Kết thúc buổi tập bây giờ?')) { SES.status = 'stopped'; SES.stop_reason = 'người tập dừng sớm'; renderPost(); } } }, 'Kết thúc buổi')),
    h('div.card.col',
      h('div.row', h('span.lv', it.level), h('div.grow', h('h1', E.name), h('div.mute', 'Mức ' + it.level + ': ' + L.label))),
      L.game ? h('div', h('span.tag', '🎮 Trò chơi ' + L.game)) : null,
      h('p.lead', E.what),
      h('div.col', { style: { gap: '8px' } },
        h('div.row', h('span.tag.core', 'Lõi'), h('span', L.core)),
        h('div.row', h('span.tag', 'Đo'), h('span', (L.measure || E.measure) + (L.unit || E.unit ? ' (' + (L.unit || E.unit) + ')' : ''))),
        h('div.row', h('span.tag.gray', 'Liều'), h('span', BB.doseText(cfg) + ' · nghỉ ' + cfg.rest + ' s giữa hiệp')),
        cfg.warnAbove ? h('div.notice', 'Chỉ nâng tới ngang vai (90°) cho tới khi chuyên viên mở khoá.') : null,
        cfg.forceLimit ? h('div.notice', 'Giới hạn lực tuần này: ' + BB.fmt(cfg.forceLimit, 1) + ' kg. Vượt quá sẽ có nhắc "bóp nhẹ lại".') : null),
      h('button.btn.big.block', { onclick: () => renderPlay(it, cfg) }, 'Bắt đầu bài này'),
      h('button.linkbtn', { onclick: () => finishExercise(it, cfg, { planned: cfg.reps * cfg.sets, done: 0, measures: [] }, [], true) }, 'Bỏ qua bài này')));
}

/* màn hình tập: canvas + hiệp + nghỉ + nút Xong */
function stopPlay() { if (cur) { cancelAnimationFrame(cur.raf); if (cur.eng) cur.eng.destroy(); clearInterval(cur.restTimer); cur = null; } }
function controlsFor(kind, eng) {
  const holdBtn = (label, key) => {
    const b = h('button.btn.big.hold', { type: 'button' }, label);
    const on = v => { if (!cur || !cur.eng) return; cur.eng.I[key] = v; cur.eng.I.goal = null; b.classList.toggle('on', v); };
    b.addEventListener('pointerdown', e => { try { b.setPointerCapture(e.pointerId); } catch (err) { /* con trỏ giả lập */ } on(true); e.preventDefault(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => b.addEventListener(n, () => on(false)));
    return b;
  };
  if (kind === 'rise') return { btns: [holdBtn('▼ Hạ', 'down'), holdBtn('▲ Nâng', 'up')], keys: 'Bàn phím: ↑ nâng, ↓ hạ, thả phím để giữ. Chạm: kéo lên xuống trên hình.' };
  if (kind === 'steer') return { btns: [holdBtn('◀ Sấp', 'left'), holdBtn('Ngửa ▶', 'right')], keys: 'Bàn phím: ← sấp, → ngửa. Chạm: kéo ngang trên hình.' };
  if (kind === 'pick') return { btns: [], keys: 'Chạm hoặc chuột: kéo món đồ vào giỏ. Bàn phím: mũi tên di chuyển, phím cách để nhặt/thả.' };
  const word = kind === 'react' ? 'Giữ (thả khi có tín hiệu)' : 'Nhấn giữ để bóp';
  return { btns: [holdBtn(word, 'sq')], keys: 'Bàn phím: giữ phím cách để bóp, nhả để thả. Chạm: giữ nút hoặc giữ trên hình.' };
}
function renderPlay(it, cfg, opts) {
  opts = opts || {};
  const E = BB.EXS[it.ex] || {}, canvas = h('canvas', { 'aria-label': 'Khung tập ' + (cfg.name || '') });
  const setEl = h('span'), repEl = h('span.count'), timeEl = h('span.mute');
  const restBox = h('div.rest', { hidden: true }), stage = h('div.stage', { style: { position: 'relative' } });
  const autoBtn = h('button.btn.ghost.sm', { type: 'button', 'aria-pressed': 'false' }, 'Tự chạy mô phỏng');
  const doneBtn = h('button.btn.dark', { type: 'button' }, opts.free ? 'Dừng chơi' : 'Xong');
  const c = controlsFor(cfg.kind);
  stage.append(h('div.stagebar', setEl, repEl, timeEl), canvas, restBox, h('div.ctrls', c.btns, doneBtn), h('div.keys', c.keys));
  show(h('div.top', h('div', h('b', opts.title || (E.name + ' · Mức ' + it.level)), h('div.small.mute', opts.sub || (cfg.label + (cfg.game ? ' · ' + cfg.game : '')))), autoBtn), stage,
    h('p.small.mute', { style: { marginTop: '8px' } }, 'Bản thử: thao tác của bạn thay cho tín hiệu cảm biến từ lõi và camera.'));
  cur = { cfg: cfg, it: it, set: 1, sets: opts.free ? 1 : cfg.sets, agg: [], warns: [], auto: false, last: performance.now(), canvas: canvas, opts: opts };
  const warnSent = {};
  const onWarn = (type, text) => {
    cur.warns.push(text);
    if (warnSent[type]) return; warnSent[type] = 1;
    if (type === 'shoulder') sendAlert('shoulder_limit', call() + ' nâng tay vượt ngang vai ở bài Nâng tay khi chưa được mở khoá.');
    if (type === 'force') sendAlert('force_limit', call() + ' dùng lực vượt giới hạn tuần (' + BB.fmt(cfg.forceLimit, 1) + ' kg) ở ' + (opts.free ? 'trò ' + (cfg.game || cfg.name) : 'bài ' + E.name) + '. App đã nhắc "bóp nhẹ lại".');
  };
  const newEngine = () => { if (cur.eng) cur.eng.destroy(); cur.eng = BB.Play(canvas, cfg, { warn: onWarn, done: () => onSetDone() }); cur.eng.setAuto(cur.auto); };
  autoBtn.addEventListener('click', () => { cur.auto = !cur.auto; cur.eng.setAuto(cur.auto); autoBtn.setAttribute('aria-pressed', String(cur.auto)); autoBtn.classList.toggle('soft', cur.auto); });
  const finishAll = () => {
    if (!cur) return; const stats = cur.eng ? cur.eng.stats() : null; if (stats && !cur.counted) cur.agg.push(stats);
    const res = aggregate(cur.agg, cfg, cur.sets); const warns = cur.warns.slice(); const score = cur.eng ? cur.eng.S.score : 0;
    stopPlay();
    if (opts.onEnd) opts.onEnd(res, score, warns); else finishExercise(it, cfg, res, warns, false);
  };
  doneBtn.addEventListener('click', finishAll);
  function onSetDone() {
    cur.agg.push(cur.eng.stats()); cur.counted = true;
    if (cur.set >= cur.sets) return finishAll();
    /* nghỉ giữa hiệp */
    let left = cfg.rest; restBox.hidden = false; restBox.textContent = '';
    const big = h('div.big', left + ' s');
    restBox.append(h('b', 'Nghỉ giữa hiệp'), big, h('div.mute', 'Hiệp tiếp theo: ' + (cur.set + 1) + '/' + cur.sets), h('button.btn', { onclick: () => endRest() }, 'Bỏ qua nghỉ'));
    const endRest = () => { clearInterval(cur.restTimer); restBox.hidden = true; cur.set++; cur.counted = false; newEngine(); };
    cur.restTimer = setInterval(() => { left--; big.textContent = left + ' s'; if (left <= 0) endRest(); }, 1000);
    cur.endRest = endRest;
  }
  const upd = () => {
    const e = cur.eng, S = e.S;
    setEl.textContent = opts.free ? (cfg.game || '') : 'Hiệp ' + cur.set + '/' + cur.sets;
    if (opts.free) repEl.textContent = 'Điểm: ' + (cfg.maxMode ? BB.fmt(S.score || 0, 1) + ' kg' : (S.score || 0));
    else if (cfg.kind === 'track') repEl.textContent = Math.min(cfg.dur, Math.floor(S.run || 0)) + '/' + cfg.dur + ' s';
    else if (cfg.mode === 'test') repEl.textContent = cfg.trials ? 'Lần ' + Math.min((S.trials || []).length + 1, cfg.trials) + '/' + cfg.trials : '';
    else repEl.textContent = (cfg.kind === 'pick' ? S.ok : S.ok) + '/' + cfg.reps + (cfg.kind === 'rhythm' ? ' nhịp' : cfg.kind === 'pick' ? ' món' : ' lần');
    timeEl.textContent = BB.fmt(S.t, 0) + ' s';
  };
  const loop = now => {
    if (!cur) return; const dt = Math.min(0.05, (now - cur.last) / 1000); cur.last = now;
    if (restBox.hidden) cur.eng.tick(dt);
    if (cur) { cur.eng.draw(); upd(); cur.raf = requestAnimationFrame(loop); }
  };
  newEngine(); cur.raf = requestAnimationFrame(loop);
  cur.finishAll = finishAll; cur.upd = upd;
  return cur;
}
function aggregate(list, cfg, sets) {
  const ms = {}; let planned = 0, done = 0;
  list.forEach(s => { planned += s.planned; done += s.done; s.measures.forEach(m => { (ms[m.key] = ms[m.key] || { m: m, vals: [] }).vals.push(m.value); }); });
  if (cfg.kind === 'track') planned = cfg.dur * sets; else planned = cfg.reps * sets;
  const measures = Object.keys(ms).map(k => { const o = ms[k], v = o.vals;
    const value = o.m.agg === 'max' ? Math.max(...v) : o.m.agg === 'sum' ? v.reduce((a, b) => a + b, 0) : v.reduce((a, b) => a + b, 0) / v.length;
    return { key: k, label: o.m.label, value: +value.toFixed(2), unit: o.m.unit }; });
  return { planned: planned, done: Math.min(done, planned), measures: measures };
}
function finishExercise(it, cfg, res, warns, skipped) {
  const r = { ex: it.ex, level: it.level, planned: res.planned, done: Math.round(res.done), completion: res.planned ? Math.min(1, res.done / res.planned) : 0,
    stopped: false, pain: null, measures: res.measures, warnings: warns.slice(0, 5), skipped: !!skipped };
  r.vs_healthy = BB.vsHealthy(r, st.p.latest_test && st.p.latest_test.data);
  SES.results.push(r);
  /* hỏi mức đau sau bài */
  const E = BB.EXS[it.ex];
  show(h('div.top', h('span.tag', 'Sau bài ' + (SES.i + 1) + '/' + SES.plan.length), null),
    h('div.card.col', h('h2', skipped ? 'Đã bỏ qua ' + E.name : 'Xong ' + E.name + '!'),
      skipped ? null : h('div.row', h('div.ring', { style: { '--p': Math.round(r.completion * 100) } }, h('span', BB.pct(r.completion))), h('div.grow.col', { style: { gap: '4px' } }, r.measures.slice(0, 3).map(m => h('div', h('span.mute', m.label + ': '), h('b', BB.fmt(m.value, m.unit === 'kg' || m.unit === 's' ? 1 : 0) + ' ' + m.unit))))),
      warns.length ? h('div.notice', warns[0]) : null,
      h('div.q', h('div.ql', 'Sau bài này, tay đau mức nào?'), painSeg(v => afterPain(r, v)))));
}
function afterPain(r, v) {
  r.pain = v;
  const pre = SES.pre.pain || 0, c = call();
  if (v >= 4 || v - pre >= 2) {
    r.stopped = true; SES.status = 'stopped';
    SES.stop_reason = v >= 4 ? 'đau ' + v + '/10 sau bài ' + BB.EXS[r.ex].name : 'đau tăng ' + (v - pre) + ' điểm so với đầu buổi (sau bài ' + BB.EXS[r.ex].name + ')';
    sendAlert('pain_stop', c + ' phải dừng buổi tập: ' + SES.stop_reason + '.');
    BB.toast('Dừng buổi tập vì ' + SES.stop_reason + '.', 'bad');
    return renderPost(true);
  }
  SES.i++;
  if (SES.i < SES.plan.length) renderIntro(); else renderPost(false);
}
function renderPost(stopped) {
  const a = SES.post, inj = st.p.program === 'chanthuong';
  const next = h('button.btn.big.block', { disabled: true, onclick: finishSession }, 'Xem kết quả');
  const check = () => { next.disabled = !(a.pain != null && a.fatigue != null && (!inj || (a.swelling != null && a.pain_up != null && a.numb != null))); };
  show(h('div.top', h('span.tag', 'Cuối buổi'), null),
    stopped ? h('p.notice.bad', 'Buổi tập dừng giữa chừng: ' + SES.stop_reason + '. Đã gửi cảnh báo tới Web theo dõi.') : null,
    h('h1', 'Cuối buổi, ' + lo(call()) + ' thấy thế nào?'),
    h('div.card', h('div.q', h('div.ql', 'Tay đau mức nào?'), painSeg(v => { a.pain = v; check(); })),
      h('div.q', h('div.ql', 'Mệt mức nào?'), painSeg(v => { a.fatigue = v; check(); })),
      inj ? [h('div.q', h('div.ql', 'Tay có sưng không?'), ynBtns(v => { a.swelling = v; check(); })),
             h('div.q', h('div.ql', 'Đau có tăng lên không?'), ynBtns(v => { a.pain_up = v; check(); })),
             h('div.q', h('div.ql', 'Có tê tay không?'), ynBtns(v => { a.numb = v; check(); }))] : null),
    h('div', { style: { marginTop: '16px' } }, next));
}
async function finishSession() {
  const a = SES.post, c = call();
  let advise = null;
  if (st.p.program === 'chanthuong' && (a.swelling || a.pain_up || a.numb)) {
    const sy = [a.swelling && 'sưng', a.pain_up && 'đau tăng', a.numb && 'tê'].filter(Boolean).join(', ');
    sendAlert('injury_symptom', c + ' báo ' + sy + ' sau buổi tập. App đã nhắc dừng tập và đi khám.');
    advise = 'Tay ' + sy + ' sau buổi tập: hãy dừng tập và đi khám.';
  }
  const resp = await saveTraining();
  st.busy = false;
  renderResults(resp, advise);
}
function renderResults(resp, advise) {
  const rs = SES.results, avg = rs.length ? rs.reduce((x, r) => x + r.completion, 0) / rs.length : 0;
  const props = (resp && resp.proposals) || [];
  show(h('div.top', h('div.brand', BB.logo(34), 'Bốp Bốp'), null),
    h('h1', SES.status === 'stopped' ? 'Buổi tập đã dừng' : 'Xong buổi tập!'),
    advise ? h('p.notice.bad', { style: { margin: '10px 0' } }, advise) : null,
    h('div.card.row', { style: { margin: '12px 0' } }, h('div.ring', { style: { '--p': Math.round(avg * 100) } }, h('span', BB.pct(avg))),
      h('div.grow', h('b', rs.length + ' bài · hoàn thành trung bình ' + BB.pct(avg)), h('div.small.mute', 'Đau ' + (SES.pre.pain ?? '—') + ' → ' + (SES.post.pain ?? '—') + '/10 · mệt ' + (SES.post.fatigue ?? '—') + '/10'))),
    h('div.tblwrap.card.flat', h('table.tbl', h('thead', h('tr', h('th', 'Bài'), h('th.num', 'Hoàn thành'), h('th', 'Số đo'), h('th.num', 'So với tay lành'))),
      h('tbody', rs.map(r => { const m = r.measures[0];
        return h('tr', h('td', h('b', r.ex + '. ' + BB.EXS[r.ex].name), h('div.small.mute', 'Mức ' + r.level + (r.pain != null ? ' · đau ' + r.pain + '/10' : '') + (r.stopped ? ' · dừng' : '') + (r.skipped ? ' · bỏ qua' : ''))),
          h('td.num', BB.pct(r.completion)), h('td', m ? BB.fmt(m.value, m.unit === 'kg' || m.unit === 's' ? 1 : 0) + ' ' + m.unit : '—', h('div.small.mute', m ? m.label : '')),
          h('td.num', r.vs_healthy != null ? BB.pct(r.vs_healthy) : h('span.mute', st.p.latest_test ? '—' : 'chưa đo tuần'))); })))),
    props.length ? h('div.card.tint.col', { style: { marginTop: '12px' } }, h('b', 'Đã gửi đề xuất cho chuyên viên duyệt'),
      props.map(x => h('div', (x.up ? '▲ Lên' : '▼ Xuống') + ' mức ' + x.from + ' → ' + x.to + ': ' + BB.EXS[x.ex].name)), h('div.small.mute', 'App chỉ đề xuất; mức tập chỉ đổi khi chuyên viên duyệt trên web.')) : null,
    resp && resp.lines ? h('div.msg.auto', { style: { marginTop: '12px' } }, h('div.who', 'Phân tích tự động'), h('ul', resp.lines.map(l => h('li', l)))) : null,
    h('p.notice.ok', { style: { marginTop: '12px' } }, resp ? 'Kết quả đã gửi tới Web theo dõi của gia đình và chuyên viên.' : 'Chưa gửi được kết quả. Kiểm tra kết nối rồi thử lại.'),
    resp ? null : h('button.btn.block', { onclick: async () => { const r = await saveTraining(); if (r) renderResults(r, advise); } }, 'Gửi lại'),
    h('button.btn.big.block', { style: { marginTop: '12px' }, onclick: () => go('home') }, 'Về trang chính'));
}

/* ---------------------------------------------------------------- kiểm tra tuần */
let TST = null;
function renderTestIntro() {
  const p = st.p, lt = p.latest_test;
  show(topBar(), h('h1', 'Kiểm tra tuần'),
    h('p.lead', { style: { margin: '6px 0 14px' } }, 'Mỗi tuần một lần, cùng giờ, cùng tư thế. Đo cả hai tay: tay lành trước, tay yếu sau. Kết quả cho biết tay yếu bằng bao nhiêu % tay lành.'),
    h('div.card.col', h('b', '9 số đo'), h('div.chips', BB.TEST.map(t => h('span.tag.gray', t.name)))),
    lt ? h('div.card.col', { style: { marginTop: '12px' } }, h('b', 'Lần gần nhất: ' + BB.date(lt.created)), testTable(lt.data)) : null,
    h('button.btn.big.block', { style: { marginTop: '16px' }, onclick: startTest }, 'Bắt đầu kiểm tra'));
}
function testTable(data) {
  const m = data.metrics || {};
  const keys = BB.TEST.map(t => t.key).concat(['grip_sd']).filter(k => m[k]);
  return h('div.col', { style: { gap: '6px' } },
    h('div.tblwrap', h('table.tbl', h('thead', h('tr', h('th', 'Số đo'), h('th.num', 'Tay lành'), h('th.num', 'Tay yếu'), h('th.num', '%'))),
      h('tbody', keys.map(k => { const x = m[k], u = BB.testUnit(k), d = u === 'kg' || u === 's' ? 1 : 0, pc = BB.vsPct(k, x.healthy, x.weak);
        return h('tr', h('td', BB.testName(k), BB.isLower(k) ? h('div.small.mute', 'số nhỏ là tốt') : null), h('td.num', BB.fmt(x.healthy, d) + ' ' + u), h('td.num', BB.fmt(x.weak, d) + ' ' + u), h('td.num', h('b', BB.pct(pc)))); })))),
    (data.warnings || []).map(w => h('div.notice', w)));
}
function startTest() {
  TST = { steps: [], i: 0, vals: {}, trials: {}, sds: {}, warnings: [] };
  BB.TEST.forEach(t => ['healthy', 'weak'].forEach(side => TST.steps.push({ t: t, side: side })));
  st.busy = true; nav.hidden = true; renderTestStep();
}
function testCfg(step) {
  const t = step.t, sim = BB.SIM[step.side === 'healthy' ? 'healthy' : st.p.program];
  const c = { kind: t.kind, mode: 'test', viz: t.viz, unit: t.unit, measure: t.name, name: t.name, cap: sim[t.cap] || 10, trials: t.trials, lag: sim.lag, reps: 3, sets: 1 };
  if (t.key === 'pron') c.side = -1; if (t.key === 'sup') c.side = 1;
  if (t.kind === 'react') { c.target = 2; c.good = 1; c.react = 'release'; }
  return c;
}
function renderTestStep() {
  const step = TST.steps[TST.i], t = step.t, cfg = testCfg(step), sideName = step.side === 'healthy' ? 'Tay lành' : 'Tay yếu';
  let value = null;
  const manual = h('input.inp', { type: 'number', step: '0.1', min: 0, placeholder: 'Số đo (' + t.unit + ')', style: { maxWidth: '180px' } });
  const out = h('div.notice.ok', { hidden: true }), next = h('button.btn.big.block', { disabled: true }, TST.i + 1 < TST.steps.length ? 'Tiếp' : 'Xem kết quả');
  const setVal = (v, trials, sdv) => {
    value = v; out.hidden = false; out.textContent = sideName + ': ' + BB.fmt(v, t.unit === 'kg' || t.unit === 's' ? 2 : 0) + ' ' + t.unit + (trials ? ' (trung bình ' + trials.length + ' lần: ' + trials.map(x => BB.fmt(x, t.unit === 's' ? 2 : 1)).join(' · ') + ')' : '');
    TST.vals[t.key] = TST.vals[t.key] || {}; TST.vals[t.key][step.side] = v;
    if (trials) { TST.trials[t.key] = TST.trials[t.key] || {}; TST.trials[t.key][step.side] = trials; }
    if (sdv != null) { TST.sds[step.side] = sdv; }
    next.disabled = false;
  };
  next.addEventListener('click', () => { TST.i++; if (TST.i < TST.steps.length) renderTestStep(); else renderTestSummary(); });
  const holder = h('div');
  const startMeasure = () => {
    holder.textContent = '';
    const c2 = renderPlayInto(holder, cfg, (res, score, warns, eng) => {
      const S = eng.S;
      if (t.kind === 'force' || t.kind === 'react') { const tr = S.trials.slice(0, t.trials || 3); if (!tr.length) return BB.toast('Chưa có lần đo nào.', 'bad'); setVal(tr.reduce((a, b) => a + b, 0) / tr.length, tr, t.key === 'grip' && S.sdv.length ? S.sdv.reduce((a, b) => a + b, 0) / S.sdv.length : null); }
      else if (t.kind === 'pick') setVal(S.score || 0);
      else setVal(S.max);
    });
    return c2;
  };
  show(h('div.top', h('span.tag', 'Bước ' + (TST.i + 1) + '/' + TST.steps.length), h('button.linkbtn', { onclick: () => { stopPlay(); st.busy = false; go('test'); } }, 'Huỷ')),
    h('h1', t.name + ' – ' + sideName),
    h('p.lead', t.how), h('div.row', { style: { margin: '8px 0 12px' } }, h('span.tag.core', 'Lõi'), h('span', t.core)),
    holder, out,
    h('div.row', { style: { margin: '10px 0' } }, h('span.mute', 'Hoặc nhập số đo:'), manual, h('button.btn.ghost.sm', { onclick: () => { const v = parseFloat(String(manual.value).replace(',', '.')); if (!(v >= 0)) return BB.toast('Nhập số đo hợp lệ.', 'bad'); stopPlay(); setVal(v); } }, 'Dùng số này')),
    next);
  startMeasure();
}
/* chạy bộ chơi trong một khung có sẵn (dùng cho kiểm tra tuần) */
function renderPlayInto(holder, cfg, onDone) {
  stopPlay();
  const canvas = h('canvas'), stage = h('div.stage'), c = controlsFor(cfg.kind);
  const autoBtn = h('button.btn.ghost.sm', { type: 'button' }, 'Tự chạy mô phỏng');
  const rec = h('button.btn.dark', { type: 'button' }, cfg.kind === 'rise' ? 'Ghi số đo' : 'Kết thúc đo');
  stage.append(h('div.stagebar', h('b', cfg.trials ? 'Đo ' + cfg.trials + ' lần' : cfg.kind === 'pick' ? '60 giây' : 'Đo một lần'), autoBtn), canvas, h('div.ctrls', c.btns, rec), h('div.keys', c.keys));
  holder.append(stage);
  const eng = BB.Play(canvas, cfg, { done: () => finish() });
  cur = { eng: eng, last: performance.now(), cfg: cfg };
  let fin = false;
  const finish = () => { if (fin) return; fin = true; const e = cur && cur.eng; if (!e) return; onDone(null, e.S.score, [], e); if (cur) cancelAnimationFrame(cur.raf); e.destroy(); cur = null; stage.style.opacity = '.6'; };
  rec.addEventListener('click', finish);
  autoBtn.addEventListener('click', () => { eng.setAuto(!eng.I.auto); autoBtn.classList.toggle('soft', eng.I.auto); });
  const loop = now => { if (!cur || cur.eng !== eng) return; const dt = Math.min(0.05, (now - cur.last) / 1000); cur.last = now; eng.tick(dt); eng.draw(); cur.raf = requestAnimationFrame(loop); };
  cur.raf = requestAnimationFrame(loop); cur.finish = finish;
  return cur;
}
function renderTestSummary() {
  const sex = st.p.sex, thr = sex === 'F' ? 0.12 : 0.10, metrics = {}, warns = [];
  Object.keys(TST.vals).forEach(k => { const v = TST.vals[k]; if (v.healthy != null && v.weak != null) metrics[k] = { healthy: +v.healthy.toFixed(2), weak: +v.weak.toFixed(2), trials: TST.trials[k] }; });
  ['grip', 'pinch'].forEach(k => { const tr = TST.trials[k]; if (!tr) return; ['healthy', 'weak'].forEach(side => { const a = tr[side]; if (!a || a.length < 2) return;
    const m = a.reduce((x, y) => x + y, 0) / a.length, spread = (Math.max(...a) - Math.min(...a)) / m;
    if (spread > thr) warns.push(BB.testName(k) + ' ' + (side === 'healthy' ? 'tay lành' : 'tay yếu') + ': ba lần bóp lệch nhau ' + Math.round(spread * 100) + '% (quá ' + Math.round(thr * 100) + '%), nên đo lại.'); }); });
  if (TST.sds.healthy != null && TST.sds.weak != null) metrics.grip_sd = { healthy: +TST.sds.healthy.toFixed(3), weak: +TST.sds.weak.toFixed(3) };
  const data = { metrics: metrics, warnings: warns };
  const lines = Object.keys(metrics).map(k => { const pc = BB.vsPct(k, metrics[k].healthy, metrics[k].weak); return pc != null ? BB.testName(k) + ': tay yếu bằng ' + Math.round(pc * 100) + '% tay lành' : null; }).filter(Boolean);
  const save = h('button.btn.big.block', { onclick: async () => {
    save.disabled = true;
    try { await api('/api/patients/' + st.p.id + '/tests', { metrics: metrics, warnings: warns }); st.p = await api('/api/patients/' + st.p.id); st.busy = false; BB.toast('Đã lưu kiểm tra tuần và gửi tới Web theo dõi.', 'ok'); go('home'); }
    catch (e) { save.disabled = false; err(e); }
  } }, 'Lưu kết quả');
  show(h('div.top', h('span.tag', 'Kết quả kiểm tra tuần'), null), h('h1', 'Tay yếu so với tay lành'),
    h('div.card.col', { style: { margin: '12px 0' } }, testTable(data)),
    h('div.card.tint.col', lines.map(l => h('div', l))),
    warns.length ? h('div.row', { style: { marginTop: '10px' } }, h('button.btn.ghost', { onclick: () => { TST.i = TST.steps.findIndex(s => s.t.key === (warns[0].startsWith('Lực kẹp') ? 'pinch' : 'grip')); renderTestStep(); } }, 'Đo lại lực')) : null,
    h('div', { style: { marginTop: '14px' } }, save));
}

/* ---------------------------------------------------------------- trò chơi tự do */
const GAMES = [
  { key: 'dolu', name: 'Đo lực', ic: '💪', force: true, desc: 'Bóp hết sức, xem kỷ lục.', cfg: p => ({ kind: 'force', maxMode: true, viz: 'egg', cap: BB.SIM[p.program].grip, target: 1.5, unit: 'kg', measure: 'Lực bóp' }) },
  { key: 'chim', name: 'Chim bay', ic: '🐦', force: true, desc: 'Giữ lực để chim bay trong vùng xanh.', cfg: p => { const m = BB.weakMax(p, 'grip'); return { kind: 'track', viz: 'bird', cap: BB.SIM[p.program].grip, band: [Math.max(1, +(m * 0.3).toFixed(1)), Math.max(1.6, +(m * 0.5).toFixed(1))] }; } },
  { key: 'tao', name: 'Hái táo', ic: '🍎', force: true, desc: 'Kẹp theo nhịp để hái táo.', cfg: p => ({ kind: 'rhythm', viz: 'apples', cap: BB.SIM[p.program].pinch, target: Math.max(0.6, +(BB.weakMax(p, 'pinch') * 0.4).toFixed(1)), beat: 2.0 }) },
  { key: 'xe', name: 'Lái xe', ic: '🚗', force: false, desc: 'Xoay núm qua cổng trái, phải.', cfg: p => ({ kind: 'steer', viz: 'car', cap: BB.SIM[p.program].rot, target: 35, hold: 0.5 }) },
  { key: 'keo', name: 'Kéo co', ic: '🪢', force: true, desc: 'Kéo tay cầm, giữ để thắng đối thủ.', cfg: p => ({ kind: 'force', dir: 'pull', viz: 'tug', cap: BB.SIM[p.program].pull, target: 3, hold: 1.5, unit: 'kg' }) },
  { key: 'hoa', name: 'Mở nắm tay', ic: '🌼', force: false, desc: 'Mở bàn tay cho hoa nở.', cfg: p => ({ kind: 'rise', viz: 'flower', cap: BB.SIM[p.program].open, target: 60, unit: '%', measure: 'Độ mở' }) },
  { key: 'cho', name: 'Đi chợ', ic: '🧺', force: false, desc: 'Nhặt đồ trên thảm bỏ vào giỏ.', cfg: p => ({ kind: 'pick', viz: 'market', reps: 99 }) }
];
function renderGames() {
  const p = st.p, lockF = p.program === 'chanthuong' && !p.force_allowed;
  show(topBar(), h('h1', 'Trò chơi tự do'), h('p.lead', { style: { margin: '6px 0 14px' } }, 'Chơi cho vui, mỗi lượt 60 giây. Không tính vào buổi tập.'),
    lockF ? h('p.notice', { style: { marginBottom: '12px' } }, 'Trò có dùng lực đang khoá cho tới khi bác sĩ cho phép tập lực.') : null,
    h('div.gamegrid', GAMES.map(gm => h('button.game', { type: 'button', disabled: lockF && gm.force, onclick: () => playGame(gm) },
      h('span.gi', gm.ic), h('span.gn', gm.name), h('span.small.mute', lockF && gm.force ? '🔒 Chờ cho phép tập lực' : gm.desc)))));
}
function playGame(gm) {
  const p = st.p, cfg = Object.assign({ mode: 'free', duration: 60, name: gm.name, game: gm.name, lag: BB.SIM[p.program].lag, reps: 99, sets: 1 }, gm.cfg(p));
  if (p.program === 'chanthuong' && gm.force) cfg.forceLimit = p.force_limit;
  st.busy = true; nav.hidden = true;
  renderPlay({ ex: 0, level: '' }, cfg, { free: true, title: gm.ic + ' ' + gm.name, sub: gm.desc + ' · 60 giây', onEnd: (res, score) => {
    st.busy = false;
    show(h('div.col', { style: { paddingTop: '6vh' } }, h('div.center', { style: { fontSize: '64px' } }, gm.ic), h('h1.center', 'Hết giờ!'),
      h('p.lead.center', 'Điểm của ' + lo(call()) + ': ' + (cfg.maxMode ? BB.fmt(score || 0, 1) + ' kg' : (score || 0))),
      h('button.btn.big.block', { onclick: () => playGame(gm) }, 'Chơi lại'), h('button.btn.ghost.block', { onclick: () => go('games') }, 'Chọn trò khác')));
  } });
}

/* ---------------------------------------------------------------- tin nhắn */
function msgCard(m) {
  const cls = m.kind === 'auto' ? '.auto' : m.role === 'chuyenvien' ? '.cv' : '';
  return h('div.msg' + cls, { style: { marginBottom: '8px' } },
    h('div.row.space', h('span.who', m.kind === 'auto' ? m.text : m.author + (m.role === 'chuyenvien' ? ' (chuyên viên)' : m.role === 'nguoinha' ? ' (người nhà)' : '')), h('span.small.mute', BB.when(m.created))),
    m.kind === 'auto' ? h('ul', (m.lines || []).map(l => h('li', l))) : h('p', { style: { marginTop: '4px' } }, m.text));
}
function renderMsgs() {
  const chips = ['Cảm ơn cả nhà!', call() + ' tập xong rồi nhé', 'Hôm nay hơi mệt'].map(t => h('button.btn.soft.sm', { onclick: async () => { try { await api('/api/patients/' + st.p.id + '/messages', { text: t, via: 'app' }); await loadMsgs(); renderMsgs(); } catch (e) { err(e); } } }, t));
  show(topBar(), h('h1', 'Tin nhắn'), h('p.lead', { style: { margin: '6px 0 12px' } }, 'Lời nhắn của gia đình, chuyên viên và kết quả các buổi tập.'),
    h('div.chips', { style: { marginBottom: '12px' } }, chips),
    st.msgs.length ? st.msgs.map(msgCard) : h('p.mute', 'Chưa có tin nhắn nào.'));
}

/* giao diện thử nghiệm tự động */
window.__bbApp = {
  st: st, get SES() { return SES; }, get TST() { return TST; }, get cur() { return cur; },
  step: function (n, dt) { for (let i = 0; i < n && cur && cur.eng; i++) { const rest = cur.restTimer && cur.endRest; cur.eng.tick(dt || 1 / 60); } if (cur && cur.upd) cur.upd(); },
  endRest: function () { if (cur && cur.endRest) cur.endRest(); }
};
boot();
})();
