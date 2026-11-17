/* Bốp Bốp – Web theo dõi cho người nhà và chuyên viên */
'use strict';
(function () {
const { h, api, $ } = BB;
const root = $('root');
const st = { me: null, patients: [], p: null, tab: 'tong', d: {}, feed: [], feedOpen: false, stop: null };
const TABS = [['tong', 'Tổng quan'], ['buoi', 'Buổi tập'], ['canhbao', 'Cảnh báo'], ['dexuat', 'Đề xuất'], ['tuan', 'Kiểm tra tuần'], ['tin', 'Tin nhắn'], ['caidat', 'Cài đặt']];
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } } };
const err = e => BB.toast(e.message || String(e), 'bad');
const isCV = () => st.p && st.p.role === 'chuyenvien';

async function boot() {
  try { st.me = await api('/api/me'); } catch (e) { if (e.status === 401) return renderAuth(); root.textContent = ''; root.append(h('div.auth.card', h('h2', 'Không kết nối được'), h('p.mute', e.message), h('button.btn', { onclick: boot }, 'Thử lại'))); return; }
  if (!st.stop) st.stop = BB.listen(onEvent);
  await loadPatients();
  const want = +(new URLSearchParams(location.search).get('p') || store.get('bb.web.p') || 0);
  const p = st.patients.find(x => x.id === want) || st.patients[0];
  if (p) await openPatient(p.id, st.tab); else render();
  loadFeed();
}
function renderAuth(mode) {
  mode = mode || 'login';
  const u = h('input.inp', { autocomplete: 'username' }), pw = h('input.inp', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' }), nm = h('input.inp');
  const msg = h('p.notice.bad', { hidden: true });
  root.textContent = '';
  root.append(h('div.auth.col', h('div.row', BB.logo(48), h('div', h('div.brand', 'Bốp Bốp'), h('div.mute', 'Web theo dõi cho người nhà và chuyên viên'))),
    h('form.card.col', { onsubmit: async e => { e.preventDefault(); msg.hidden = true;
      try { st.me = await api(mode === 'login' ? '/api/login' : '/api/register', { username: u.value, password: pw.value, name: nm.value || u.value }); boot(); }
      catch (x) { msg.textContent = x.message; msg.hidden = false; } } },
      h('h2', mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'),
      mode === 'register' ? h('label.f', 'Tên hiển thị (ví dụ: ThS. Lan – PHCN)', nm) : null,
      h('label.f', 'Tên đăng nhập', u), h('label.f', 'Mật khẩu', pw), msg,
      h('button.btn.big.block', { type: 'submit' }, mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'),
      h('button.linkbtn', { type: 'button', onclick: () => renderAuth(mode === 'login' ? 'register' : 'login') }, mode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập')),
    BB.LOCAL ? h('p.notice', BB.LOCAL_NOTE) : null));
  u.focus();
}
async function loadPatients() { st.patients = await api('/api/patients'); }
async function openPatient(id, tab) {
  st.p = await api('/api/patients/' + id); store.set('bb.web.p', id);
  st.tab = tab || 'tong'; if (st.tab === 'caidat' && !isCV()) st.tab = 'tong';
  await loadTab(); render();
}
async function loadTab() {
  const id = st.p.id, d = st.d = st.d.pid === id ? st.d : { pid: id };
  const need = { tong: ['trainings', 'alerts', 'proposals', 'messages'], buoi: ['trainings'], canhbao: ['alerts'], dexuat: ['proposals'], tuan: ['tests'], tin: ['messages'], caidat: [] }[st.tab];
  await Promise.all(need.concat(['alerts', 'proposals']).filter((x, i, a) => a.indexOf(x) === i).map(async k => { d[k] = await api('/api/patients/' + id + '/' + k); }));
}
async function loadFeed() { try { st.feed = await api('/api/feed'); renderBell(); } catch (e) { /* bỏ qua */ } }
async function logout() { try { await api('/api/logout', {}); } catch (e) { /* bỏ qua */ } if (st.stop) { st.stop(); st.stop = null; } st.me = null; st.p = null; renderAuth(); }

async function onEvent(ev) {
  const mine = st.patients.find(p => p.id === ev.patient_id);
  const who = mine ? mine.call_name + ' ' + mine.name : 'Người tập';
  const say = { training: [who + ': có kết quả buổi tập mới.', 'bopt'], alert: ['Cảnh báo mới cho ' + who + '.', 'bad'], message: ['Tin nhắn mới cho ' + who + '.', ''], test: [who + ': có kết quả kiểm tra tuần.', 'bopt'], patient: null }[ev.type];
  await loadPatients();
  if (st.p && ev.patient_id === st.p.id) { st.p = await api('/api/patients/' + st.p.id); await loadTab(); }
  if (say && !(ev.type === 'alert' && st.d.alerts && st.d.alerts.every(a => a.resolved))) BB.toast(say[0], say[1]);
  render(); loadFeed();
}

/* ---------------------------------------------------------------- khung trang */
let bellBox = null;
function renderBell() {
  if (!bellBox) return;
  const seen = +(store.get('bb.web.seen') || 0), unread = st.feed.filter(f => f.created > seen && (f.kind !== 'alert' || !f.resolved)).length;
  bellBox.textContent = '';
  const btn = h('button.btn.ghost.bell', { type: 'button', 'aria-label': 'Thông báo', 'aria-expanded': String(st.feedOpen), onclick: () => { st.feedOpen = !st.feedOpen; if (st.feedOpen) store.set('bb.web.seen', Date.now() / 1000); renderBell(); } },
    '🔔 Thông báo', unread ? h('span.dot', unread > 9 ? '9+' : unread) : null);
  bellBox.append(btn);
  if (st.feedOpen) bellBox.append(h('div.feed', st.feed.length ? st.feed.map(f => h('button.fi', { type: 'button', onclick: () => { st.feedOpen = false; openPatient(f.patient_id, f.kind === 'alert' ? 'canhbao' : f.kind === 'proposal' ? 'dexuat' : 'tin'); } },
    h('div.row.space', h('b', (f.kind === 'alert' ? '⚠️ ' : f.kind === 'proposal' ? '📈 ' : '💬 ') + f.who), h('span.small.mute', BB.when(f.created))), h('div.small', f.text))) : h('p.mute', { style: { padding: '10px' } }, 'Chưa có thông báo.')));
}
function render() {
  root.textContent = '';
  const side = h('aside.side',
    h('a.brand', { href: './' }, BB.logo(36), h('div', 'Bốp Bốp', h('small', 'Web theo dõi'))),
    h('div.small.mute', 'Tài khoản: ', h('b', st.me.name), ' · ', h('button.linkbtn', { onclick: logout }, 'Đăng xuất')),
    h('b', 'Người tập'),
    h('div.plist', st.patients.length ? st.patients.map(p => { const s = p.summary || {};
      return h('button.pitem', { type: 'button', 'aria-current': st.p && st.p.id === p.id ? 'true' : 'false', onclick: () => openPatient(p.id, st.tab) },
        h('div.row.space', h('span.pn', p.call_name + ' ' + p.name), s.open_alerts ? h('span.tag.bad', '⚠ ' + s.open_alerts) : null),
        h('div.small.mute', BB.PROGRAMS[p.program].short + ' · ' + BB.ROLE[p.role] + (s.last_training ? ' · tập ' + BB.when(s.last_training.created) : ' · chưa tập')),
        s.pending_proposals ? h('span.tag', s.pending_proposals + ' đề xuất chờ duyệt') : null); }) : h('p.mute', 'Chưa có người tập.')),
    addBox());
  const main = h('main.main');
  bellBox = h('div', { style: { position: 'relative' } });
  if (!st.p) main.append(h('div.webtop', h('h1', 'Chào ' + st.me.name), bellBox), h('p.lead.mute', { style: { marginTop: '10px' } }, 'Thêm người tập hoặc nhập mã mời ở cột bên trái để bắt đầu theo dõi.'));
  else main.append(header(), tabs(), content());
  root.append(h('div.web', side, main));
  renderBell();
}
function addBox() {
  const name = h('input.inp', { placeholder: 'Họ tên người tập' }), age = h('input.inp', { type: 'number', value: 62, min: 1, max: 120 });
  const callSel = h('select.inp', ['Bố', 'Mẹ', 'Ông', 'Bà', 'Anh', 'Chị', 'Cô', 'Chú'].map(x => h('option', x)));
  const sex = h('select.inp', h('option', { value: 'M' }, 'Nam'), h('option', { value: 'F' }, 'Nữ'));
  const prog = h('select.inp', h('option', { value: 'dotquy' }, 'Đột quỵ'), h('option', { value: 'chanthuong' }, 'Chấn thương'));
  const role = h('select.inp', h('option', { value: 'chuyenvien' }, 'Tôi là chuyên viên'), h('option', { value: 'nguoinha' }, 'Tôi là người nhà'));
  const code = h('input.inp', { placeholder: 'Mã mời 6 ký tự', maxlength: 6 });
  return h('details.card.flat', h('summary', h('b', '+ Thêm người tập / nhập mã')),
    h('div.col', { style: { marginTop: '10px' } }, name, h('div.row', callSel, sex), age, prog, role,
      h('button.btn.block', { onclick: async () => { try { const p = await api('/api/patients', { name: name.value, call_name: callSel.value, sex: sex.value, age: +age.value, program: prog.value, my_role: role.value }); await loadPatients(); await openPatient(p.id); } catch (e) { err(e); } } }, 'Thêm người tập'),
      h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', width: '100%' } }), code,
      h('button.btn.ghost.block', { onclick: async () => { try { const r = await api('/api/join', { code: code.value }); await loadPatients(); await openPatient(r.patient_id); BB.toast('Đã thêm quyền ' + BB.ROLE[r.role].toLowerCase() + '.', 'ok'); } catch (e) { err(e); } } }, 'Vào bằng mã')));
}
function header() {
  const p = st.p, prog = BB.PROGRAMS[p.program];
  return h('div.col', { style: { gap: '10px' } },
    h('div.webtop', h('div', h('h1', p.call_name + ' ' + p.name), h('div.row', { style: { marginTop: '6px' } }, h('span.tag', prog.name), h('span.tag.gray', (p.sex === 'F' ? 'Nữ' : 'Nam') + ', ' + p.age + ' tuổi'), h('span.tag.core', 'Bạn là ' + BB.ROLE[p.role].toLowerCase()),
      p.program === 'chanthuong' ? h('span.tag' + (p.force_allowed ? '.ok' : '.warn'), p.force_allowed ? 'Đã cho phép tập lực' : 'Chưa cho phép tập lực') : h('span.tag' + (p.shoulder_unlocked ? '.ok' : '.warn'), p.shoulder_unlocked ? 'Đã mở khoá quá vai' : 'Nâng tay giới hạn ngang vai'))), bellBox),
    h('div.codes.row', h('span.small.mute', 'Mã mời người nhà:'), h('span.code', p.code_nn), isCV() ? [h('span.small.mute', 'Mã mời chuyên viên:'), h('span.code', p.code_cv)] : null));
}
function tabs() {
  const d = st.d, al = (d.alerts || []).filter(a => !a.resolved).length, pr = (d.proposals || []).filter(x => x.status === 'pending').length;
  return h('div.tabs', { role: 'tablist' }, TABS.filter(t => t[0] !== 'caidat' || isCV()).map(t => h('button', { role: 'tab', 'aria-selected': String(st.tab === t[0]), onclick: async () => { st.tab = t[0]; await loadTab(); render(); } },
    t[1], t[0] === 'canhbao' && al ? h('span.cnt', al) : null, t[0] === 'dexuat' && pr ? h('span.cnt', { style: { background: 'var(--bop)', color: 'var(--ink)' } }, pr) : null)));
}
function content() { return ({ tong: tabTong, buoi: tabBuoi, canhbao: tabCanhBao, dexuat: tabDeXuat, tuan: tabTuan, tin: tabTin, caidat: tabCaiDat })[st.tab](); }

/* ---------------------------------------------------------------- Tổng quan */
function trainingCard(t) {
  const statusTag = { done: h('span.tag.ok', 'Hoàn thành'), stopped: h('span.tag.warn', 'Dừng giữa chừng'), blocked: h('span.tag.bad', 'Không tập') }[t.status];
  const test = st.p.latest_test && st.p.latest_test.data;
  return h('div.card.col', { style: { gap: '10px' } },
    h('div.row.space', h('div', h('b', BB.when(t.created)), h('div.small.mute', 'Ghi bởi ' + t.author)), statusTag),
    t.stop_reason ? h('div.notice' + (t.status === 'blocked' ? '.bad' : ''), 'Lý do: ' + t.stop_reason) : null,
    h('div.row.small', h('span.tag.gray', 'Đau trước ' + (t.pre.pain ?? '—') + '/10'), h('span.tag.gray', 'Đau sau ' + (t.post.pain ?? '—') + '/10'), h('span.tag.gray', 'Mệt ' + (t.post.fatigue ?? t.pre.fatigue ?? '—') + '/10'), t.results.length ? h('span.tag', 'Hoàn thành TB ' + BB.pct(t.avg_completion)) : null),
    t.results.length ? h('div.tblwrap', h('table.tbl', h('thead', h('tr', h('th', 'Bài'), h('th.num', 'Hoàn thành'), h('th', 'Số đo'), h('th.num', 'So với tay lành'), h('th.num', 'Đau'))),
      h('tbody', t.results.map(r => { const m = r.measures[0], vs = r.vs_healthy != null ? r.vs_healthy : BB.vsHealthy(r, test);
        return h('tr', h('td', h('b', r.ex + '. ' + BB.EXS[r.ex].name), h('div.small.mute', 'Mức ' + r.level + (r.stopped ? ' · phải dừng' : '') + (r.skipped ? ' · bỏ qua' : '')), r.warnings.length ? h('div.small', { style: { color: 'var(--bad)' } }, '⚠ ' + r.warnings[0]) : null),
          h('td.num', h('div', BB.pct(r.completion)), h('div.meter' + (r.completion >= 0.9 ? '.ok' : ''), { style: { width: '90px', marginLeft: 'auto' } }, h('i', { style: { width: Math.round(r.completion * 100) + '%' } }))),
          h('td', m ? BB.fmt(m.value, m.unit === 'kg' || m.unit === 's' ? 1 : 0) + ' ' + m.unit : '—', m ? h('div.small.mute', m.label) : null),
          h('td.num', vs != null ? BB.pct(vs) : '—'), h('td.num', r.pain ?? '—')); })))) : null);
}
function tabTong() {
  const d = st.d, tr = d.trainings || [], week = Date.now() / 1000 - 7 * 86400;
  const wk = tr.filter(t => t.created > week && t.status !== 'blocked'), avg = wk.length ? wk.reduce((a, t) => a + (t.avg_completion || 0), 0) / wk.length : null;
  const openAl = (d.alerts || []).filter(a => !a.resolved), pend = (d.proposals || []).filter(x => x.status === 'pending');
  const lastAuto = (d.messages || []).find(m => m.kind === 'auto');
  return h('div.col', { style: { gap: '16px' } },
    h('div.kpis', kpi(wk.length + '/5', 'Buổi tập 7 ngày qua'), kpi(BB.pct(avg), 'Hoàn thành trung bình'), kpi(openAl.length, 'Cảnh báo chưa xử lý', openAl.length ? 'var(--bad)' : null), kpi(pend.length, 'Đề xuất chờ duyệt')),
    openAl.length ? h('div.col', openAl.slice(0, 3).map(alertRow), openAl.length > 3 ? h('button.linkbtn', { onclick: () => { st.tab = 'canhbao'; loadTab().then(render); } }, 'Xem tất cả cảnh báo') : null) : null,
    lastAuto ? h('div.msg.auto', h('div.row.space', h('span.who', lastAuto.text), h('span.small.mute', BB.when(lastAuto.created))), h('ul', lastAuto.lines.map(l => h('li', l))), replyBox(true)) : null,
    tr[0] ? h('div.col', h('h2', 'Buổi tập gần nhất'), trainingCard(tr[0])) : h('div.card', h('b', 'Chưa có buổi tập nào.'), h('p.mute', 'Khi người tập xong một buổi trên App, kết quả hiện ở đây ngay.')),
    st.p.latest_test ? h('div.card.col', h('h2', 'Tay yếu so với tay lành'), h('div.small.mute', 'Kiểm tra tuần ngày ' + BB.date(st.p.latest_test.created)), testBars(st.p.latest_test.data)) : null);
}
function kpi(v, l, col) { return h('div.card.kpi', h('div.v', { style: col ? { color: col } : null }, v), h('div.l', l)); }
function testBars(data) {
  const m = data.metrics || {}, keys = BB.TEST.map(t => t.key).concat(['grip_sd']).filter(k => m[k]);
  return h('div.bars', keys.map(k => { const pc = BB.vsPct(k, m[k].healthy, m[k].weak);
    return h('div.barrow', h('span', BB.testName(k)), h('div.meter', h('i', { style: { width: Math.min(100, Math.round((pc || 0) * 100)) + '%' } })), h('b.num', BB.pct(pc))); }));
}

/* ---------------------------------------------------------------- các thẻ khác */
function tabBuoi() { const tr = st.d.trainings || []; return h('div.col', { style: { gap: '14px' } }, tr.length ? tr.map(trainingCard) : h('p.mute', 'Chưa có buổi tập nào.')); }
function alertRow(a) {
  return h('div.alert.' + a.severity + (a.resolved ? '.done' : ''),
    h('div', { style: { fontSize: '24px' } }, a.severity === 'high' ? '🚨' : a.severity === 'medium' ? '⚠️' : 'ℹ️'),
    h('div.grow', h('div.row', h('span.tag' + (a.severity === 'high' ? '.bad' : '.warn'), BB.SEV[a.severity]), h('span.small.mute', BB.when(a.created))), h('p', { style: { marginTop: '6px' } }, a.message),
      a.resolved ? h('div.small.mute', 'Đã xử lý bởi ' + (a.resolved_by || '')) : null),
    a.resolved ? null : h('button.btn.sm', { onclick: async () => { try { await api('/api/alerts/' + a.id + '/resolve', {}); } catch (e) { err(e); } } }, 'Đã xử lý'));
}
function tabCanhBao() { const al = st.d.alerts || []; return h('div.col', { style: { gap: '10px' } }, al.length ? al.map(alertRow) : h('p.mute', 'Chưa có cảnh báo nào.')); }
function tabDeXuat() {
  const pr = st.d.proposals || [], pend = pr.filter(x => x.status === 'pending'), old = pr.filter(x => x.status !== 'pending');
  const row = x => h('div.card.row', h('span', { style: { fontSize: '26px' } }, LV(x.to_level) > LV(x.from_level) ? '📈' : '📉'),
    h('div.grow', h('b', x.ex + '. ' + BB.EXS[x.ex].name + ': mức ' + x.from_level + ' → ' + x.to_level), h('div.small.mute', BB.EXS[x.ex].L[x.to_level].label + ' · ' + x.reason + ' · ' + BB.when(x.created)),
      x.status !== 'pending' ? h('div.small', { style: { marginTop: '4px' } }, h('span.tag' + (x.status === 'approved' ? '.ok' : '.gray'), { approved: 'Đã duyệt', rejected: 'Không duyệt', replaced: 'Đã thay bằng đề xuất mới' }[x.status]), x.decided_by ? ' bởi ' + x.decided_by : '') : null),
    x.status === 'pending' && isCV() ? h('div.row', h('button.btn.ghost.sm', { onclick: () => decide(x, false) }, 'Không duyệt'), h('button.btn.sm', { onclick: () => decide(x, true) }, 'Duyệt')) : null);
  return h('div.col', { style: { gap: '10px' } },
    h('p.mute', 'App chỉ đề xuất: lên mức khi 2 buổi gần nhất hoàn thành từ 90% và đau không quá 2/10; xuống mức khi hoàn thành dưới 50% hoặc phải dừng bài. Chuyên viên duyệt thì mức tập bên App đổi ngay.'),
    !isCV() && pend.length ? h('p.notice', 'Chỉ chuyên viên mới duyệt được đề xuất.') : null,
    pend.length ? pend.map(row) : h('p.mute', 'Không có đề xuất nào đang chờ.'), old.length ? [h('h2', { style: { marginTop: '10px' } }, 'Đã xử lý'), old.map(row)] : null);
}
const LV = l => 'ABC'.indexOf(l);
async function decide(x, approve) { try { await api('/api/proposals/' + x.id + '/decide', { approve: approve }); BB.toast(approve ? 'Đã duyệt. Mức tập bên App đã đổi.' : 'Đã ghi nhận không duyệt.', 'ok'); } catch (e) { err(e); } }
function tabTuan() {
  const ts = st.d.tests || [];
  if (!ts.length) return h('div.card', h('b', 'Chưa có kiểm tra tuần.'), h('p.mute', 'Người tập làm "Kiểm tra tuần" trên App: đo cả hai tay, tay lành trước, tay yếu sau.'));
  const t = ts[0], m = t.data.metrics || {};
  const keys = BB.TEST.map(x => x.key).concat(['grip_sd']).filter(k => m[k]);
  return h('div.col', { style: { gap: '14px' } },
    h('div.card.col', h('div.row.space', h('h2', 'Lần gần nhất: ' + BB.date(t.created)), h('span.small.mute', 'Ghi bởi ' + t.author)),
      (t.data.warnings || []).map(w => h('div.notice', w)),
      h('div.tblwrap', h('table.tbl', h('thead', h('tr', h('th', 'Số đo'), h('th.num', 'Tay lành'), h('th.num', 'Tay yếu'), h('th.num', '% tay lành'), h('th', ''))),
        h('tbody', keys.map(k => { const x = m[k], u = BB.testUnit(k), dd = u === 'kg' || u === 's' ? 2 : 0, pc = BB.vsPct(k, x.healthy, x.weak);
          return h('tr', h('td', BB.testName(k), x.trials ? h('div.small.mute', 'Các lần: ' + ['healthy', 'weak'].map(s => (x.trials[s] || []).map(v => BB.fmt(v, 1)).join('/')).join(' | ')) : null),
            h('td.num', BB.fmt(x.healthy, dd) + ' ' + u), h('td.num', BB.fmt(x.weak, dd) + ' ' + u), h('td.num', h('b', BB.pct(pc))),
            h('td.small', pc != null ? 'Tay yếu bằng ' + Math.round(pc * 100) + '% tay lành' + (BB.isLower(k) ? ' (số nhỏ là tốt)' : '') : '')); }))))),
    ts.length > 1 ? h('div.card.col', h('h2', 'Các lần trước'), h('div.tblwrap', h('table.tbl', h('thead', h('tr', h('th', 'Ngày'), h('th.num', 'Lực nắm'), h('th.num', 'Góc nâng tay'), h('th.num', 'Thả lực'))),
      h('tbody', ts.map(x => { const mm = x.data.metrics || {}; const c = k => mm[k] ? BB.pct(BB.vsPct(k, mm[k].healthy, mm[k].weak)) : '—';
        return h('tr', h('td', BB.date(x.created)), h('td.num', c('grip')), h('td.num', c('raise')), h('td.num', c('release'))); }))))) : null);
}
function replyBox(compact) {
  const cv = isCV();
  const ta = h('textarea.inp', { rows: compact ? 2 : 3, placeholder: cv ? 'Phản hồi của chuyên viên cho gia đình và người tập…' : 'Lời động viên cho ' + st.p.call_name.toLowerCase() + '…', maxlength: 500 });
  const send = async text => { if (!text.trim()) return; try { await api('/api/patients/' + st.p.id + '/messages', { text: text }); ta.value = ''; } catch (e) { err(e); } };
  const chips = cv ? ['Tốt lắm, giữ nhịp này nhé.', 'Nếu đau tăng, tê hoặc sưng hãy dừng và báo tôi.', 'Tôi đã duyệt mức mới, tập chậm lúc đầu.'] : [st.p.call_name + ' giỏi quá! 👏', 'Tối nay con gọi nhé ❤️', 'Cả nhà tự hào về ' + st.p.call_name.toLowerCase() + '!'];
  return h('div.col', { style: { gap: '8px', marginTop: '10px' } }, h('div.chips', chips.map(c => h('button.btn.soft.sm', { type: 'button', onclick: () => send(c) }, c))),
    h('div.row', h('div.grow', ta), h('button.btn', { onclick: () => send(ta.value) }, cv ? 'Gửi phản hồi' : 'Gửi')));
}
function tabTin() {
  const ms = st.d.messages || [];
  return h('div.col', { style: { gap: '10px' } }, h('div.card', replyBox(false)),
    ms.length ? ms.map(m => { const cls = m.kind === 'auto' ? '.auto' : m.role === 'chuyenvien' ? '.cv' : '';
      return h('div.msg' + cls, h('div.row.space', h('span.who', m.kind === 'auto' ? m.text : m.author + ' · ' + ({ chuyenvien: 'chuyên viên', nguoinha: 'người nhà', nguoitap: 'người tập' }[m.role] || '')), h('span.small.mute', BB.when(m.created))),
        m.kind === 'auto' ? [h('div.small.mute', 'Phân tích tự động, chỉ để tham khảo; không thay thế chẩn đoán của bác sĩ.'), h('ul', m.lines.map(l => h('li', l)))] : h('p', { style: { marginTop: '4px' } }, m.text)); }) : h('p.mute', 'Chưa có tin nhắn.'));
}
function toggle(on, label, desc, key) {
  const b = h('button.toggle', { type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label, onclick: () => save({ [key]: !on }) });
  return h('div.switch', h('div', h('b', label), h('div.small.mute', desc)), b);
}
async function save(body) { try { st.p = await api('/api/patients/' + st.p.id + '/settings', body); BB.toast('Đã lưu. App người tập cập nhật ngay.', 'ok'); render(); } catch (e) { err(e); } }
function tabCaiDat() {
  const p = st.p, prog = BB.PROGRAMS[p.program];
  const limit = h('input.inp', { type: 'number', min: 0.5, max: 100, step: 0.5, value: p.force_limit, style: { maxWidth: '120px' } });
  const exs = BB.ORDER.filter(ex => prog.base.indexOf(ex) >= 0 || prog.force.indexOf(ex) >= 0);
  return h('div.col', { style: { gap: '14px' } },
    h('div.card.col', h('h2', 'Chương trình'),
      h('div.seg', Object.keys(BB.PROGRAMS).map(k => h('button', { type: 'button', 'aria-pressed': String(p.program === k), onclick: () => save({ program: k }) }, BB.PROGRAMS[k].name))),
      h('p.mute', prog.note)),
    h('div.card.col', h('h2', 'Khoá an toàn'),
      p.program === 'chanthuong' ? [toggle(p.force_allowed, 'Cho phép tập lực', 'Bác sĩ cho phép thì mở bài 3, 5, 6 và các trò có lực.', 'force_allowed'),
        h('div.switch', h('div', h('b', 'Giới hạn lực tối đa tuần này'), h('div.small.mute', 'Vượt mức này App nhắc "bóp nhẹ lại" và gửi cảnh báo.')), h('div.row', limit, h('span', 'kg'), h('button.btn.sm', { onclick: () => save({ force_limit: parseFloat(String(limit.value).replace(',', '.')) }) }, 'Lưu')))]
        : toggle(p.shoulder_unlocked, 'Mở khoá nâng tay quá vai', 'Khi chưa mở, bài Nâng tay giới hạn ngang vai (90°); vượt thì cảnh báo.', 'shoulder_unlocked'),
      toggle(p.demo_mode, 'Chế độ trình diễn', 'Rút gọn còn 2 hiệp × 3 lần, nghỉ 5 giây. Tắt để dùng liều thật 2 hiệp × 10 lần, nghỉ 30 giây.', 'demo_mode')),
    h('div.card.col', h('h2', 'Mức tập từng bài'), h('p.mute', 'Có thể đặt trực tiếp; thường thì duyệt theo đề xuất ở thẻ Đề xuất.'),
      h('div.tblwrap', h('table.tbl', h('tbody', exs.map(ex => { const E = BB.EXS[ex];
        return h('tr', h('td', h('b', ex + '. ' + E.name), h('div.small.mute', E.L[p.levels[ex]] ? E.L[p.levels[ex]].label : '')),
          h('td', h('div.seg', E.levels.split('').map(l => h('button', { type: 'button', 'aria-pressed': String(p.levels[ex] === l), title: E.L[l].label, onclick: () => save({ levels: { [ex]: l } }) }, l))))); }))))));
}

document.addEventListener('click', e => { if (st.feedOpen && bellBox && !bellBox.contains(e.target)) { st.feedOpen = false; renderBell(); } });
window.__bbWeb = { st: st, openPatient: openPatient };
boot();
})();
