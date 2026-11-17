/* Bốp Bốp – bộ chơi canvas cho bài tập, trò chơi và kiểm tra tuần.
   Bản thử dùng bàn phím, chuột hoặc chạm thay cho tín hiệu từ lõi/camera; mọi số đo là mô phỏng. */
'use strict';
(function () {
const W = 960, H = 600;
const C = { bop: '#FF6A1A', bopD: '#C2410C', bopS: '#FFE2CF', ink: '#231A14', mute: '#7A6B60', line: '#EBDDD1', paper: '#FFF8F1',
  ok: '#1E8E5A', okS: '#D8F2E4', warn: '#B7791F', bad: '#D92D20', core: '#7C5CFF', sky: '#DDEFFA', mat: '#CDEBE1', skin: '#F2C3A0' };
const FONT = '"Be Vietnam Pro","Segoe UI",system-ui,sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
/* độ lệch chuẩn sau khi bỏ đường xu hướng thẳng (lực vẫn đang tăng chậm) */
/* độ dao động lực: lấy chênh lệch giữa hai mẫu liên tiếp nên bỏ được phần lực đang tăng chậm */
const detrendSd = a => { const d = []; for (let i = 1; i < a.length; i++) d.push(a[i] - a[i - 1]); return sd(d) / Math.SQRT2; };
const FRUIT = { tao: { name: 'táo', col: '#E5484D' }, cam: { name: 'cam', col: '#F59E0B' }, chuoi: { name: 'chuối', col: '#F2D04B' }, banh: { name: 'bánh', col: '#B7794A' } };

BB.Play = function (canvas, cfg, on) {
  on = on || {};
  const g = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const K = cfg.kind, test = cfg.mode === 'test', free = cfg.mode === 'free';
  const T = cfg.target || 0, cap = cfg.cap || 10;
  const I = { up: false, down: false, left: false, right: false, sq: false, goal: null, auto: false, cx: W / 2, cy: H / 2 };
  const S = { t: 0, v: 0, F: 0, a: 0, max: 0, reps: [], ok: 0, done: false, msg: '', msgCls: '', msgT: 0, holdT: 0, warned: {}, score: 0, trials: [], sdv: [] };
  const R = { st: 'rest' };                 /* lần đang làm */
  const AU = { ph: 'go', t: 0 };            /* bộ tự chạy mô phỏng */
  const timeLimit = free ? (cfg.duration || 60) : test && K === 'pick' ? 60 : (cfg.fast ? cfg.reps * 2.6 : null);
  const say = (m, cls, t) => { S.msg = m; S.msgCls = cls || ''; S.msgT = t || 1.8; };
  const warn = (type, text) => { if (S.warned[type + R.n]) return; S.warned[type + R.n] = 1; say(text, 'bad', 2.5); if (on.warn) on.warn(type, text); };
  const repDone = (rep) => {
    S.reps.push(rep); if (rep.ok) { S.ok++; S.score++; }
    if (on.rep) on.rep(rep);
    if (!free && !test && S.reps.length >= cfg.reps) finishSoon();
  };
  let endAt = null;
  const finishSoon = () => { if (endAt == null) endAt = S.t + 0.8; };
  R.n = 0;

  /* ---------------- đưa tới góc/tầm/độ mở (rise) và xoay núm (steer) */
  function stepRise(dt) {
    const rate = cap / (cfg.load ? 2.6 : 1.7);
    if (I.goal != null) S.v += clamp(I.goal - S.v, -rate * dt, rate * dt);
    else if (I.up) S.v += rate * dt; else if (I.down) S.v -= rate * dt;
    S.v = clamp(S.v, 0, cap); S.max = Math.max(S.max, S.v);
    if (cfg.warnAbove && S.v > cfg.warnAbove) warn('shoulder', 'Quá ngang vai! Hạ tay xuống. Chuyên viên chưa mở khoá mức này.');
    if (test) return;
    const p = S.v / T;
    if (R.st === 'rest') { if (p > 0.3) Object.assign(R, { st: 'move', peak: S.v, t0: S.t, reached: false, hold: 0 }); }
    else {
      R.peak = Math.max(R.peak, S.v);
      if (R.st === 'move' && p >= 1) { R.reached = true; R.tReach = S.t - R.t0; if (cfg.hold) R.st = 'hold'; else { R.st = 'back'; R.ok = true; say('Đạt! Hạ xuống.', 'ok'); } }
      if (R.st === 'hold') { if (p >= 0.95) { R.hold += dt; if (R.hold >= cfg.hold) { R.st = 'back'; R.ok = true; say('Giữ đủ! Hạ xuống.', 'ok'); } } else if (p < 0.85) { R.st = 'back'; R.ok = false; say('Chưa giữ đủ thời gian.', 'warn'); } }
      if (p < 0.25) {
        if (R.ok || R.peak >= 0.5 * T) repDone({ ok: !!R.ok, peak: R.peak, tReach: R.tReach || null });
        else if (R.st !== 'rest') { /* chỉ là cử động nhỏ, không tính */ }
        if (!R.ok && R.peak >= 0.5 * T && !R.reached) say('Chưa tới đích.', 'warn');
        R.n++; Object.assign(R, { st: 'rest', ok: false, reached: false, tReach: null });
      }
    }
  }
  let side = 1;
  function stepSteer(dt) {
    const rate = cap / 1.4;
    if (I.goal != null) S.a += clamp(I.goal - S.a, -rate * dt, rate * dt);
    else { if (I.right) S.a += rate * dt; if (I.left) S.a -= rate * dt; }
    S.a = clamp(S.a, -cap, cap); S.v = S.a;
    S.pos = Math.max(S.pos || 0, S.a); S.neg = Math.max(S.neg || 0, -S.a);
    const p = S.a * side / T;
    if (R.st === 'rest') { if (p > 0.3) Object.assign(R, { st: 'move', peak: 0, hold: 0 }); }
    else {
      R.peak = Math.max(R.peak, Math.abs(S.a));
      if (R.st === 'move' && p >= 1) { if (cfg.hold) R.st = 'hold'; else { R.st = 'back'; R.ok = true; say('Qua cổng!', 'ok'); } }
      if (R.st === 'hold') { if (p >= 0.95) { R.hold += dt; if (R.hold >= cfg.hold) { R.st = 'back'; R.ok = true; say('Qua cổng! Về giữa đường.', 'ok'); } } else if (p < 0.8) R.st = 'move'; }
      if (R.st === 'back' && Math.abs(S.a) < 0.25 * T) { repDone({ ok: true, peak: R.peak, side: side }); side = -side; R.n++; R.st = 'rest'; R.ok = false; }
    }
  }

  /* ---------------- lực: bóp, kẹp, kéo, đẩy (force), Chim bay (track), Hái táo (rhythm), phản xạ (react) */
  const tremor = cap * (cfg.lag || 0) * 0.06;
  S.Ft = 0;
  function forceDyn(dt, goalNormal, upTau) {
    if (I.sq) {
      if (S.holdT === 0) S.eff = 0.9 + Math.random() * 0.12;   /* sức mỗi lần bóp hết sức khác nhau một chút */
      S.holdT += dt; const goal = (test || free) ? cap * S.eff : (S.holdT > 4 ? cap : Math.min(cap, goalNormal)); S.Ft += (goal - S.Ft) * ease(dt, upTau || 0.45);
    } else { S.holdT = 0; S.Ft -= S.Ft * ease(dt, 0.08 + (cfg.lag || 0) * 0.6); if (S.Ft < 0.01) S.Ft = 0; }
    S.F = S.Ft > 0.5 ? Math.max(0, S.Ft + tremor * (0.6 * Math.sin(S.t * 37.7) + 0.4 * (Math.random() * 2 - 1))) : S.Ft;
    S.max = Math.max(S.max, S.F);
    if (cfg.forceLimit && S.F > cfg.forceLimit) warn('force', 'Bóp nhẹ lại! Vượt giới hạn lực tuần này (' + BB.fmt(cfg.forceLimit, 1) + ' kg).');
  }
  function stepForce(dt) {
    forceDyn(dt, Math.max(T * 1.3, T + 0.4));
    if (test || cfg.maxMode) { /* đo lực tối đa: mỗi lần bóp rồi thả là một lần đo */
      if (R.st === 'rest') { if (S.F > 1) Object.assign(R, { st: 'sq', peak: 0, buf: [] }); }
      else { R.peak = Math.max(R.peak, S.F); if (I.sq && S.holdT > 1.5) R.buf.push(S.F);
        if (S.F < Math.max(0.3, 0.15 * R.peak)) { const pk = R.peak, pl = R.buf; S.trials.push(pk); if (pl.length > 5) S.sdv.push(detrendSd(pl)); R.st = 'rest';
          say('Lần ' + S.trials.length + ': ' + BB.fmt(pk, 1) + ' kg', 'ok'); S.score = Math.max(...S.trials); if (test && S.trials.length >= (cfg.trials || 3)) finishSoon(); } }
      return;
    }
    const p = S.F / T;
    if (R.st === 'rest') { if (p > 0.3) Object.assign(R, { st: 'press', peak: S.F, hold: 0, ok: false, rel: null }); }
    else {
      R.peak = Math.max(R.peak, S.F);
      if (R.st === 'press' && p >= 1) R.st = 'hold';
      if (R.st === 'hold') { if (p >= 0.9) { R.hold += dt; if (R.hold >= (cfg.hold || 0)) { R.ok = true; R.st = 'release'; R.tOk = S.t; say(cfg.release ? 'Giữ đủ! Thả ra!' : 'Đạt! Thả ra.', 'ok'); } } else if (p < 0.8) R.st = 'press'; }
      if (p < 0.15) {
        if (R.ok || R.peak >= 0.5 * T) { if (R.ok && cfg.release) R.rel = S.t - R.tOk; repDone({ ok: R.ok, peak: R.peak, rel: R.rel }); if (!R.ok) say('Chưa giữ đủ hoặc chưa tới đích.', 'warn'); }
        R.n++; R.st = 'rest'; R.ok = false;
      }
    }
  }
  function stepTrack(dt) {
    const b = cfg.band; forceDyn(dt, b[1] * 1.35, 0.7);
    const lead = 2;
    if (S.t < lead) { S.ready = true; return; } S.ready = false;
    S.run = (S.run || 0) + dt; S.inb = (S.inb || 0) + (S.F >= b[0] && S.F <= b[1] ? dt : 0);
    S.score = Math.floor(S.inb);
    if (!free && S.run >= cfg.dur) finishSoon();
  }
  const RH = { pre: 0.35, post: 0.65, t0: 2.6 };
  function beatAt(k) { return RH.t0 + k * cfg.beat; }
  function stepRhythm(dt) {
    forceDyn(dt, Math.max(T * 1.5, T + 0.5), 0.22);
    const k = R.k || 0; R.k = k;
    if (!free && k >= cfg.reps) { finishSoon(); return; }
    const bt = beatAt(k);
    if (S.F < 0.4 * T) R.armed = true;
    if (R.armed && S.F >= T) { R.armed = false; const err = S.t - bt;
      if (err >= -RH.pre && err <= RH.post) { if (!R.hit) { R.hit = true; R.err = err; R.peak = S.F; } } else { S.off = (S.off || 0) + 1; say('Kẹp ngoài nhịp. Chờ chữ KẸP!', 'warn'); } }
    if (R.hit) R.peak = Math.max(R.peak, S.F);
    if (S.t > bt + RH.post) {
      if (R.hit) { S.apples = (S.apples || 0) + 1; S.drops = (S.drops || []).concat([{ t: S.t, i: S.apples }]); say('Đúng nhịp! Hái được ' + S.apples + ' quả.', 'ok'); }
      else say('Trượt nhịp.', 'warn');
      repDone({ ok: !!R.hit, err: R.hit ? R.err : null, peak: R.hit ? R.peak : 0 });
      R.k = k + 1; R.hit = false; R.peak = 0;
    }
  }
  function stepReact(dt) {
    const thr = cfg.react === 'open' ? 1 : (T || 1.5);
    forceDyn(dt, Math.max(thr * 1.4, thr + 0.6));
    const ready = S.F >= thr;
    if (!free && !test && S.reps.length >= cfg.reps) return;
    if (test && S.trials.length >= (cfg.trials || 3)) return;
    if (!R.ph) R.ph = 'arm';
    if (R.ph === 'arm') { R.sig = null; if (ready) { R.armT = (R.armT || 0) + dt; if (R.armT > 0.4) { R.ph = 'wait'; R.c = 0; R.delay = 1.2 + Math.random() * 1.8; R.decoyAt = cfg.decoy && Math.random() < 0.6 ? 0.4 + Math.random() * (R.delay - 0.6) : -1; } } else R.armT = 0; }
    else if (R.ph === 'wait') {
      R.c += dt; R.sig = (R.decoyAt > 0 && R.c > R.decoyAt && R.c < R.decoyAt + 0.6) ? 'decoy' : null;
      if (S.F < 0.5 * thr) { S.fs = (S.fs || 0) + 1; say(R.sig === 'decoy' ? 'Đèn vàng là chưa được thả!' : 'Thả sớm rồi. Chờ tín hiệu.', 'warn'); R.ph = 'arm'; R.armT = 0; }
      else if (R.c >= R.delay) { R.ph = 'go'; R.c = 0; R.f0 = S.F; R.sig = 'go'; }
    } else if (R.ph === 'go') {
      R.c += dt; const rel = S.F <= 0.15 * R.f0;
      if (rel || R.c >= 3) { const tm = Math.min(R.c, 3); R.sig = null;
        if (test) { S.trials.push(tm); say('Lần ' + S.trials.length + ': ' + BB.fmt(tm, 2) + ' s', 'ok'); if (S.trials.length >= (cfg.trials || 3)) finishSoon(); }
        else { repDone({ ok: rel && tm <= cfg.good * 1.5, time: tm, miss: !rel }); say(rel ? BB.fmt(tm, 2) + ' giây' : 'Quá 3 giây.', rel && tm <= cfg.good ? 'ok' : 'warn'); }
        R.ph = 'rest'; R.c = 0; }
    } else if (R.ph === 'rest') { R.c += dt; if (R.c > 1) { R.ph = 'arm'; R.armT = 0; } }
  }

  /* ---------------- Đi chợ (pick) */
  const PK = { items: [], need: {}, placed: 0, wrong: 0, grab: null, basket: { x: 760, y: 390, w: 170, h: 130 } };
  function newItem(kind) {
    for (let tries = 0; tries < 40; tries++) {
      const x = 70 + Math.random() * 560, y = 170 + Math.random() * 360;
      if (PK.items.every(o => Math.hypot(o.x - x, o.y - y) > 80)) return { kind: kind, x: x, y: y, hx: x, hy: y, r: kind === 'chuoi' ? 34 : 30 };
    }
    return { kind: kind, x: 100, y: 200, hx: 100, hy: 200, r: 30 };
  }
  function setupPick() {
    PK.items = []; PK.need = {};
    const list = ['tao', 'tao', 'cam', 'chuoi', 'cam', 'chuoi', 'tao', 'banh'].slice(0, (test || free) ? 0 : cfg.reps);
    list.forEach(k => { PK.need[k] = (PK.need[k] || 0) + 1; });
    const pool = (test || free) ? ['tao', 'cam', 'chuoi', 'tao', 'cam', 'chuoi'] : list.concat(['banh', list.indexOf('chuoi') < 0 ? 'chuoi' : 'banh']);
    pool.forEach(k => PK.items.push(newItem(k)));
  }
  function inBasket(o) { const b = PK.basket; return o.x > b.x - 15 && o.x < b.x + b.w + 15 && o.y > b.y - 30 && o.y < b.y + b.h + 15; }
  function release(o) {
    PK.grab = null;
    if (!inBasket(o)) { if (Math.hypot(o.x - o.hx, o.y - o.hy) > 40) say('Chưa vào giỏ, thử lại.', 'warn'); o.x = o.hx; o.y = o.hy; return; }
    if (test || free || PK.need[o.kind] > 0) {
      if (!(test || free)) PK.need[o.kind]--;
      PK.placed++; S.score = PK.placed; say('Đúng món: ' + FRUIT[o.kind].name + '.', 'ok');
      PK.items.splice(PK.items.indexOf(o), 1);
      if (test || free) PK.items.push(newItem(['tao', 'cam', 'chuoi'][Math.floor(Math.random() * 3)]));
      if (!(test || free)) repDone({ ok: true });
    } else { PK.wrong++; o.x = o.hx; o.y = o.hy; say('Món này không có trong danh sách.', 'warn'); }
  }
  function stepPick(dt) {
    const sp = 420 * dt;
    if (I.left) I.cx -= sp; if (I.right) I.cx += sp; if (I.up) I.cy -= sp; if (I.down) I.cy += sp;
    I.cx = clamp(I.cx, 20, W - 20); I.cy = clamp(I.cy, 120, H - 20);
    const o = PK.grab;
    if (o) { const k = ease(dt, 0.05 + (cfg.lag || 0) * 0.25); o.x += (I.cx - o.x) * k; o.y += (I.cy - o.y) * k; }
  }
  function grabAt(x, y) {
    let best = null, bd = 1e9; PK.items.forEach(o => { const d = Math.hypot(o.x - x, o.y - y); if (d < o.r + 26 && d < bd) { best = o; bd = d; } });
    PK.grab = best; return best;
  }

  /* ---------------- tự chạy mô phỏng (để trình diễn và kiểm thử) */
  function autoStep(dt) {
    AU.t += dt;
    if (K === 'rise') {
      const tgt = test ? cap : T * 1.03;
      if (AU.ph === 'go') { I.up = true; I.down = false; if (S.v >= tgt - 0.01 || (test && S.v >= cap * 0.999)) { AU.ph = cfg.hold ? 'hold' : (test ? 'end' : 'back'); I.up = false; } }
      else if (AU.ph === 'hold') { I.up = I.down = false; if (R.st === 'back') AU.ph = 'back'; }
      else if (AU.ph === 'back') { I.down = true; if (S.v < 0.15 * T) { I.down = false; AU.ph = 'pause'; AU.t = 0; } }
      else if (AU.ph === 'pause') { if (AU.t > 0.35) AU.ph = 'go'; }
      else if (AU.ph === 'end') { I.up = I.down = false; }
    } else if (K === 'steer') {
      const tgt = side * (T + 2);
      if (R.st === 'back' || (R.st === 'hold' && false)) { I.right = side < 0; I.left = side > 0; }
      else if (R.st === 'hold') { I.left = I.right = false; }
      else { I.right = tgt > S.a; I.left = tgt < S.a; }
    } else if (K === 'force') {
      if (test || cfg.maxMode) { I.sq = (AU.t % 3.8) < 2.6; return; }
      if (AU.ph === 'go') { I.sq = true; if (R.st === 'release') AU.ph = 'rel'; }
      else if (AU.ph === 'rel') { I.sq = false; if (R.st === 'rest') { AU.ph = 'pause'; AU.t = 0; } }
      else if (AU.ph === 'pause') { I.sq = false; if (AU.t > 0.5) AU.ph = 'go'; }
    } else if (K === 'track') { const m = (cfg.band[0] + cfg.band[1]) / 2; I.sq = S.F < m; }
    else if (K === 'rhythm') { const bt = beatAt(R.k || 0); I.sq = S.t >= bt + 0.04 && !R.hit && S.t < bt + 0.6; }
    else if (K === 'react') { if (R.ph === 'go') { R.autoGo = (R.autoGo || 0) + dt; I.sq = R.autoGo < 0.12; } else { R.autoGo = 0; I.sq = R.ph !== 'rest' || R.c > 0.6; } }
    else if (K === 'pick') {
      const spd = clamp(1 - (cfg.lag || 0) * 1.5, 0.3, 1);
      if (!PK.grab) {
        const want = PK.items.find(o => test || free || PK.need[o.kind] > 0);
        if (!want) return;
        I.cx += clamp(want.x - I.cx, -900 * spd * dt, 900 * spd * dt); I.cy += clamp(want.y - I.cy, -900 * spd * dt, 900 * spd * dt);
        if (Math.hypot(want.x - I.cx, want.y - I.cy) < 6) grabAt(I.cx, I.cy);
      } else {
        const b = PK.basket, tx = b.x + b.w / 2, ty = b.y + b.h / 2;
        I.cx += clamp(tx - I.cx, -700 * spd * dt, 700 * spd * dt); I.cy += clamp(ty - I.cy, -700 * spd * dt, 700 * spd * dt);
        if (Math.hypot(tx - PK.grab.x, ty - PK.grab.y) < 12) release(PK.grab);
      }
    }
  }

  /* ---------------- vòng chính */
  function tick(dt) {
    if (S.done) return;
    dt = Math.min(dt, 0.1); S.t += dt; if (S.msgT > 0) S.msgT -= dt;
    if (I.auto) autoStep(dt);
    if (K === 'rise') stepRise(dt); else if (K === 'steer') stepSteer(dt);
    else if (K === 'force') stepForce(dt); else if (K === 'track') stepTrack(dt);
    else if (K === 'rhythm') stepRhythm(dt); else if (K === 'react') stepReact(dt); else if (K === 'pick') stepPick(dt);
    if (timeLimit && S.t >= timeLimit + (K === 'track' ? 2 : 0)) finishSoon();
    if (endAt != null && S.t >= endAt) { S.done = true; if (on.done) on.done(); }
  }
  /* số đo của hiệp này */
  function stats() {
    const ms = [], add = (key, label, value, unit, agg) => { if (value != null && !isNaN(value)) ms.push({ key, label, value: +(+value).toFixed(2), unit, agg }); };
    let planned = cfg.reps, done = S.ok;
    if (K === 'rise') { const pk = S.reps.map(r => r.peak); add('peak', cfg.measure + ' lớn nhất', pk.length ? Math.max(...pk) : S.max, cfg.unit, 'max'); if (pk.length) add('avg', 'Trung bình mỗi lần', mean(pk), cfg.unit, 'mean'); }
    else if (K === 'steer') { add('pos', 'Ngửa lớn nhất', S.pos || 0, '°', 'max'); add('neg', 'Sấp lớn nhất', S.neg || 0, '°', 'max'); }
    else if (K === 'force') { const pk = S.reps.map(r => r.peak); add('force', (cfg.measure || 'Lực') + ' lớn nhất', pk.length ? Math.max(...pk) : S.max, 'kg', 'max');
      const rel = S.reps.filter(r => r.rel != null).map(r => r.rel); if (rel.length) add('rel', 'Thời gian thả', mean(rel), 's', 'mean'); }
    else if (K === 'track') { planned = cfg.dur; done = Math.min(S.run || 0, cfg.dur); add('inband', 'Thời gian trong vùng', (S.run ? (S.inb || 0) / S.run : 0) * 100, '%', 'mean'); add('force', 'Lực bóp lớn nhất', S.max, 'kg', 'max'); }
    else if (K === 'rhythm') { const e = S.reps.filter(r => r.ok).map(r => Math.abs(r.err)); add('hits', 'Đúng nhịp', S.ok, 'nhịp', 'sum'); if (e.length) add('err', 'Lệch nhịp', mean(e), 's', 'mean');
      const pk = S.reps.filter(r => r.ok).map(r => r.peak); if (pk.length) add('force', 'Lực kẹp lớn nhất', Math.max(...pk), 'kg', 'max'); }
    else if (K === 'react') { const tm = S.reps.filter(r => !r.miss).map(r => r.time); done = S.reps.filter(r => !r.miss).length; if (tm.length) add('time', cfg.measure || 'Thời gian', mean(tm), 's', 'mean'); add('false', 'Thả sớm', S.fs || 0, 'lần', 'sum'); }
    else if (K === 'pick') { add('items', 'Số vật bỏ đúng giỏ', PK.placed, 'vật', 'sum'); add('wrong', 'Nhặt nhầm', PK.wrong, 'lần', 'sum'); done = PK.placed; }
    return { planned: planned, done: done, measures: ms };
  }

  /* ---------------- nhập liệu */
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const squeezeKinds = { force: 1, track: 1, rhythm: 1, react: 1 };
  function onKey(e, down) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (squeezeKinds[K]) { I.sq = down; e.preventDefault(); }
      else if (K === 'pick' && down && !e.repeat) { if (PK.grab) release(PK.grab); else grabAt(I.cx, I.cy); e.preventDefault(); }
      return;
    }
    const k = keyMap[e.code]; if (!k) return;
    if (K === 'pick') { if (down) I[k] = true; else I[k] = false; e.preventDefault(); return; }
    I[k] = down; I.goal = null; e.preventDefault();
  }
  const kd = e => onKey(e, true), ku = e => onKey(e, false);
  let dragging = false;
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function pd(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* con trỏ giả lập */ } dragging = true; const p = pos(e);
    if (squeezeKinds[K]) I.sq = true;
    else if (K === 'pick') { I.cx = p.x; I.cy = p.y; grabAt(p.x, p.y); }
    else pm(e);
    e.preventDefault();
  }
  function pm(e) {
    const p = pos(e);
    if (K === 'pick') { if (dragging) { I.cx = p.x; I.cy = p.y; } return; }
    if (!dragging) return;
    if (K === 'rise') I.goal = clamp((560 - p.y) / 480, 0, 1) * Math.max(cap, T) * 1.12;
    if (K === 'steer') I.goal = clamp((p.x - W / 2) / (W * 0.42), -1, 1) * cap;
  }
  function pu() { dragging = false; if (squeezeKinds[K]) I.sq = false; else if (K === 'pick') { if (PK.grab) release(PK.grab); } else I.goal = null; }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm);
  canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu);
  window.addEventListener('blur', pu);
  function destroy() {
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', pu);
    canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm); canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu);
  }
  if (K === 'pick') setupPick();

  /* ---------------- vẽ */
  function txt(s, x, y, size, col, align, weight) { g.font = (weight || 600) + ' ' + size + 'px ' + FONT; g.fillStyle = col || C.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function bar(x, y, w, h, val, max, lo, hi, tgt) {
    rr(x, y, w, h, 14); g.fillStyle = '#F3E9E0'; g.fill();
    const Y = v => y + h - clamp(v / max, 0, 1) * h;
    if (lo != null) { g.fillStyle = C.okS; g.fillRect(x, Y(hi), w, Y(lo) - Y(hi)); }
    if (cfg.forceLimit) { g.fillStyle = 'rgba(217,45,32,0.12)'; g.fillRect(x, y, w, Y(cfg.forceLimit) - y); g.strokeStyle = C.bad; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(x - 8, Y(cfg.forceLimit)); g.lineTo(x + w + 8, Y(cfg.forceLimit)); g.stroke(); g.setLineDash([]); txt('giới hạn', x + w + 12, Y(cfg.forceLimit), 16, C.bad); }
    g.save(); rr(x, y, w, h, 14); g.clip(); g.fillStyle = C.bop; g.fillRect(x, Y(val), w, y + h - Y(val)); g.restore();
    if (tgt != null) { g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([10, 7]); g.beginPath(); g.moveTo(x - 10, Y(tgt)); g.lineTo(x + w + 10, Y(tgt)); g.stroke(); g.setLineDash([]); txt('đích', x - 14, Y(tgt), 16, C.ink, 'right'); }
  }
  function header(main, sub) { txt(main, 40, 44, 30, C.ink, 'left', 800); if (sub) txt(sub, 40, 80, 19, C.mute, 'left', 500); }
  function bigValue(v, unit, x, y) { txt(v, x, y, 64, C.ink, 'right', 800); txt(unit, x + 8, y + 10, 24, C.mute, 'left', 600); }

  function drawRiseScene() {
    const v = S.v, deg = Math.PI / 180, vz = cfg.viz;
    const dispMax = Math.max(cap, T) * 1.12;
    if (vz === 'arm' || vz === 'elbow' || vz === 'wrist') {
      const ox = vz === 'wrist' ? 300 : 360, oy = vz === 'arm' ? 230 : vz === 'elbow' ? 200 : 380;
      g.lineCap = 'round';
      if (vz === 'arm') {
        g.strokeStyle = '#D9CBBF'; g.lineWidth = 46; g.beginPath(); g.moveTo(ox, oy - 40); g.lineTo(ox - 10, oy + 230); g.stroke();
        g.fillStyle = '#D9CBBF'; g.beginPath(); g.arc(ox - 6, oy - 100, 44, 0, Math.PI * 2); g.fill();
        const ray = (a, col, dash, len) => { g.strokeStyle = col; g.lineWidth = 3; g.setLineDash(dash || []); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.sin(a * deg) * len, oy + Math.cos(a * deg) * len); g.stroke(); g.setLineDash([]); };
        if (cfg.warnAbove) { ray(90, C.bad, [4, 8], 300); txt('ngang vai', ox + 305, oy, 17, C.bad); }
        if (T) ray(T, C.ink, [10, 8], 290);
        const ex = ox + Math.sin(v * deg) * 230, ey = oy + Math.cos(v * deg) * 230;
        g.strokeStyle = C.skin; g.lineWidth = 34; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = C.core; g.beginPath(); g.arc(ox + Math.sin(v * deg) * 195, oy + Math.cos(v * deg) * 195, 15, 0, Math.PI * 2); g.fill();
        g.strokeStyle = C.bop; g.lineWidth = 8; g.beginPath(); g.arc(ox, oy, 70, Math.PI / 2 - v * deg, Math.PI / 2); g.stroke();
      } else if (vz === 'elbow') {
        g.strokeStyle = C.skin; g.lineWidth = 36; g.beginPath(); g.moveTo(ox, oy - 150); g.lineTo(ox, oy); g.stroke();
        const a = (180 - v) * deg; /* 0° gập = duỗi thẳng xuống */
        const fx = ox + Math.sin(Math.PI - a) * 220, fy = oy - Math.cos(Math.PI - a) * 220;
        if (T) { const ta = (180 - T) * deg; g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.sin(Math.PI - ta) * 280, oy - Math.cos(Math.PI - ta) * 280); g.stroke(); g.setLineDash([]); }
        g.strokeStyle = C.skin; g.lineWidth = 30; g.beginPath(); g.moveTo(ox, oy); g.lineTo(fx, fy); g.stroke();
        g.fillStyle = C.core; g.beginPath(); g.arc(ox + (fx - ox) * 0.85, oy + (fy - oy) * 0.85, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#E8B08A'; g.beginPath(); g.arc(ox, oy, 22, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = C.mat; rr(120, oy + 18, 520, 40, 10); g.fill();
        g.strokeStyle = C.skin; g.lineWidth = 34; g.beginPath(); g.moveTo(120, oy); g.lineTo(ox, oy); g.stroke();
        if (T) { g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(T * deg) * 260, oy - Math.sin(T * deg) * 260); g.stroke(); g.setLineDash([]); }
        const hx = ox + Math.cos(v * deg) * 170, hy = oy - Math.sin(v * deg) * 170;
        g.strokeStyle = C.skin; g.lineWidth = 40; g.beginPath(); g.moveTo(ox, oy); g.lineTo(hx, hy); g.stroke();
        g.fillStyle = C.core; g.beginPath(); g.arc(ox + Math.cos(v * deg) * 80, oy - Math.sin(v * deg) * 80 - 18, 14, 0, Math.PI * 2); g.fill();
        if (cfg.load) { g.fillStyle = '#7EC8F0'; rr(hx - 18, hy - 50, 36, 80, 10); g.fill(); }
      }
    } else if (vz === 'slide') {
      g.fillStyle = C.mat; rr(80, 250, 640, 160, 24); g.fill();
      const X = cm => 110 + cm / dispMax * 580;
      for (let c = 0; c <= dispMax; c += 5) { g.fillStyle = C.mute; g.fillRect(X(c), 395, 2, 14); txt(c + '', X(c), 430, 15, C.mute, 'center'); }
      if (T) { g.fillStyle = C.ink; g.fillRect(X(T) - 2, 250, 4, 160); txt('vạch ' + T + ' cm', X(T), 236, 17, C.ink, 'center'); }
      g.fillStyle = C.skin; g.beginPath(); g.ellipse(X(v), 330, 46, 36, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,106,26,0.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(110, 330); g.lineTo(X(v) - 46, 330); g.stroke();
      txt('Camera điện thoại đo tầm với', 80, 470, 17, C.mute);
    } else if (vz === 'hand' || vz === 'flower') {
      const k = clamp(v / 100, 0, 1), cx = 380, cy = 330;
      if (vz === 'flower') {
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, d = 30 + 70 * k; g.fillStyle = i % 2 ? C.bop : '#FF9A5C'; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 26 + 22 * k, 14 + 10 * k, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#FFD25A'; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < Math.min(S.ok, 12); i++) { g.fillStyle = C.bop; g.beginPath(); g.arc(80 + i * 34, 540, 12, 0, Math.PI * 2); g.fill(); }
        txt('Hoa đã nở: ' + S.ok, 80, 505, 18, C.mute);
      } else {
        g.fillStyle = C.skin; g.beginPath(); g.ellipse(cx, cy + 40, 80, 70, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 4; i++) { const a = (-0.5 + i * 0.33) * (0.25 + 0.75 * k) - Math.PI / 2; g.strokeStyle = C.skin; g.lineWidth = 30; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + (i - 1.5) * 34, cy); g.lineTo(cx + (i - 1.5) * 34 + Math.cos(a) * (40 + 90 * k), cy + Math.sin(a) * (40 + 90 * k)); g.stroke(); }
        const ta = Math.PI - 0.4 - 0.7 * k; g.beginPath(); g.moveTo(cx - 70, cy + 40); g.lineTo(cx - 70 + Math.cos(ta) * (40 + 60 * k), cy + 40 - Math.sin(ta) * (40 + 60 * k) * 0.6); g.stroke();
      }
      if (T) { g.strokeStyle = C.ink; g.lineWidth = 3; g.setLineDash([8, 8]); g.beginPath(); g.arc(cx, cy + 20, 70 + 1.3 * T, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    } else if (vz === 'knob') {
      const cx = 380, cy = 320, a = (cfg.side || 1) * v * deg;
      g.fillStyle = '#E8ECEB'; g.beginPath(); g.arc(cx, cy, 130, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 24; i++) { const b = i / 24 * Math.PI * 2 + a; g.fillStyle = '#C5CBCA'; g.beginPath(); g.arc(cx + Math.cos(b) * 122, cy + Math.sin(b) * 122, 8, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = C.ink; g.lineWidth = 10; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * 100, cy - Math.cos(a) * 100); g.stroke();
      txt((cfg.side || 1) > 0 ? 'Ngửa →' : '← Sấp', cx, cy + 175, 20, C.mute, 'center');
    }
    /* thước đo bên phải */
    bar(800, 140, 60, 380, v, dispMax, null, null, T || null);
    bigValue(BB.fmt(v, 0), cfg.unit === 'cm' ? 'cm' : cfg.unit, 760, 100);
  }
  function drawForceScene() {
    const F = S.F, vz = cfg.viz, max = Math.max(cfg.forceLimit ? cfg.forceLimit * 1.4 : 0, (test || free) ? cap * 1.1 : Math.max(T * 2, cfg.band ? cfg.band[1] * 1.6 : 0, 4));
    const k = clamp(F / Math.max(1, max), 0, 1);
    if (vz === 'egg') {
      g.fillStyle = '#8FDCC0'; g.beginPath(); g.ellipse(380, 330, 120 * (1 + 0.18 * k), 160 * (1 - 0.15 * k), 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5AA98F'; g.lineWidth = 3; g.beginPath(); g.ellipse(380, 330, 120 * (1 + 0.18 * k), 8, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = C.core; rr(350, 420 - 30 * k, 60, 34, 10); g.fill();
      if (I.sq) { g.fillStyle = 'rgba(242,195,160,0.85)'; g.beginPath(); g.ellipse(250 + 30 * k, 330, 50, 120, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(510 - 30 * k, 330, 50, 120, 0, 0, Math.PI * 2); g.fill(); }
    } else if (vz === 'pinch') {
      const ang = 0.42 - 0.3 * k, hx = 220, hy = 330;
      g.lineCap = 'round'; g.strokeStyle = '#C9CFCD'; g.lineWidth = 26;
      [-1, 1].forEach(s => { g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(ang) * 330, hy + s * Math.sin(ang) * 330); g.stroke(); g.fillStyle = C.ink; g.beginPath(); g.arc(hx + Math.cos(ang) * 320, hy + s * (Math.sin(ang) * 320 + 18), 18, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = C.bop; g.fillRect(hx + Math.cos(ang) * 250 - 8, hy - Math.sin(ang) * 250, 16, 2 * Math.sin(ang) * 250);
      g.fillStyle = C.core; rr(hx - 34, hy - 26, 64, 52, 12); g.fill();
    } else if (vz === 'push') {
      g.fillStyle = '#D9CBBF'; g.fillRect(120, 420, 520, 24);
      const off = (cfg.dir === 'push' ? -1 : 1) * 40 * k;
      g.fillStyle = '#9AA2A3'; g.fillRect(200, 250, 30, 170); g.fillStyle = C.core; rr(190, 220, 52, 34, 9); g.fill();
      g.fillStyle = C.bop; g.fillRect(230, 300, 50, 40);
      g.strokeStyle = '#9AA2A3'; g.lineWidth = 12; g.beginPath(); g.moveTo(280, 320); g.lineTo(470 + off, 320); g.stroke();
      g.fillStyle = C.ink; rr(470 + off, 250, 34, 140, 14); g.fill();
      if (F > 0.2) { g.fillStyle = C.bop; const dx = cfg.dir === 'push' ? -1 : 1; g.beginPath(); g.moveTo(560 + off + dx * 70, 320); g.lineTo(560 + off, 290); g.lineTo(560 + off, 350); g.closePath(); g.fill(); }
    } else if (vz === 'tug') {
      const p = R.st === 'hold' || R.st === 'release' ? clamp(R.hold / (cfg.hold || 1), 0, 1) : 0;
      g.strokeStyle = '#B7794A'; g.lineWidth = 12; g.beginPath(); g.moveTo(90, 330); g.lineTo(700, 330); g.stroke();
      g.fillStyle = C.ink; g.fillRect(392, 230, 6, 200); txt('vạch thắng', 395, 214, 16, C.mute, 'center');
      const fx = 395 + 150 - 260 * p - 60 * k; g.fillStyle = C.bop; g.beginPath(); g.moveTo(fx, 330); g.lineTo(fx + 40, 300); g.lineTo(fx + 40, 360); g.closePath(); g.fill();
      g.fillStyle = '#9AA2A3'; g.beginPath(); g.arc(90, 330, 34, 0, Math.PI * 2); g.fill(); txt('Đối thủ', 90, 390, 17, C.mute, 'center');
      g.fillStyle = C.skin; g.beginPath(); g.arc(700, 330, 34, 0, Math.PI * 2); g.fill(); txt('Bạn', 700, 390, 17, C.mute, 'center');
      txt('Thắng: ' + S.ok, 80, 480, 22, C.ink, 'left', 700);
    }
    bar(800, 140, 60, 380, F, max, null, null, (test || cfg.maxMode) ? null : T);
    if (cfg.maxMode && S.trials.length) txt('Kỷ lục: ' + BB.fmt(Math.max(...S.trials), 1) + ' kg', 40, 520, 26, C.bopD, 'left', 800);
    bigValue(BB.fmt(F, 1), 'kg', 760, 100);
    if (test && S.trials.length) txt('Đã đo: ' + S.trials.map(x => BB.fmt(x, 1)).join(' · ') + ' kg', 40, 560, 20, C.ink);
  }
  function drawTrack() {
    const b = cfg.band, max = Math.max(b[1] * 1.8, 4), Y = f => 520 - clamp(f / max, 0, 1) * 400;
    g.fillStyle = C.sky; g.fillRect(0, 100, 760, 440);
    g.fillStyle = 'rgba(30,142,90,0.18)'; g.fillRect(0, Y(b[1]), 760, Y(b[0]) - Y(b[1])); txt(BB.fmt(b[0], 1) + '–' + BB.fmt(b[1], 1) + ' kg', 20, Y(b[1]) - 16, 17, C.ok);
    for (let i = 0; i < 5; i++) { const x = ((i * 220 - S.t * 120) % 1100 + 1100) % 1100 - 100; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 160 + (i % 2) * 60, 60, 22, 0, 0, Math.PI * 2); g.fill(); }
    const by = Y(S.F), inb = S.F >= b[0] && S.F <= b[1];
    g.fillStyle = inb ? C.bop : '#FFB36B'; g.beginPath(); g.ellipse(300, by, 38, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(318, by - 8, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = C.ink; g.beginPath(); g.arc(320, by - 8, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#E0560A'; g.beginPath(); g.moveTo(336, by); g.lineTo(356, by + 6); g.lineTo(336, by + 10); g.fill();
    g.fillStyle = '#E0560A'; g.beginPath(); g.ellipse(290, by + (Math.sin(S.t * 16) > 0 ? -16 : 10), 22, 10, -0.3, 0, Math.PI * 2); g.fill();
    if (S.ready) txt('Chuẩn bị… ' + Math.ceil(2 - S.t), 380, 320, 40, C.ink, 'center', 800);
    txt('Trong vùng: ' + BB.fmt(S.inb || 0, 0) + ' giây', 20, 575, 20, C.ink, 'left', 700);
    bar(800, 140, 60, 380, S.F, max, b[0], b[1], null); bigValue(BB.fmt(S.F, 1), 'kg', 760, 100);
  }
  function drawRhythm() {
    g.fillStyle = '#7BC67E'; g.beginPath(); g.arc(250, 230, 130, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8A5A3B'; g.fillRect(235, 330, 30, 170);
    for (let i = 0; i < 7; i++) { g.fillStyle = C.bad; g.beginPath(); g.arc(180 + (i % 4) * 45, 180 + Math.floor(i / 4) * 70, 15, 0, Math.PI * 2); g.fill(); }
    const bx = 470, byy = 430; g.fillStyle = '#C58B4A'; rr(bx, byy, 200, 90, 16); g.fill(); txt('Giỏ: ' + (S.apples || 0) + ' quả', bx + 100, byy + 115, 18, C.mute, 'center');
    (S.drops || []).slice(-8).forEach((d, j) => { const age = S.t - d.t, y = Math.min(byy + 20, 260 + age * 600); g.fillStyle = C.bad; g.beginPath(); g.arc(bx + 30 + (d.i % 6) * 28, y, 14, 0, Math.PI * 2); g.fill(); });
    /* dải nhịp: các nhịp sắp tới chạy về vạch "bây giờ" */
    const lx = 130, ly = 560, span = 5, X = t => lx + (t - S.t) / span * 600;
    g.fillStyle = '#F3E9E0'; g.fillRect(40, ly - 26, 720, 52);
    for (let k = Math.max(0, (R.k || 0) - 1); k < (free ? (R.k || 0) + 4 : cfg.reps); k++) { const bt = beatAt(k); if (bt < S.t - 1 || bt > S.t + span) continue;
      g.fillStyle = 'rgba(255,106,26,0.18)'; g.fillRect(X(bt - RH.pre), ly - 26, X(bt + RH.post) - X(bt - RH.pre), 52); g.fillStyle = C.bop; g.fillRect(X(bt) - 3, ly - 26, 6, 52); }
    g.fillStyle = C.ink; g.fillRect(lx - 2, ly - 34, 4, 68); txt('bây giờ', lx, ly - 46, 15, C.mute, 'center');
    const bt = beatAt(R.k || 0); if (S.t >= bt - 0.05 && S.t <= bt + 0.45) txt('KẸP!', 380, 120, 64, C.bopD, 'center', 800);
    if (S.t < RH.t0 - 0.3) txt('Chuẩn bị…', 380, 120, 40, C.ink, 'center', 800);
    bar(800, 140, 60, 380, S.F, Math.max(T * 2.2, 2), null, null, T); bigValue(BB.fmt(S.F, 1), 'kg', 760, 100);
  }
  function drawReact() {
    const vz = cfg.viz, ph = R.ph, sig = R.sig;
    if (vz === 'lights') {
      g.fillStyle = C.ink; rr(300, 130, 160, 400, 30); g.fill();
      [['#E5484D', ph === 'arm' || ph === 'wait'], ['#F2C94C', sig === 'decoy'], ['#2FBF71', sig === 'go']].forEach((l, i) => { g.fillStyle = l[1] ? l[0] : '#3A302A'; g.beginPath(); g.arc(380, 200 + i * 125, 48, 0, Math.PI * 2); g.fill(); });
    } else if (vz === 'hand') { drawHandOnly(clamp(1 - S.F / 1.4, 0, 1)); }
    else { const k = clamp(S.F / Math.max(T * 1.6, 2), 0, 1); g.fillStyle = '#8FDCC0'; g.beginPath(); g.ellipse(380, 330, 120 * (1 + 0.18 * k), 160 * (1 - 0.15 * k), 0, 0, Math.PI * 2); g.fill(); }
    const word = cfg.react === 'open' ? 'MỞ!' : 'THẢ!';
    if (sig === 'go') { g.fillStyle = 'rgba(255,106,26,0.92)'; rr(240, 230, 280, 130, 30); g.fill(); txt(word, 380, 298, 72, '#231A14', 'center', 800); }
    else if (ph === 'arm') txt(cfg.react === 'open' ? 'Nắm tay lại (giữ phím cách)…' : 'Bóp và giữ…', 380, 120, 28, C.ink, 'center', 700);
    else if (ph === 'wait') txt('Giữ nguyên… chờ tín hiệu', 380, 120, 28, C.ink, 'center', 700);
    if (test && S.trials.length) txt('Đã đo: ' + S.trials.map(x => BB.fmt(x, 2)).join(' · ') + ' s', 40, 560, 20, C.ink);
    bar(800, 140, 60, 380, S.F, Math.max((T || 1.5) * 2, 3), null, null, cfg.react === 'open' ? null : (T || 1.5));
  }
  function drawHandOnly(k) {
    const cx = 380, cy = 330; g.fillStyle = C.skin; g.beginPath(); g.ellipse(cx, cy + 40, 80, 70, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 4; i++) { const a = (-0.5 + i * 0.33) * (0.25 + 0.75 * k) - Math.PI / 2; g.strokeStyle = C.skin; g.lineWidth = 30; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + (i - 1.5) * 34, cy); g.lineTo(cx + (i - 1.5) * 34 + Math.cos(a) * (40 + 90 * k), cy + Math.sin(a) * (40 + 90 * k)); g.stroke(); }
  }
  function drawSteer() {
    g.fillStyle = '#7BC67E'; g.fillRect(0, 100, 760, 500);
    g.fillStyle = '#5B6470'; g.beginPath(); g.moveTo(240, 100); g.lineTo(520, 100); g.lineTo(700, 600); g.lineTo(60, 600); g.closePath(); g.fill();
    for (let i = 0; i < 6; i++) { const y = ((i * 100 + S.t * 260) % 600) + 100; g.fillStyle = '#fff'; g.fillRect(376, y, 8, 40); }
    const X = a => 380 + a / Math.max(cap, T * 1.2) * 260;
    [-1, 1].forEach(sd2 => { const x = X(sd2 * T), act = sd2 === side; g.strokeStyle = act ? C.bop : 'rgba(255,255,255,0.5)'; g.lineWidth = 8; g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 260); g.stroke(); txt(sd2 > 0 ? 'Ngửa ' + T + '°' : 'Sấp ' + T + '°', x, 130, 18, act ? '#fff' : 'rgba(255,255,255,0.7)', 'center', 700); });
    const cx = X(S.a); g.fillStyle = C.bop; rr(cx - 45, 420, 90, 140, 20); g.fill(); g.fillStyle = '#FFD2B8'; rr(cx - 32, 440, 64, 40, 10); g.fill();
    g.fillStyle = C.ink; [[-50, 445], [40, 445], [-50, 520], [40, 520]].forEach(w => g.fillRect(cx + w[0], w[1], 10, 34));
    bigValue((S.a >= 0 ? '+' : '−') + BB.fmt(Math.abs(S.a), 0), '°', 900, 100); txt(S.a >= 0 ? 'ngửa' : 'sấp', 900, 150, 20, C.mute, 'right');
  }
  function drawPick() {
    g.fillStyle = C.mat; rr(30, 130, 700, 440, 24); g.fill();
    [[48, 148], [692, 148], [48, 532], [692, 532]].forEach(m => { g.fillStyle = '#111'; g.fillRect(m[0], m[1], 22, 22); g.fillStyle = '#fff'; g.fillRect(m[0] + 6, m[1] + 6, 6, 6); });
    const b = PK.basket; g.fillStyle = '#C58B4A'; rr(b.x, b.y, b.w, b.h, 18); g.fill(); g.fillStyle = '#A8723C'; g.fillRect(b.x, b.y + 20, b.w, 10); txt('Giỏ', b.x + b.w / 2, b.y + b.h + 24, 18, C.mute, 'center');
    PK.items.forEach(o => {
      const f = FRUIT[o.kind]; g.fillStyle = f.col;
      if (o.kind === 'chuoi') { g.save(); g.translate(o.x, o.y); g.rotate(-0.4); g.beginPath(); g.ellipse(0, 0, 40, 16, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      else if (o.kind === 'banh') { rr(o.x - 30, o.y - 22, 60, 44, 10); g.fill(); }
      else { g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff'; g.fillRect(o.x - 8, o.y - 8, 16, 16); g.fillStyle = '#111'; g.fillRect(o.x - 4, o.y - 4, 8, 8);
      if (o === PK.grab) { g.strokeStyle = C.ink; g.lineWidth = 4; g.beginPath(); g.arc(o.x, o.y, o.r + 10, 0, Math.PI * 2); g.stroke(); }
    });
    g.strokeStyle = C.ink; g.lineWidth = 3; g.beginPath(); g.arc(I.cx, I.cy, 16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(I.cx - 24, I.cy); g.lineTo(I.cx + 24, I.cy); g.moveTo(I.cx, I.cy - 24); g.lineTo(I.cx, I.cy + 24); g.stroke();
    if (!(test || free)) { let y = 34; txt('Danh sách đi chợ:', 760, y, 19, C.ink, 'left', 700); Object.keys(PK.need).forEach(k => { y += 30; txt((PK.need[k] > 0 ? PK.need[k] + ' ' : '✓ ') + FRUIT[k].name, 770, y, 19, PK.need[k] > 0 ? C.ink : C.ok); }); }
    else txt('Đã bỏ vào giỏ: ' + PK.placed, 760, 60, 24, C.ink, 'left', 800);
  }
  function draw() {
    g.clearRect(0, 0, W, H); g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
    if (K === 'rise') drawRiseScene(); else if (K === 'force') drawForceScene(); else if (K === 'track') drawTrack();
    else if (K === 'rhythm') drawRhythm(); else if (K === 'react') drawReact(); else if (K === 'steer') drawSteer(); else if (K === 'pick') drawPick();
    if (timeLimit) { const left = Math.max(0, timeLimit - S.t + (K === 'track' ? 2 : 0)); txt('⏱ ' + Math.ceil(left) + ' s', 40, 44, 26, C.ink, 'left', 800); }
    if (S.msgT > 0) { g.font = '700 24px ' + FONT; const w = g.measureText(S.msg).width + 40; g.fillStyle = S.msgCls === 'bad' ? C.bad : S.msgCls === 'warn' ? '#FFF3C4' : S.msgCls === 'ok' ? C.okS : '#fff'; rr(W / 2 - w / 2, 66, w, 48, 24); g.fill(); txt(S.msg, W / 2, 90, 24, S.msgCls === 'bad' ? '#fff' : S.msgCls === 'warn' ? '#6B4A00' : C.ink, 'center', 700); }
  }
  return {
    I: I, S: S, PK: PK, tick: tick, draw: draw, stats: stats, destroy: destroy,
    setAuto: v => { I.auto = !!v; if (!v) { I.up = I.down = I.left = I.right = I.sq = false; } },
    finish: () => { S.done = true; },
    record: () => S.max
  };
};
})();
