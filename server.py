#!/usr/bin/env python3
"""Bốp Bốp – máy chủ cho App người tập và Web theo dõi.

Chỉ dùng thư viện chuẩn của Python 3 (không cần cài gì thêm).
Chạy:  python server.py                 -> http://localhost:8800
       python server.py --lan           -> mở cho điện thoại cùng mạng Wi-Fi
       python server.py --db duong_dan.db
"""
import argparse
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
DB_PATH = ""
WRITE_LOCK = threading.Lock()
SESSION_DAYS = 30
MAX_BODY = 256 * 1024

# ---------------------------------------------------------------- danh mục bài tập (khớp với static/bb.js)
LEVELS = {1: "ABC", 2: "ABC", 3: "ABC", 4: "ABC", 5: "ABC", 6: "ABC", 7: "ABC", 8: "BC", 9: "BC"}
EX_NAMES = {1: "Nâng tay", 2: "Trượt tay trên bàn", 3: "Co duỗi khuỷu", 4: "Mở và nắm bàn tay", 5: "Bóp bóng",
            6: "Kẹp và thả vật", 7: "Duỗi cổ tay", 8: "Xoay cẳng tay", 9: "Thả lực nhanh"}
PROGRAMS = {
    "dotquy": {"base": [1, 2, 3, 4, 5, 6, 7, 8, 9], "force": []},
    "chanthuong": {"base": [4, 7, 8], "force": [3, 5, 6]},
}
DEFAULT_LEVELS = {
    "dotquy": {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A", 7: "A", 8: "B", 9: "B"},
    "chanthuong": {1: "B", 2: "B", 3: "A", 4: "B", 5: "A", 6: "A", 7: "A", 8: "B", 9: "B"},
}
ALERT_TYPES = {
    "pain_rest": "medium", "pain_stop": "medium", "stroke_115": "high", "injury_symptom": "high",
    "shoulder_limit": "medium", "force_limit": "medium", "force_locked": "low",
}
CALL_NAMES = ("Bố", "Mẹ", "Ông", "Bà", "Anh", "Chị", "Cô", "Chú")

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  salt TEXT NOT NULL, hash TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS auth (
  token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, call_name TEXT NOT NULL, sex TEXT NOT NULL, age INTEGER,
  program TEXT NOT NULL, levels TEXT NOT NULL, force_allowed INTEGER NOT NULL DEFAULT 0,
  shoulder_unlocked INTEGER NOT NULL DEFAULT 0, force_limit REAL NOT NULL DEFAULT 5,
  demo_mode INTEGER NOT NULL DEFAULT 1, code_cv TEXT UNIQUE NOT NULL, code_nn TEXT UNIQUE NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS access (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  role TEXT NOT NULL, PRIMARY KEY (account_id, patient_id));
CREATE TABLE IF NOT EXISTS trainings (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  author TEXT NOT NULL, created REAL NOT NULL, status TEXT NOT NULL, stop_reason TEXT,
  pre TEXT NOT NULL, post TEXT NOT NULL, results TEXT NOT NULL, avg_completion REAL);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created REAL NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0, resolved_by TEXT);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created REAL NOT NULL, ex INTEGER NOT NULL, from_level TEXT NOT NULL, to_level TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at REAL);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created REAL NOT NULL, author TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created REAL NOT NULL, author TEXT NOT NULL, role TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, lines TEXT);
