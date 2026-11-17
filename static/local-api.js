/* Bốp Bốp – bản chạy hoàn toàn trong trình duyệt (dùng khi không có server.py, ví dụ trên GitHub Pages).
   Trả lời đúng các địa chỉ /api/... và cùng luật với server.py, nhưng dữ liệu nằm trong localStorage
   của trình duyệt đang mở. Thông báo trực tiếp giữa các tab đi qua BroadcastChannel. */
'use strict';
(function () {
  const KEY = 'bb.local.db', SID = 'bb.local.sid', CH = 'bopbop-local', EVKEY = 'bb.local.ev';
  const SESSION_DAYS = 30;
  const LEVELS = { 1: 'ABC', 2: 'ABC', 3: 'ABC', 4: 'ABC', 5: 'ABC', 6: 'ABC', 7: 'ABC', 8: 'BC', 9: 'BC' };
  const EX_NAMES = { 1: 'Nâng tay', 2: 'Trượt tay trên bàn', 3: 'Co duỗi khuỷu', 4: 'Mở và nắm bàn tay', 5: 'Bóp bóng',
    6: 'Kẹp và thả vật', 7: 'Duỗi cổ tay', 8: 'Xoay cẳng tay', 9: 'Thả lực nhanh' };
  const PROGRAMS = { dotquy: { base: [1, 2, 3, 4, 5, 6, 7, 8, 9], force: [] }, chanthuong: { base: [4, 7, 8], force: [3, 5, 6] } };
  const DEFAULT_LEVELS = {
    dotquy: { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A', 7: 'A', 8: 'B', 9: 'B' },
    chanthuong: { 1: 'B', 2: 'B', 3: 'A', 4: 'B', 5: 'A', 6: 'A', 7: 'A', 8: 'B', 9: 'B' },
  };
  const ALERT_TYPES = { pain_rest: 'medium', pain_stop: 'medium', stroke_115: 'high', injury_symptom: 'high',
    shoulder_limit: 'medium', force_limit: 'medium', force_locked: 'low' };
  const CALL_NAMES = ['Bố', 'Mẹ', 'Ông', 'Bà', 'Anh', 'Chị', 'Cô', 'Chú'];
  const TEST_KEYS = ['grip', 'pinch', 'raise', 'wrist', 'pron', 'sup', 'open', 'release', 'pick60', 'grip_sd'];

  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const now = () => Date.now() / 1000;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const copy = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const desc = (a, b) => (b.created - a.created) || (b.id - a.id);

  /* ---------------------------------------------------------------- lưu trữ */
  const mem = {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return has(mem, k) ? mem[k] : null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { if (e && e.name === 'QuotaExceededError') return false; mem[k] = v; return true; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };
  const blank = () => ({ v: 1, seq: 0, accounts: [], auth: [], patients: [], access: [], trainings: [], alerts: [], proposals: [], tests: [], messages: [] });
  function load() {
    try { const d = JSON.parse(ls.get(KEY)); if (d && Array.isArray(d.accounts)) return Object.assign(blank(), d); } catch (e) { /* dữ liệu hỏng: bắt đầu lại */ }
    return blank();
  }
  function save(d) { if (!ls.set(KEY, JSON.stringify(d))) throw new ApiError(507, 'Bộ nhớ trình duyệt đã đầy, không lưu được.'); }
  const nextId = d => ++d.seq;

  /* ---------------------------------------------------------------- mật khẩu, mã ngẫu nhiên */
  const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
  const hex = b => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  const unhex = s => new Uint8Array((s.match(/../g) || []).map(x => parseInt(x, 16)));
  async function hashPw(pw, salt) {
    const enc = new TextEncoder().encode(pw);
    if (crypto.subtle) {
      const key = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveBits']);
      return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 120000 }, key, 256));
    }
    /* trang mở qua http thường (không có crypto.subtle): băm đơn giản, chỉ đủ cho bản thử trên một máy */
    const bytes = Array.from(enc).concat(Array.from(unhex(salt)));
    let x = 0x811c9dc5;
    for (let r = 0; r < 2000; r++) for (const c of bytes) { x ^= c; x = Math.imul(x, 0x01000193) >>> 0; }
    return 'weak' + x.toString(16);
  }
  function newCode(d, col) {
    const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = Array.from(rand(6), b => al[b % al.length]).join('');
      if (!d.patients.some(p => p[col] === code)) return code;
    }
  }

  /* ---------------------------------------------------------------- kiểm tra dữ liệu (giống server.py) */
  function text(v, field, lo, hi) {
    lo = lo == null ? 1 : lo; hi = hi == null ? 200 : hi;
    if (typeof v !== 'string') throw new ApiError(400, 'Thiếu ' + field + '.');
    v = v.trim();
    const n = Array.from(v).length;
    if (n < lo || n > hi) throw new ApiError(400, field + ' cần từ ' + lo + ' đến ' + hi + ' ký tự.');
    return v;
  }
  function num(v, lo, hi, def) {
    if (typeof v !== 'number' || !isFinite(v)) {
      if (def !== undefined) return def;
      throw new ApiError(400, 'Số không hợp lệ.');
    }
    return Math.max(lo, Math.min(hi, v));
  }
  const int = v => Math.trunc(v);
  const programExs = p => PROGRAMS[p.program].base.concat(p.force_allowed ? PROGRAMS[p.program].force : []).sort((a, b) => a - b);

  /* ---------------------------------------------------------------- phiên đăng nhập */
  function account(d) {
    const tok = ls.get(SID);
    if (!tok) return null;
    const t = d.auth.find(x => x.token === tok);
    if (!t || now() - t.created > SESSION_DAYS * 86400) return null;
    return d.accounts.find(a => a.id === t.account_id) || null;
  }
  function startSession(d, accId) {
    const token = hex(rand(32));
    d.auth.push({ token: token, account_id: accId, created: now() });
    ls.set(SID, token);
  }

  /* ---------------------------------------------------------------- người tập, quyền */
  function patientDict(p, role) {
    const o = { id: p.id, name: p.name, call_name: p.call_name, sex: p.sex, age: p.age, program: p.program,
      levels: copy(p.levels), force_allowed: !!p.force_allowed, shoulder_unlocked: !!p.shoulder_unlocked,
      force_limit: p.force_limit, demo_mode: !!p.demo_mode, role: role, exercises: programExs(p) };
    if (role === 'chuyenvien') o.code_cv = p.code_cv;
    o.code_nn = p.code_nn;
    return o;
  }
  function getAccess(d, acc, pid, roles) {
    const a = d.access.find(x => x.account_id === acc.id && x.patient_id === pid);
    const p = a && d.patients.find(x => x.id === pid);
    if (!p) throw new ApiError(404, 'Không tìm thấy người tập.');
    if (roles && roles.indexOf(a.role) < 0) throw new ApiError(403, 'Chỉ chuyên viên mới làm được việc này.');
    return { p: p, role: a.role };
  }
  function summaryFor(d, pid) {
    const last = d.trainings.filter(t => t.patient_id === pid).sort(desc)[0];
    return {
      last_training: last ? { created: last.created, status: last.status, avg_completion: last.avg_completion } : null,
      open_alerts: d.alerts.filter(a => a.patient_id === pid && !a.resolved).length,
      pending_proposals: d.proposals.filter(x => x.patient_id === pid && x.status === 'pending').length,
    };
  }
  function patientFull(d, p, role) {
    const o = patientDict(p, role);
    o.summary = summaryFor(d, p.id);
    const t = d.tests.filter(x => x.patient_id === p.id).sort(desc)[0];
    o.latest_test = t ? { id: t.id, created: t.created, data: copy(t.data) } : null;
    return o;
  }
  function notify(ctx, pid, kind) {
    ctx.events.push({ type: kind, patient_id: pid, t: now(), accounts: ctx.d.access.filter(a => a.patient_id === pid).map(a => a.account_id) });
  }

  /* ---------------------------------------------------------------- buổi tập */
  function cleanResults(raw, p) {
    if (!Array.isArray(raw) || raw.length > 9) throw new ApiError(400, 'Kết quả buổi tập không hợp lệ.');
    const allowed = programExs(p), seen = [], out = [];
    raw.forEach(r => {
      if (!isObj(r)) throw new ApiError(400, 'Kết quả buổi tập không hợp lệ.');
      const ex = r.ex;
      if (!Number.isInteger(ex) || allowed.indexOf(ex) < 0 || seen.indexOf(ex) >= 0) throw new ApiError(400, 'Bài tập không thuộc chương trình hiện tại.');
      const lvl = r.level;
      if (typeof lvl !== 'string' || lvl.length !== 1 || LEVELS[ex].indexOf(lvl) < 0) throw new ApiError(400, 'Mức tập không hợp lệ.');
      seen.push(ex);
      const meas = (Array.isArray(r.measures) ? r.measures : []).slice(0, 6).filter(isObj).map(m => ({
        key: String(m.key == null ? '' : m.key).slice(0, 20), label: String(m.label == null ? '' : m.label).slice(0, 60),
        value: num(m.value, -1e4, 1e4, 0), unit: String(m.unit == null ? '' : m.unit).slice(0, 12) }));
      out.push({
        ex: ex, level: lvl,
        planned: int(num(r.planned, 0, 1000, 0)), done: int(num(r.done, 0, 1000, 0)),
        completion: num(r.completion, 0, 1, 0), stopped: !!r.stopped,
        pain: r.pain == null ? null : int(num(r.pain, 0, 10)), measures: meas,
        vs_healthy: r.vs_healthy == null ? null : num(r.vs_healthy, 0, 5, 0),
        warnings: (Array.isArray(r.warnings) ? r.warnings : []).slice(0, 5).filter(w => typeof w === 'string').map(w => w.slice(0, 120)),
        skipped: !!r.skipped,
      });
    });
    return out;
  }
  function cleanAnswers(raw) {
    if (!isObj(raw)) return {};
    const out = {};
    ['pain', 'fatigue'].forEach(k => { if (raw[k] != null) out[k] = int(num(raw[k], 0, 10)); });
    ['weak_sudden', 'swelling', 'pain_up', 'numb'].forEach(k => { if (has(raw, k)) out[k] = !!raw[k]; });
    return out;
  }
  /* App chỉ ĐỀ XUẤT; chuyên viên duyệt trên web. */
  function makeProposals(d, p, results) {
    const levels = p.levels || {}, made = [];
    const rows = d.trainings.filter(t => t.patient_id === p.id && t.status !== 'blocked').sort(desc).slice(0, 12);
    results.forEach(r => {
      const ex = r.ex, lvl = r.level, cur = has(levels, String(ex)) ? levels[String(ex)] : lvl;
      if (lvl !== cur) return;
      const hist = [];
      for (const row of rows) {
        (row.results || []).forEach(x => { if (x.ex === ex && x.level === cur) hist.push(x); });
        if (hist.length >= 2) break;
      }
      const ls_ = LEVELS[ex], i = ls_.indexOf(cur);
      let to = null, reason = '';
      if ((r.completion < 0.5 || r.stopped) && i > 0) {
        to = ls_[i - 1];
        reason = r.stopped ? 'Phải dừng bài giữa chừng.' : 'Chỉ hoàn thành ' + Math.round(r.completion * 100) + '% buổi gần nhất.';
      } else if (hist.length >= 2 && i < ls_.length - 1 && hist.slice(0, 2).every(h => (h.completion || 0) >= 0.9 && h.pain != null && h.pain <= 2)) {
        to = ls_[i + 1];
        reason = 'Hai buổi gần nhất đều hoàn thành từ 90% và đau không quá 2/10.';
      }
      if (!to) return;
      const pend = d.proposals.filter(x => x.patient_id === p.id && x.ex === ex && x.status === 'pending').sort((a, b) => a.id - b.id)[0];
      if (pend && pend.to_level === to) return;
      if (pend) { pend.status = 'replaced'; pend.decided_at = now(); }
      d.proposals.push({ id: nextId(d), patient_id: p.id, created: now(), ex: ex, from_level: cur, to_level: to, reason: reason,
        status: 'pending', decided_by: null, decided_at: null });
      made.push({ ex: ex, from: cur, to: to, up: ls_.indexOf(to) > i });
    });
    return made;
  }
  function analysisLines(p, status, stopReason, pre, post, results, proposals) {
    const call = p.call_name, lines = [];
    if (status === 'blocked') {
      lines.push('Hôm nay ' + call.toLowerCase() + ' không tập: ' + (stopReason || 'khoá an toàn') + '.');
      lines.push('Gia đình nên hỏi thăm và theo dõi thêm; nếu có dấu hiệu bất thường hãy liên hệ bác sĩ.');
      return lines;
    }
    const n = results.length;
    const avg = n ? Math.round(results.reduce((s, r) => s + r.completion, 0) / n * 100) : 0;
    lines.push(call + ' tập ' + n + ' bài, hoàn thành trung bình ' + avg + '%.');
    if (status === 'stopped') lines.push('Buổi tập dừng giữa chừng: ' + (stopReason || 'theo khoá an toàn') + '.');
    if (n) {
      const best = results.reduce((a, r) => r.completion > a.completion ? r : a);
      const worst = results.reduce((a, r) => r.completion < a.completion ? r : a);
      lines.push('Tốt nhất: ' + EX_NAMES[best.ex] + ' (mức ' + best.level + ', ' + Math.round(best.completion * 100) + '%).');
      if (worst.completion < 0.8 && worst !== best) lines.push('Cần chú ý: ' + EX_NAMES[worst.ex] + ' (mức ' + worst.level + ', ' + Math.round(worst.completion * 100) + '%).');
    }
    if (has(pre, 'pain') && has(post, 'pain')) {
      const dd = post.pain - pre.pain;
      lines.push('Đau đầu buổi ' + pre.pain + '/10, cuối buổi ' + post.pain + '/10' + (dd > 0 ? ' (tăng ' + dd + ' điểm).' : '.'));
    }
    if (has(post, 'fatigue')) lines.push('Mức mệt cuối buổi: ' + post.fatigue + '/10.');
    const warns = results.reduce((s, r) => s + r.warnings.length, 0);
    if (warns) lines.push('Có ' + warns + ' cảnh báo an toàn trong buổi (xem mục Cảnh báo).');
    if (proposals.length) {
      const ups = proposals.filter(x => x.up).map(x => EX_NAMES[x.ex].toLowerCase());
      const downs = proposals.filter(x => !x.up).map(x => EX_NAMES[x.ex].toLowerCase());
      const parts = [];
      if (ups.length) parts.push('lên mức ' + ups.join(', '));
      if (downs.length) parts.push('xuống mức ' + downs.join(', '));
      lines.push('Đã gửi đề xuất cho chuyên viên: ' + parts.join('; ') + '.');
    }
    return lines;
  }

  /* ---------------------------------------------------------------- các địa chỉ /api */
  const ROUTES = [];
  const route = (method, pattern, fn, opts) => ROUTES.push({ method: method, rx: new RegExp('^' + pattern + '$'), fn: fn, open: !!(opts && opts.open), prep: opts && opts.prep });

  route('POST', '/api/register', (c) => {
    const d = c.d, x = c.prep;
    if (d.accounts.some(a => a.username === x.username)) throw new ApiError(409, 'Tên đăng nhập đã có người dùng.');
    const id = nextId(d);
    d.accounts.push({ id: id, username: x.username, name: x.name, salt: x.salt, hash: x.hash, created: now() });
    startSession(d, id);
    return { id: id, username: x.username, name: x.name };
  }, { open: true, prep: async (b) => {
    const username = text(b.username, 'Tên đăng nhập', 3, 40).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(username)) throw new ApiError(400, 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch.');
    const pw = b.password;
    if (typeof pw !== 'string' || pw.length < 6 || pw.length > 200) throw new ApiError(400, 'Mật khẩu cần ít nhất 6 ký tự.');
    const name = text(b.name, 'Tên hiển thị', 1, 60);
    if (load().accounts.some(a => a.username === username)) throw new ApiError(409, 'Tên đăng nhập đã có người dùng.');
    const salt = hex(rand(16));
    return { username: username, name: name, salt: salt, hash: await hashPw(pw, salt) };
  } });

  route('POST', '/api/login', (c) => {
    const row = c.d.accounts.find(a => a.username === c.prep.username);
    if (!row || row.hash !== c.prep.hash) throw new ApiError(401, 'Sai tên đăng nhập hoặc mật khẩu.');
    startSession(c.d, row.id);
    return { id: row.id, username: row.username, name: row.name };
  }, { open: true, prep: async (b) => {
    const username = String(b.username == null ? '' : b.username).trim().toLowerCase();
    const pw = String(b.password == null ? '' : b.password);
    const row = load().accounts.find(a => a.username === username);
    if (!row) { await new Promise(r => setTimeout(r, 300)); throw new ApiError(401, 'Sai tên đăng nhập hoặc mật khẩu.'); }
    return { username: username, hash: await hashPw(pw, row.salt) };
  } });

  route('POST', '/api/logout', (c) => {
    const tok = ls.get(SID);
    if (tok) c.d.auth = c.d.auth.filter(t => t.token !== tok);
    ls.del(SID);
    return { ok: true };
  }, { open: true });

  route('GET', '/api/me', (c) => ({ id: c.acc.id, username: c.acc.username, name: c.acc.name }));

  route('GET', '/api/patients', (c) => {
    const d = c.d;
    return d.access.filter(a => a.account_id === c.acc.id)
      .map(a => ({ a: a, p: d.patients.find(p => p.id === a.patient_id) })).filter(x => x.p)
      .sort((x, y) => x.p.created - y.p.created || x.p.id - y.p.id)
      .map(x => { const o = patientDict(x.p, x.a.role); o.summary = summaryFor(d, x.p.id); return o; });
  });

  route('POST', '/api/patients', (c) => {
    const d = c.d, b = c.body;
    const name = text(b.name, 'Tên người tập', 1, 60);
    const call = CALL_NAMES.indexOf(b.call_name) >= 0 ? b.call_name : 'Bố';
    const sex = b.sex === 'F' ? 'F' : 'M';
    const age = int(num(b.age, 1, 120, 60));
    const program = has(PROGRAMS, b.program) ? b.program : 'dotquy';
    const role = b.my_role === 'nguoinha' ? 'nguoinha' : 'chuyenvien';
    const levels = {};
    Object.keys(DEFAULT_LEVELS[program]).forEach(k => { levels[k] = DEFAULT_LEVELS[program][k]; });
    const p = { id: nextId(d), name: name, call_name: call, sex: sex, age: age, program: program, levels: levels,
      force_allowed: false, shoulder_unlocked: false, force_limit: 5, demo_mode: true,
      code_cv: newCode(d, 'code_cv'), code_nn: '', created: now() };
    p.code_nn = newCode(d, 'code_nn');
    d.patients.push(p);
    d.access.push({ account_id: c.acc.id, patient_id: p.id, role: role });
    return patientDict(p, role);
  });

  route('POST', '/api/join', (c) => {
    const d = c.d, code = String(c.body.code == null ? '' : c.body.code).trim().toUpperCase();
    const p = code && d.patients.find(x => x.code_cv === code || x.code_nn === code);
    if (!p) throw new ApiError(404, 'Mã không đúng.');
    const role = p.code_cv === code ? 'chuyenvien' : 'nguoinha';
    d.access = d.access.filter(a => !(a.account_id === c.acc.id && a.patient_id === p.id));
    d.access.push({ account_id: c.acc.id, patient_id: p.id, role: role });
    notify(c, p.id, 'patient');
    return { patient_id: p.id, role: role };
  });

  route('GET', '/api/patients/(\\d+)', (c, pid) => {
    const g = getAccess(c.d, c.acc, +pid);
    return patientFull(c.d, g.p, g.role);
  });

  route('POST', '/api/patients/(\\d+)/settings', (c, pid) => {
    const d = c.d, b = c.body, g = getAccess(d, c.acc, +pid, ['chuyenvien']), p = g.p;
    let changed = false;
    if (typeof b.program === 'string' && has(PROGRAMS, b.program)) { p.program = b.program; changed = true; }
    ['force_allowed', 'shoulder_unlocked', 'demo_mode'].forEach(k => { if (has(b, k)) { p[k] = !!b[k]; changed = true; } });
    if (has(b, 'force_limit')) { p.force_limit = Math.round(num(b.force_limit, 0.5, 100) * 10) / 10; changed = true; }
    if (isObj(b.levels)) {
      Object.keys(b.levels).forEach(k => {
        const v = b.levels[k];
        if (/^\d+$/.test(k) && has(LEVELS, +k) && typeof v === 'string' && v.length === 1 && LEVELS[+k].indexOf(v) >= 0) p.levels[String(+k)] = v;
      });
      changed = true;
    }
    if (changed) notify(c, p.id, 'patient');
    return patientFull(d, p, g.role);
  });

  route('GET', '/api/patients/(\\d+)/trainings', (c, pid) => {
    const p = getAccess(c.d, c.acc, +pid).p;
    return c.d.trainings.filter(t => t.patient_id === p.id).sort(desc).slice(0, 60).map(t => ({
      id: t.id, created: t.created, author: t.author, status: t.status, stop_reason: t.stop_reason,
      pre: copy(t.pre), post: copy(t.post), results: copy(t.results), avg_completion: t.avg_completion }));
  });

  route('POST', '/api/patients/(\\d+)/trainings', (c, pid) => {
    const d = c.d, b = c.body, p = getAccess(d, c.acc, +pid).p;
    const status = ['done', 'stopped', 'blocked'].indexOf(b.status) >= 0 ? b.status : 'done';
    const results = cleanResults(b.results || [], p);
    const pre = cleanAnswers(b.pre), post = cleanAnswers(b.post);
    const stopReason = String(b.stop_reason || '').slice(0, 200) || null;
    const avg = results.length ? results.reduce((s, r) => s + r.completion, 0) / results.length : 0;
    const id = nextId(d);
    d.trainings.push({ id: id, patient_id: p.id, author: c.acc.name, created: now(), status: status, stop_reason: stopReason,
      pre: pre, post: post, results: results, avg_completion: avg });
    const proposals = status !== 'blocked' ? makeProposals(d, p, results) : [];
    const call = p.call_name;
    const title = { done: call + ' vừa tập xong!', stopped: call + ' đã dừng buổi tập giữa chừng', blocked: call + ' không tập hôm nay' }[status];
    const lines = analysisLines(p, status, stopReason, pre, post, results, proposals);
    d.messages.push({ id: nextId(d), patient_id: p.id, created: now(), author: 'Bốp Bốp', role: 'app', kind: 'auto', text: title, lines: lines });
    notify(c, p.id, 'training');
    return { id: id, proposals: proposals, lines: lines };
  });

  route('GET', '/api/patients/(\\d+)/alerts', (c, pid) => {
    const p = getAccess(c.d, c.acc, +pid).p;
    return c.d.alerts.filter(a => a.patient_id === p.id).sort(desc).slice(0, 100).map(copy);
  });

  route('POST', '/api/patients/(\\d+)/alerts', (c, pid) => {
    const d = c.d, p = getAccess(d, c.acc, +pid).p, typ = c.body.type;
    if (typeof typ !== 'string' || !has(ALERT_TYPES, typ)) throw new ApiError(400, 'Loại cảnh báo không hợp lệ.');
    const msg = text(c.body.message, 'Nội dung', 1, 300);
    const id = nextId(d);
    d.alerts.push({ id: id, patient_id: p.id, created: now(), type: typ, severity: ALERT_TYPES[typ], message: msg, resolved: 0, resolved_by: null });
    notify(c, p.id, 'alert');
    return { id: id };
  });

  route('POST', '/api/alerts/(\\d+)/resolve', (c, aid) => {
    const d = c.d, a = d.alerts.find(x => x.id === +aid);
    if (!a) throw new ApiError(404, 'Không tìm thấy cảnh báo.');
    getAccess(d, c.acc, a.patient_id);
    a.resolved = 1; a.resolved_by = c.acc.name;
    notify(c, a.patient_id, 'alert');
    return { ok: true };
  });

  route('GET', '/api/patients/(\\d+)/proposals', (c, pid) => {
    const p = getAccess(c.d, c.acc, +pid).p;
    return c.d.proposals.filter(x => x.patient_id === p.id)
      .sort((a, b) => ((b.status === 'pending') - (a.status === 'pending')) || desc(a, b)).slice(0, 100).map(copy);
  });

  route('POST', '/api/proposals/(\\d+)/decide', (c, prid) => {
    const d = c.d, row = d.proposals.find(x => x.id === +prid);
    if (!row) throw new ApiError(404, 'Không tìm thấy đề xuất.');
    const p = getAccess(d, c.acc, row.patient_id, ['chuyenvien']).p;
    if (row.status !== 'pending') throw new ApiError(409, 'Đề xuất này đã được xử lý.');
    const approve = !!c.body.approve;
    row.status = approve ? 'approved' : 'rejected'; row.decided_by = c.acc.name; row.decided_at = now();
    if (approve) p.levels[String(row.ex)] = row.to_level;
    notify(c, p.id, 'patient');
    return { ok: true };
  });

  route('GET', '/api/patients/(\\d+)/tests', (c, pid) => {
    const p = getAccess(c.d, c.acc, +pid).p;
    return c.d.tests.filter(t => t.patient_id === p.id).sort(desc).slice(0, 30)
      .map(t => ({ id: t.id, created: t.created, author: t.author, data: copy(t.data) }));
  });

  route('POST', '/api/patients/(\\d+)/tests', (c, pid) => {
    const d = c.d, p = getAccess(d, c.acc, +pid).p, data = c.body.metrics;
    if (!isObj(data)) throw new ApiError(400, 'Thiếu số đo.');
    const clean = {};
    TEST_KEYS.forEach(k => {
      const m = data[k];
      if (!isObj(m)) return;
      const item = { healthy: num(m.healthy, 0, 1000), weak: num(m.weak, 0, 1000) };
      ['healthy', 'weak'].forEach(side => {
        const tr = isObj(m.trials) ? m.trials[side] : null;
        if (Array.isArray(tr)) { item.trials = item.trials || {}; item.trials[side] = tr.slice(0, 5).map(x => num(x, 0, 1000)); }
      });
      clean[k] = item;
    });
    if (!Object.keys(clean).length) throw new ApiError(400, 'Chưa có số đo nào.');
    const warns = (Array.isArray(c.body.warnings) ? c.body.warnings : []).slice(0, 10).filter(w => typeof w === 'string').map(w => w.slice(0, 200));
    const id = nextId(d);
    d.tests.push({ id: id, patient_id: p.id, created: now(), author: c.acc.name, data: { metrics: clean, warnings: warns } });
    notify(c, p.id, 'test');
    return { id: id };
  });

  route('GET', '/api/patients/(\\d+)/messages', (c, pid) => {
    const p = getAccess(c.d, c.acc, +pid).p;
    return c.d.messages.filter(m => m.patient_id === p.id).sort(desc).slice(0, 80).map(m => Object.assign(copy(m), { lines: copy(m.lines) || [] }));
  });

  route('POST', '/api/patients/(\\d+)/messages', (c, pid) => {
    const d = c.d, g = getAccess(d, c.acc, +pid), p = g.p;
    const msg = text(c.body.text, 'Lời nhắn', 1, 500);
    const role = c.body.via === 'app' ? 'nguoitap' : g.role;
    const kind = role === 'chuyenvien' ? 'reply' : 'cheer';
    d.messages.push({ id: nextId(d), patient_id: p.id, created: now(), author: role === 'nguoitap' ? p.call_name : c.acc.name,
      role: role, kind: kind, text: msg, lines: null });
    notify(c, p.id, 'message');
    return { ok: true };
  });

  /* Thông báo gần đây của mọi người tập mà tài khoản này được xem. */
  route('GET', '/api/feed', (c) => {
    const d = c.d;
    const pids = d.access.filter(a => a.account_id === c.acc.id).map(a => a.patient_id);
    if (!pids.length) return [];
    const names = {};
    d.patients.forEach(p => { if (pids.indexOf(p.id) >= 0) names[p.id] = p.call_name + ' ' + p.name; });
    const mine = x => pids.indexOf(x.patient_id) >= 0;
    const items = [];
    d.alerts.filter(mine).sort(desc).slice(0, 30).forEach(r => items.push({ kind: 'alert', id: r.id, patient_id: r.patient_id, created: r.created,
      severity: r.severity, text: r.message, resolved: !!r.resolved, who: names[r.patient_id] || '' }));
    d.messages.filter(mine).sort(desc).slice(0, 30).forEach(r => items.push({ kind: 'message', id: r.id, patient_id: r.patient_id, created: r.created,
      author: r.author, text: r.text, who: names[r.patient_id] || '' }));
    d.proposals.filter(x => mine(x) && x.status === 'pending').sort(desc).slice(0, 30).forEach(r => items.push({ kind: 'proposal', id: r.id,
      patient_id: r.patient_id, created: r.created, text: 'Đề xuất ' + EX_NAMES[r.ex] + ': mức ' + r.from_level + ' → ' + r.to_level, who: names[r.patient_id] || '' }));
    items.sort((a, b) => b.created - a.created);
    return items.slice(0, 40);
  });

  /* ---------------------------------------------------------------- thông báo trực tiếp giữa các tab */
  const subs = new Set();
  let chIn = null, chOut = null;
  try { if ('BroadcastChannel' in window) { chIn = new BroadcastChannel(CH); chOut = new BroadcastChannel(CH); } } catch (e) { chIn = chOut = null; }
  function deliver(ev) {
    if (!ev || !subs.size) return;
    const acc = account(load());
    if (!acc || (ev.accounts || []).indexOf(acc.id) < 0) return;
    const out = { type: ev.type, patient_id: ev.patient_id, t: ev.t };
    subs.forEach(fn => { try { fn(out); } catch (e) { setTimeout(() => { throw e; }); } });
  }
  if (chIn) chIn.onmessage = e => deliver(e.data);
  else window.addEventListener('storage', e => { if (e.key === EVKEY && e.newValue) { try { deliver(JSON.parse(e.newValue).ev); } catch (x) { /* bỏ qua */ } } });
  function broadcast(ev) {
    if (chOut) { chOut.postMessage(ev); return; }   /* chIn của mọi tab (kể cả tab này) đều nhận */
    setTimeout(() => deliver(ev), 0);               /* không có BroadcastChannel: tự báo tab này, */
    ls.set(EVKEY, JSON.stringify({ ev: ev, n: hex(rand(4)) }));   /* các tab khác nghe sự kiện storage */
  }

  /* ---------------------------------------------------------------- cổng vào */
  async function handle(path, body) {
    const method = body ? 'POST' : 'GET';
    path = String(path).split('?')[0];
    body = body ? copy(body) : {};
    if (!isObj(body)) throw new ApiError(400, 'Dữ liệu không hợp lệ.');
    for (const r of ROUTES) {
      if (r.method !== method) continue;
      const mt = path.match(r.rx);
      if (!mt) continue;
      const prep = r.prep ? await r.prep(body) : null;
      /* từ đây chạy liền một mạch (không await) để hai tab không ghi đè dữ liệu của nhau */
      const d = load(), acc = account(d);
      if (!r.open && !acc) throw new ApiError(401, 'Chưa đăng nhập.');
      const ctx = { d: d, acc: acc, body: body, prep: prep, events: [] };
      const res = r.fn(ctx, ...mt.slice(1));
      if (method === 'POST') save(d);
      ctx.events.forEach(broadcast);
      return copy(res);
    }
    throw new ApiError(404, 'Không có địa chỉ này.');
  }
  function listen(fn) { subs.add(fn); return () => subs.delete(fn); }
  function reset() { ls.del(KEY); ls.del(SID); }

  window.BBLocal = { handle: handle, listen: listen, reset: reset };
})();