CREATE INDEX IF NOT EXISTS ix_tr ON trainings(patient_id, created);
CREATE INDEX IF NOT EXISTS ix_al ON alerts(patient_id, created);
CREATE INDEX IF NOT EXISTS ix_pr ON proposals(patient_id, status);
CREATE INDEX IF NOT EXISTS ix_ms ON messages(patient_id, created);
"""


def db():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = db()
    con.executescript(SCHEMA)
    con.commit()
    con.close()


# ---------------------------------------------------------------- tiện ích
class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now():
    return time.time()


def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()


def new_code(con, col):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not con.execute(f"SELECT 1 FROM patients WHERE {col}=?", (code,)).fetchone():
            return code


def text(v, field, lo=1, hi=200):
    if not isinstance(v, str):
        raise ApiError(400, f"Thiếu {field}.")
    v = v.strip()
    if not (lo <= len(v) <= hi):
        raise ApiError(400, f"{field} cần từ {lo} đến {hi} ký tự.")
    return v


def num(v, lo, hi, default=None):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        if default is not None:
            return default
        raise ApiError(400, "Số không hợp lệ.")
    if v != v:
        raise ApiError(400, "Số không hợp lệ.")
    return max(lo, min(hi, v))


def jload(s, default):
    try:
        return json.loads(s) if s else default
    except ValueError:
        return default


def program_exs(p):
    prog = PROGRAMS[p["program"]]
    exs = list(prog["base"])
    if p["force_allowed"]:
        exs += prog["force"]
    return sorted(exs)


# ---------------------------------------------------------------- thông báo trực tiếp (Server-Sent Events)
LISTENERS = {}
LISTEN_LOCK = threading.Lock()


def notify(con, patient_id, kind):
    event = json.dumps({"type": kind, "patient_id": patient_id, "t": now()})
    rows = con.execute("SELECT account_id FROM access WHERE patient_id=?", (patient_id,)).fetchall()
    with LISTEN_LOCK:
        for r in rows:
            for q in list(LISTENERS.get(r["account_id"], ())):
                try:
                    q.put_nowait(event)
                except queue.Full:
                    pass


# ---------------------------------------------------------------- dữ liệu người tập
def patient_dict(p, role):
    d = {
        "id": p["id"], "name": p["name"], "call_name": p["call_name"], "sex": p["sex"], "age": p["age"],
        "program": p["program"], "levels": jload(p["levels"], {}), "force_allowed": bool(p["force_allowed"]),
        "shoulder_unlocked": bool(p["shoulder_unlocked"]), "force_limit": p["force_limit"],
        "demo_mode": bool(p["demo_mode"]), "role": role, "exercises": program_exs(p),
    }
    if role == "chuyenvien":
        d["code_cv"] = p["code_cv"]
    d["code_nn"] = p["code_nn"]
    return d


def get_access(con, acc_id, pid, roles=None):
    row = con.execute(
        "SELECT p.*, a.role AS my_role FROM patients p JOIN access a ON a.patient_id=p.id "
        "WHERE p.id=? AND a.account_id=?", (pid, acc_id)).fetchone()
    if not row:
        raise ApiError(404, "Không tìm thấy người tập.")  # không lộ người tập của tài khoản khác
    if roles and row["my_role"] not in roles:
        raise ApiError(403, "Chỉ chuyên viên mới làm được việc này.")
    return row


def summary_for(con, pid):
    last = con.execute("SELECT created, status, avg_completion FROM trainings WHERE patient_id=? ORDER BY created DESC LIMIT 1", (pid,)).fetchone()
    alerts = con.execute("SELECT COUNT(*) FROM alerts WHERE patient_id=? AND resolved=0", (pid,)).fetchone()[0]
    props = con.execute("SELECT COUNT(*) FROM proposals WHERE patient_id=? AND status='pending'", (pid,)).fetchone()[0]
    return {"last_training": dict(last) if last else None, "open_alerts": alerts, "pending_proposals": props}


# ---------------------------------------------------------------- buổi tập: kiểm tra dữ liệu, đề xuất, phân tích
def clean_results(raw, p):
    if not isinstance(raw, list) or len(raw) > 9:
        raise ApiError(400, "Kết quả buổi tập không hợp lệ.")
    allowed = set(program_exs(p))
    out, seen = [], set()
    for r in raw:
        if not isinstance(r, dict):
            raise ApiError(400, "Kết quả buổi tập không hợp lệ.")
        ex = r.get("ex")
        if not isinstance(ex, int) or ex not in allowed or ex in seen:
            raise ApiError(400, "Bài tập không thuộc chương trình hiện tại.")
        lvl = r.get("level")
        if not isinstance(lvl, str) or lvl not in LEVELS[ex]:
            raise ApiError(400, "Mức tập không hợp lệ.")
        seen.add(ex)
        meas = r.get("measures") if isinstance(r.get("measures"), list) else []
        meas = [{"key": str(m.get("key", ""))[:20], "label": str(m.get("label", ""))[:60], "value": num(m.get("value"), -1e4, 1e4, 0), "unit": str(m.get("unit", ""))[:12]}
                for m in meas[:6] if isinstance(m, dict)]
        pain = r.get("pain")
        out.append({
            "ex": ex, "level": lvl,
            "planned": int(num(r.get("planned"), 0, 1000, 0)), "done": int(num(r.get("done"), 0, 1000, 0)),
            "completion": num(r.get("completion"), 0, 1, 0), "stopped": bool(r.get("stopped")),
            "pain": None if pain is None else int(num(pain, 0, 10)), "measures": meas,
            "vs_healthy": None if r.get("vs_healthy") is None else num(r.get("vs_healthy"), 0, 5, 0),
            "warnings": [str(w)[:120] for w in (r.get("warnings") or [])[:5] if isinstance(w, str)],
            "skipped": bool(r.get("skipped")),
        })
    return out


def clean_answers(raw):
    if not isinstance(raw, dict):
        return {}
    out = {}
    for k in ("pain", "fatigue"):
        if raw.get(k) is not None:
            out[k] = int(num(raw.get(k), 0, 10))
    for k in ("weak_sudden", "swelling", "pain_up", "numb"):
        if k in raw:
            out[k] = bool(raw.get(k))
    return out


def make_proposals(con, p, results, training_id):
    """App chỉ ĐỀ XUẤT; chuyên viên duyệt trên web."""
    levels = jload(p["levels"], {})
    made = []
    rows = con.execute("SELECT id, results FROM trainings WHERE patient_id=? AND status!='blocked' ORDER BY created DESC LIMIT 12",
                       (p["id"],)).fetchall()
    for r in results:
        ex, lvl = r["ex"], r["level"]
        cur = levels.get(str(ex), lvl)
        if lvl != cur:
            continue
        hist = []
        for row in rows:
            for x in jload(row["results"], []):
                if x.get("ex") == ex and x.get("level") == cur:
                    hist.append(x)
            if len(hist) >= 2:
                break
        ls = LEVELS[ex]
        i = ls.index(cur)
        to, reason = None, ""
        if (r["completion"] < 0.5 or r["stopped"]) and i > 0:
            to = ls[i - 1]
            reason = "Phải dừng bài giữa chừng." if r["stopped"] else f"Chỉ hoàn thành {round(r['completion'] * 100)}% buổi gần nhất."
        elif len(hist) >= 2 and i < len(ls) - 1 and all(
                h.get("completion", 0) >= 0.9 and h.get("pain") is not None and h["pain"] <= 2 for h in hist[:2]):
            to = ls[i + 1]
            reason = "Hai buổi gần nhất đều hoàn thành từ 90% và đau không quá 2/10."
        if not to:
            continue
        pend = con.execute("SELECT id, to_level FROM proposals WHERE patient_id=? AND ex=? AND status='pending'", (p["id"], ex)).fetchone()
        if pend and pend["to_level"] == to:
            continue
        if pend:
            con.execute("UPDATE proposals SET status='replaced', decided_at=? WHERE id=?", (now(), pend["id"]))
        con.execute("INSERT INTO proposals (patient_id, created, ex, from_level, to_level, reason) VALUES (?,?,?,?,?,?)",
                    (p["id"], now(), ex, cur, to, reason))
        made.append({"ex": ex, "from": cur, "to": to, "up": ls.index(to) > i})
    return made


def analysis_lines(p, status, stop_reason, pre, post, results, proposals):
    call = p["call_name"]
    lines = []
    if status == "blocked":
        lines.append(f"Hôm nay {call.lower()} không tập: {stop_reason or 'khoá an toàn'}.")
        lines.append("Gia đình nên hỏi thăm và theo dõi thêm; nếu có dấu hiệu bất thường hãy liên hệ bác sĩ.")
        return lines
    n = len(results)
    avg = round(sum(r["completion"] for r in results) / n * 100) if n else 0
    lines.append(f"{call} tập {n} bài, hoàn thành trung bình {avg}%.")
    if status == "stopped":
        lines.append(f"Buổi tập dừng giữa chừng: {stop_reason or 'theo khoá an toàn'}.")
    if n:
        best = max(results, key=lambda r: r["completion"])
        worst = min(results, key=lambda r: r["completion"])
        lines.append(f"Tốt nhất: {EX_NAMES[best['ex']]} (mức {best['level']}, {round(best['completion'] * 100)}%).")
        if worst["completion"] < 0.8 and worst is not best:
            lines.append(f"Cần chú ý: {EX_NAMES[worst['ex']]} (mức {worst['level']}, {round(worst['completion'] * 100)}%).")
    if "pain" in pre and "pain" in post:
        d = post["pain"] - pre["pain"]
        lines.append(f"Đau đầu buổi {pre['pain']}/10, cuối buổi {post['pain']}/10" + (f" (tăng {d} điểm)." if d > 0 else "."))
    if "fatigue" in post:
        lines.append(f"Mức mệt cuối buổi: {post['fatigue']}/10.")
    warns = sum(len(r["warnings"]) for r in results)
    if warns:
        lines.append(f"Có {warns} cảnh báo an toàn trong buổi (xem mục Cảnh báo).")
    if proposals:
        ups = [EX_NAMES[x["ex"]].lower() for x in proposals if x["up"]]
        downs = [EX_NAMES[x["ex"]].lower() for x in proposals if not x["up"]]
        parts = []
        if ups:
            parts.append("lên mức " + ", ".join(ups))
        if downs:
            parts.append("xuống mức " + ", ".join(downs))
        lines.append("Đã gửi đề xuất cho chuyên viên: " + "; ".join(parts) + ".")
    return lines


# ---------------------------------------------------------------- xử lý yêu cầu
ROUTES = []


def route(method, pattern):
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        ROUTES.append((method, rx, fn))
        return fn
    return deco


@route("POST", "/api/register")
def api_register(h, con, acc, body):
    username = text(body.get("username"), "Tên đăng nhập", 3, 40).lower()
    if not re.fullmatch(r"[a-z0-9._-]+", username):
        raise ApiError(400, "Tên đăng nhập chỉ gồm chữ không dấu, số, dấu chấm, gạch.")
    password = body.get("password")
    if not isinstance(password, str) or len(password) < 6 or len(password) > 200:
        raise ApiError(400, "Mật khẩu cần ít nhất 6 ký tự.")
    name = text(body.get("name"), "Tên hiển thị", 1, 60)
    if con.execute("SELECT 1 FROM accounts WHERE username=?", (username,)).fetchone():
        raise ApiError(409, "Tên đăng nhập đã có người dùng.")
    salt = secrets.token_hex(16)
    cur = con.execute("INSERT INTO accounts (username, name, salt, hash, created) VALUES (?,?,?,?,?)",
                      (username, name, salt, hash_pw(password, salt), now()))
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO auth (token, account_id, created) VALUES (?,?,?)", (token, cur.lastrowid, now()))
    con.commit()
    h.set_cookie = token
    return {"id": cur.lastrowid, "username": username, "name": name}


@route("POST", "/api/login")
def api_login(h, con, acc, body):
    username = str(body.get("username") or "").strip().lower()
    password = str(body.get("password") or "")
    row = con.execute("SELECT * FROM accounts WHERE username=?", (username,)).fetchone()
    if not row or not hmac.compare_digest(row["hash"], hash_pw(password, row["salt"])):
        time.sleep(0.4)
        raise ApiError(401, "Sai tên đăng nhập hoặc mật khẩu.")
    token = secrets.token_urlsafe(32)
    con.execute("INSERT INTO auth (token, account_id, created) VALUES (?,?,?)", (token, row["id"], now()))
    con.commit()
    h.set_cookie = token
    return {"id": row["id"], "username": row["username"], "name": row["name"]}


@route("POST", "/api/logout")
def api_logout(h, con, acc, body):
    tok = h.cookie_token()
    if tok:
        con.execute("DELETE FROM auth WHERE token=?", (tok,))
        con.commit()
    h.set_cookie = ""
    return {"ok": True}


@route("GET", "/api/me")
def api_me(h, con, acc, body):
    return {"id": acc["id"], "username": acc["username"], "name": acc["name"]}


@route("GET", "/api/patients")
def api_patients(h, con, acc, body):
    rows = con.execute("SELECT p.*, a.role AS my_role FROM patients p JOIN access a ON a.patient_id=p.id WHERE a.account_id=? ORDER BY p.created",
                       (acc["id"],)).fetchall()
    out = []
    for r in rows:
        d = patient_dict(r, r["my_role"])
        d["summary"] = summary_for(con, r["id"])
        out.append(d)
    return out


@route("POST", "/api/patients")
def api_patient_create(h, con, acc, body):
    name = text(body.get("name"), "Tên người tập", 1, 60)
    call = body.get("call_name") if body.get("call_name") in CALL_NAMES else "Bố"
    sex = "F" if body.get("sex") == "F" else "M"
    age = int(num(body.get("age"), 1, 120, 60))
    program = body.get("program") if body.get("program") in PROGRAMS else "dotquy"
    role = "nguoinha" if body.get("my_role") == "nguoinha" else "chuyenvien"
    levels = {str(k): v for k, v in DEFAULT_LEVELS[program].items()}
    cur = con.execute(
        "INSERT INTO patients (name, call_name, sex, age, program, levels, code_cv, code_nn, created) VALUES (?,?,?,?,?,?,?,?,?)",
        (name, call, sex, age, program, json.dumps(levels), new_code(con, "code_cv"), new_code(con, "code_nn"), now()))
    con.execute("INSERT INTO access (account_id, patient_id, role) VALUES (?,?,?)", (acc["id"], cur.lastrowid, role))
    con.commit()
    p = get_access(con, acc["id"], cur.lastrowid)
    return patient_dict(p, role)


@route("POST", "/api/join")
def api_join(h, con, acc, body):
    code = str(body.get("code") or "").strip().upper()
    row = con.execute("SELECT id, code_cv, code_nn FROM patients WHERE code_cv=? OR code_nn=?", (code, code)).fetchone()
    if not row or not code:
        time.sleep(0.4)
        raise ApiError(404, "Mã không đúng.")
    role = "chuyenvien" if row["code_cv"] == code else "nguoinha"
    con.execute("INSERT OR REPLACE INTO access (account_id, patient_id, role) VALUES (?,?,?)", (acc["id"], row["id"], role))
    con.commit()
    notify(con, row["id"], "patient")
    return {"patient_id": row["id"], "role": role}


@route("GET", r"/api/patients/(\d+)")
def api_patient(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    d = patient_dict(p, p["my_role"])
    d["summary"] = summary_for(con, p["id"])
    t = con.execute("SELECT * FROM tests WHERE patient_id=? ORDER BY created DESC LIMIT 1", (p["id"],)).fetchone()
    d["latest_test"] = {"id": t["id"], "created": t["created"], "data": jload(t["data"], {})} if t else None
    return d


@route("POST", r"/api/patients/(\d+)/settings")
def api_settings(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid), roles=("chuyenvien",))
    sets, vals = [], []
    if body.get("program") in PROGRAMS:
        sets.append("program=?"); vals.append(body["program"])
    for key in ("force_allowed", "shoulder_unlocked", "demo_mode"):
        if key in body:
            sets.append(f"{key}=?"); vals.append(1 if body[key] else 0)
    if "force_limit" in body:
        sets.append("force_limit=?"); vals.append(round(num(body["force_limit"], 0.5, 100), 1))
    if isinstance(body.get("levels"), dict):
        levels = jload(p["levels"], {})
        for k, v in body["levels"].items():
            if k.isdigit() and int(k) in LEVELS and isinstance(v, str) and v in LEVELS[int(k)]:
                levels[k] = v
        sets.append("levels=?"); vals.append(json.dumps(levels))
    if sets:
        con.execute(f"UPDATE patients SET {', '.join(sets)} WHERE id=?", (*vals, p["id"]))
        con.commit()
        notify(con, p["id"], "patient")
    return api_patient(h, con, acc, body, pid)


@route("GET", r"/api/patients/(\d+)/trainings")
def api_trainings(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    rows = con.execute("SELECT * FROM trainings WHERE patient_id=? ORDER BY created DESC LIMIT 60", (p["id"],)).fetchall()
    return [{"id": r["id"], "created": r["created"], "author": r["author"], "status": r["status"], "stop_reason": r["stop_reason"],
             "pre": jload(r["pre"], {}), "post": jload(r["post"], {}), "results": jload(r["results"], []),
             "avg_completion": r["avg_completion"]} for r in rows]


@route("POST", r"/api/patients/(\d+)/trainings")
def api_training_save(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    status = body.get("status") if body.get("status") in ("done", "stopped", "blocked") else "done"
    results = clean_results(body.get("results") or [], p)
    pre, post = clean_answers(body.get("pre")), clean_answers(body.get("post"))
    stop_reason = str(body.get("stop_reason") or "")[:200] or None
    avg = sum(r["completion"] for r in results) / len(results) if results else 0
    cur = con.execute("INSERT INTO trainings (patient_id, author, created, status, stop_reason, pre, post, results, avg_completion) VALUES (?,?,?,?,?,?,?,?,?)",
                      (p["id"], acc["name"], now(), status, stop_reason, json.dumps(pre), json.dumps(post), json.dumps(results), avg))
    proposals = make_proposals(con, p, results, cur.lastrowid) if status != "blocked" else []
    call = p["call_name"]
    title = {"done": f"{call} vừa tập xong!", "stopped": f"{call} đã dừng buổi tập giữa chừng", "blocked": f"{call} không tập hôm nay"}[status]
    lines = analysis_lines(p, status, stop_reason, pre, post, results, proposals)
    con.execute("INSERT INTO messages (patient_id, created, author, role, kind, text, lines) VALUES (?,?,?,?,?,?,?)",
                (p["id"], now(), "Bốp Bốp", "app", "auto", title, json.dumps(lines)))
    con.commit()
    notify(con, p["id"], "training")
    return {"id": cur.lastrowid, "proposals": proposals, "lines": lines}


@route("GET", r"/api/patients/(\d+)/alerts")
def api_alerts(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    rows = con.execute("SELECT * FROM alerts WHERE patient_id=? ORDER BY created DESC LIMIT 100", (p["id"],)).fetchall()
    return [dict(r) for r in rows]


@route("POST", r"/api/patients/(\d+)/alerts")
def api_alert_add(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    typ = body.get("type")
    if typ not in ALERT_TYPES:
        raise ApiError(400, "Loại cảnh báo không hợp lệ.")
    msg = text(body.get("message"), "Nội dung", 1, 300)
    cur = con.execute("INSERT INTO alerts (patient_id, created, type, severity, message) VALUES (?,?,?,?,?)",
                      (p["id"], now(), typ, ALERT_TYPES[typ], msg))
    con.commit()
    notify(con, p["id"], "alert")
    return {"id": cur.lastrowid}


@route("POST", r"/api/alerts/(\d+)/resolve")
def api_alert_resolve(h, con, acc, body, aid):
    row = con.execute("SELECT patient_id FROM alerts WHERE id=?", (int(aid),)).fetchone()
    if not row:
        raise ApiError(404, "Không tìm thấy cảnh báo.")
    get_access(con, acc["id"], row["patient_id"])
    con.execute("UPDATE alerts SET resolved=1, resolved_by=? WHERE id=?", (acc["name"], int(aid)))
    con.commit()
    notify(con, row["patient_id"], "alert")
    return {"ok": True}


@route("GET", r"/api/patients/(\d+)/proposals")
def api_proposals(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    rows = con.execute("SELECT * FROM proposals WHERE patient_id=? ORDER BY status='pending' DESC, created DESC LIMIT 100", (p["id"],)).fetchall()
    return [dict(r) for r in rows]


@route("POST", r"/api/proposals/(\d+)/decide")
def api_proposal_decide(h, con, acc, body, prid):
    row = con.execute("SELECT * FROM proposals WHERE id=?", (int(prid),)).fetchone()
    if not row:
        raise ApiError(404, "Không tìm thấy đề xuất.")
    p = get_access(con, acc["id"], row["patient_id"], roles=("chuyenvien",))
    if row["status"] != "pending":
        raise ApiError(409, "Đề xuất này đã được xử lý.")
    approve = bool(body.get("approve"))
    con.execute("UPDATE proposals SET status=?, decided_by=?, decided_at=? WHERE id=?",
                ("approved" if approve else "rejected", acc["name"], now(), row["id"]))
    if approve:
        levels = jload(p["levels"], {})
        levels[str(row["ex"])] = row["to_level"]
        con.execute("UPDATE patients SET levels=? WHERE id=?", (json.dumps(levels), p["id"]))
    con.commit()
    notify(con, p["id"], "patient")
    return {"ok": True}


@route("GET", r"/api/patients/(\d+)/tests")
def api_tests(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    rows = con.execute("SELECT * FROM tests WHERE patient_id=? ORDER BY created DESC LIMIT 30", (p["id"],)).fetchall()
    return [{"id": r["id"], "created": r["created"], "author": r["author"], "data": jload(r["data"], {})} for r in rows]


TEST_KEYS = ("grip", "pinch", "raise", "wrist", "pron", "sup", "open", "release", "pick60", "grip_sd")


@route("POST", r"/api/patients/(\d+)/tests")
def api_test_save(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    data = body.get("metrics")
    if not isinstance(data, dict):
        raise ApiError(400, "Thiếu số đo.")
    clean = {}
    for k in TEST_KEYS:
        m = data.get(k)
        if not isinstance(m, dict):
            continue
        item = {"healthy": num(m.get("healthy"), 0, 1000), "weak": num(m.get("weak"), 0, 1000)}
        for side in ("healthy", "weak"):
            tr = m.get("trials", {}).get(side) if isinstance(m.get("trials"), dict) else None
            if isinstance(tr, list):
                item.setdefault("trials", {})[side] = [num(x, 0, 1000) for x in tr[:5]]
        clean[k] = item
    if not clean:
        raise ApiError(400, "Chưa có số đo nào.")
    warns = [str(w)[:200] for w in (body.get("warnings") or [])[:10] if isinstance(w, str)]
    cur = con.execute("INSERT INTO tests (patient_id, created, author, data) VALUES (?,?,?,?)",
                      (p["id"], now(), acc["name"], json.dumps({"metrics": clean, "warnings": warns})))
    con.commit()
    notify(con, p["id"], "test")
    return {"id": cur.lastrowid}


@route("GET", r"/api/patients/(\d+)/messages")
def api_messages(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    rows = con.execute("SELECT * FROM messages WHERE patient_id=? ORDER BY created DESC LIMIT 80", (p["id"],)).fetchall()
    return [{**dict(r), "lines": jload(r["lines"], [])} for r in rows]


@route("POST", r"/api/patients/(\d+)/messages")
def api_message_add(h, con, acc, body, pid):
    p = get_access(con, acc["id"], int(pid))
    msg = text(body.get("text"), "Lời nhắn", 1, 500)
    via = body.get("via")
    role = "nguoitap" if via == "app" else p["my_role"]
    kind = "reply" if role == "chuyenvien" else "cheer"
    con.execute("INSERT INTO messages (patient_id, created, author, role, kind, text) VALUES (?,?,?,?,?,?)",
                (p["id"], now(), p["call_name"] if role == "nguoitap" else acc["name"], role, kind, msg))
    con.commit()
    notify(con, p["id"], "message")
    return {"ok": True}


@route("GET", "/api/feed")
def api_feed(h, con, acc, body):
    """Thông báo gần đây của mọi người tập mà tài khoản này được xem."""
    pids = [r[0] for r in con.execute("SELECT patient_id FROM access WHERE account_id=?", (acc["id"],))]
    if not pids:
        return []
    marks = ",".join("?" * len(pids))
    names = {r["id"]: r["call_name"] + " " + r["name"] for r in con.execute(f"SELECT id, name, call_name FROM patients WHERE id IN ({marks})", pids)}
    items = []
    for r in con.execute(f"SELECT id, patient_id, created, severity, message, resolved FROM alerts WHERE patient_id IN ({marks}) ORDER BY created DESC LIMIT 30", pids):
        items.append({"kind": "alert", "id": r["id"], "patient_id": r["patient_id"], "created": r["created"], "severity": r["severity"],
                      "text": r["message"], "resolved": bool(r["resolved"]), "who": names.get(r["patient_id"], "")})
    for r in con.execute(f"SELECT id, patient_id, created, author, kind, text FROM messages WHERE patient_id IN ({marks}) ORDER BY created DESC LIMIT 30", pids):
        items.append({"kind": "message", "id": r["id"], "patient_id": r["patient_id"], "created": r["created"], "author": r["author"],
                      "text": r["text"], "who": names.get(r["patient_id"], "")})
    for r in con.execute(f"SELECT id, patient_id, created, ex, from_level, to_level FROM proposals WHERE patient_id IN ({marks}) AND status='pending' ORDER BY created DESC LIMIT 30", pids):
        items.append({"kind": "proposal", "id": r["id"], "patient_id": r["patient_id"], "created": r["created"],
                      "text": f"Đề xuất {EX_NAMES[r['ex']]}: mức {r['from_level']} → {r['to_level']}", "who": names.get(r["patient_id"], "")})
    items.sort(key=lambda x: -x["created"])
    return items[:40]


# ---------------------------------------------------------------- máy chủ HTTP
PAGES = {"/": "index.html", "/app": "app.html", "/web": "web.html"}
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")


class Handler(BaseHTTPRequestHandler):
    server_version = "BopBop/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if "/api/stream" not in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def cookie_token(self):
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "bb_sid":
                return v
        return None

    def account(self, con):
        tok = self.cookie_token()
        if not tok:
            return None
        row = con.execute("SELECT a.*, t.created AS tcreated FROM auth t JOIN accounts a ON a.id=t.account_id WHERE t.token=?", (tok,)).fetchone()
        if not row:
            return None
        if now() - row["tcreated"] > SESSION_DAYS * 86400:
            con.execute("DELETE FROM auth WHERE token=?", (tok,))
            con.commit()
            return None
        return row

    def send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        cookie = getattr(self, "set_cookie", None)
        if cookie is not None:
            if cookie:
                self.send_header("Set-Cookie", f"bb_sid={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_DAYS * 86400}")
            else:
                self.send_header("Set-Cookie", "bb_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
        self.end_headers()
        self.wfile.write(data)

    def serve_static(self, path):
        rel = PAGES.get(path, path.lstrip("/"))
        full = os.path.normpath(os.path.join(STATIC, rel))
        if not full.startswith(STATIC + os.sep) or not os.path.isfile(full):
            return self.send_plain(404, "Not found")
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if ext == ".html":
            self.send_header("Content-Security-Policy", CSP)
        self.end_headers()
        self.wfile.write(data)

    def stream(self):
        con = db()
        try:
            acc = self.account(con)
        finally:
            con.close()
        if not acc:
            self.send_json(401, {"error": "Chưa đăng nhập."})
            return
        q = queue.Queue(maxsize=200)
        with LISTEN_LOCK:
            LISTENERS.setdefault(acc["id"], set()).add(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(b"retry: 3000\n\n")
            self.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=15)
                    self.wfile.write(("data: " + ev + "\n\n").encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            with LISTEN_LOCK:
                LISTENERS.get(acc["id"], set()).discard(q)
            self.close_connection = True

    def handle_api(self, method):
        path = urlparse(self.path).path
        if path == "/api/stream" and method == "GET":
            return self.stream()
        self.set_cookie = None
        body = {}
        if method == "POST":
            if self.headers.get("X-BB") != "1":
                return self.send_json(403, {"error": "Yêu cầu không hợp lệ."})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self.send_json(413, {"error": "Dữ liệu quá lớn."})
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw.decode("utf-8") or "{}")
            except (ValueError, UnicodeDecodeError):
                return self.send_json(400, {"error": "Dữ liệu không đọc được."})
            if not isinstance(body, dict):
                return self.send_json(400, {"error": "Dữ liệu không hợp lệ."})
        for m, rx, fn in ROUTES:
            if m != method:
                continue
            mt = rx.match(path)
            if not mt:
                continue
            con = db()
            try:
                acc = self.account(con)
                if fn not in (api_register, api_login, api_logout) and not acc:
                    return self.send_json(401, {"error": "Chưa đăng nhập."})
                if method == "POST":
                    with WRITE_LOCK:
                        res = fn(self, con, acc, body, *mt.groups())
                else:
                    res = fn(self, con, acc, body, *mt.groups())
                return self.send_json(200, res)
            except ApiError as e:
                return self.send_json(e.status, {"error": e.message})
            except sqlite3.IntegrityError:
                return self.send_json(409, {"error": "Dữ liệu bị trùng."})
            finally:
                con.close()
        return self.send_json(404, {"error": "Không có địa chỉ này."})

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self.handle_api("GET")
        return self.serve_static(path)

    def send_plain(self, status, msg):
        data = msg.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self.handle_api("POST")
        self.send_plain(405, "Method not allowed")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    global DB_PATH
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description="Máy chủ Bốp Bốp")
    ap.add_argument("--port", type=int, default=8800)
    ap.add_argument("--lan", action="store_true", help="mở cho điện thoại cùng mạng Wi-Fi truy cập")
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    ap.add_argument("--db", default=os.path.join(base, "BopBop", "bopbop.db"), help="đường dẫn tệp dữ liệu SQLite")
    args = ap.parse_args()
    DB_PATH = os.path.abspath(args.db)
    init_db()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    srv = ThreadingHTTPServer((host, args.port), Handler)
    srv.daemon_threads = True
    print(f"Bốp Bốp đang chạy: http://localhost:{args.port}  (dữ liệu: {DB_PATH})", flush=True)
    if args.lan:
        print(f"Điện thoại cùng Wi-Fi mở: http://{lan_ip()}:{args.port}/app", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
