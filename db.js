// ============================================================
//  db.js — SQLite via sql.js (WebAssembly)
// ============================================================
const DB_KEY = 'ccs_sqlite_db';
let SQL = null;
let db  = null;

async function initDB() {
  let waited = 0;
  while (typeof initSqlJs === 'undefined') {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
    if (waited > 10000) throw new Error('sql.js CDN failed to load');
  }
  SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
  });
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    db = new SQL.Database(Uint8Array.from(atob(saved), c => c.charCodeAt(0)));
  } else {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number   TEXT UNIQUE NOT NULL,
    lastname    TEXT NOT NULL,
    firstname   TEXT NOT NULL,
    midname     TEXT DEFAULT '',
    course      TEXT NOT NULL,
    year_level  TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    address     TEXT NOT NULL,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    session_cnt INTEGER DEFAULT 30,
    created_at  TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sit_in (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number TEXT NOT NULL,
    name      TEXT NOT NULL,
    purpose   TEXT NOT NULL,
    lab       TEXT NOT NULL,
    session   INTEGER,
    status    TEXT DEFAULT 'Active',
    time_in   TEXT DEFAULT (datetime('now')),
    time_out  TEXT
  )`);
  saveDB();
}

function saveDB() {
  const data = db.export();
  localStorage.setItem(DB_KEY, btoa(String.fromCharCode(...data)));
}

// ── Students ─────────────────────────────────────────────────
function dbRegister(s) {
  try {
    db.run(`INSERT INTO students (id_number,lastname,firstname,midname,course,year_level,email,address,username,password)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [s.id_number,s.lastname,s.firstname,s.midname||'',s.course,s.year_level,s.email,s.address,s.username,s.password]);
    saveDB();
    return { ok: true };
  } catch(e) {
    const m = e.message||'';
    if (m.includes('id_number')) return { ok:false, error:'ID Number already registered.' };
    if (m.includes('email'))     return { ok:false, error:'Email already registered.' };
    if (m.includes('username'))  return { ok:false, error:'Username already taken.' };
    return { ok:false, error:'Registration failed.' };
  }
}

function dbLogin(id_number, password) {
  const r = db.exec('SELECT * FROM students WHERE id_number=? AND password=?', [id_number, password]);
  return (r.length && r[0].values.length) ? rowToObj(r[0]) : null;
}

function dbGetStudent(id_number) {
  const r = db.exec('SELECT * FROM students WHERE id_number=?', [id_number]);
  return (r.length && r[0].values.length) ? rowToObj(r[0]) : null;
}

function dbGetAllStudents() {
  const r = db.exec('SELECT * FROM students ORDER BY id_number');
  return (r.length && r[0].values.length) ? r[0].values.map((_,i) => rowToObj(r[0],i)) : [];
}

function dbUpdateStudent(id_number, d) {
  try {
    db.run(`UPDATE students SET lastname=?,firstname=?,midname=?,course=?,year_level=?,email=?,address=?,username=?,password=? WHERE id_number=?`,
      [d.lastname,d.firstname,d.midname||'',d.course,d.year_level,d.email,d.address,d.username,d.password,id_number]);
    saveDB();
    return { ok: true };
  } catch(e) {
    const m = e.message||'';
    if (m.includes('email'))    return { ok:false, error:'Email already used by another account.' };
    if (m.includes('username')) return { ok:false, error:'Username already taken.' };
    return { ok:false, error:'Update failed.' };
  }
}

function dbDeleteStudent(id_number) {
  db.run('DELETE FROM students WHERE id_number=?', [id_number]);
  saveDB();
}

function dbResetAllSessions() {
  db.run('UPDATE students SET session_cnt=30');
  saveDB();
}

function dbCountStudents() {
  const r = db.exec('SELECT COUNT(*) FROM students');
  return r.length ? r[0].values[0][0] : 0;
}

// ── Sit-in ────────────────────────────────────────────────────
function dbGetActiveSitins() {
  const r = db.exec("SELECT * FROM sit_in WHERE status='Active' ORDER BY id DESC");
  return (r.length && r[0].values.length) ? r[0].values.map((_,i) => rowToObj(r[0],i)) : [];
}

function dbGetAllSitins() {
  const r = db.exec('SELECT * FROM sit_in ORDER BY id DESC');
  return (r.length && r[0].values.length) ? r[0].values.map((_,i) => rowToObj(r[0],i)) : [];
}

function dbCountActiveSitins() {
  const r = db.exec("SELECT COUNT(*) FROM sit_in WHERE status='Active'");
  return r.length ? r[0].values[0][0] : 0;
}

function dbCountTotalSitins() {
  const r = db.exec('SELECT COUNT(*) FROM sit_in');
  return r.length ? r[0].values[0][0] : 0;
}

function dbAddSitin(id_number, name, purpose, lab, session) {
  db.run(`INSERT INTO sit_in (id_number,name,purpose,lab,session,status) VALUES (?,?,?,?,?,'Active')`,
    [id_number, name, purpose, lab, session]);
  db.run('UPDATE students SET session_cnt=session_cnt-1 WHERE id_number=?', [id_number]);
  saveDB();
}

function dbEndSitin(sitId) {
  db.run("UPDATE sit_in SET status='Done', time_out=datetime('now') WHERE id=?", [sitId]);
  saveDB();
}

// Pie chart data: sit-ins grouped by programming language (purpose)
function dbGetSitinsByPurpose() {
  const r = db.exec(`SELECT purpose, COUNT(*) as cnt FROM sit_in GROUP BY purpose ORDER BY cnt DESC`);
  if (!r.length || !r[0].values.length) return [];
  return r[0].values.map(row => ({ purpose: row[0], count: row[1] }));
}

// ── Points / Rewards ─────────────────────────────────────────
function dbEnsurePointsTable() {
  db.run(`CREATE TABLE IF NOT EXISTS student_points (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_number  TEXT NOT NULL,
    points     INTEGER NOT NULL DEFAULT 0,
    reason     TEXT DEFAULT '',
    awarded_at TEXT DEFAULT (datetime('now'))
  )`);
}

function dbAddPoints(id_number, points, reason) {
  dbEnsurePointsTable();
  db.run('INSERT INTO student_points (id_number, points, reason) VALUES (?,?,?)',
    [id_number, points, reason || '']);
  saveDB();
}

function dbGetTotalPoints(id_number) {
  dbEnsurePointsTable();
  const r = db.exec('SELECT COALESCE(SUM(points),0) FROM student_points WHERE id_number=?', [id_number]);
  return r.length ? (r[0].values[0][0] || 0) : 0;
}

function dbGetPointsLog(id_number) {
  dbEnsurePointsTable();
  const r = db.exec('SELECT points, reason, awarded_at FROM student_points WHERE id_number=? ORDER BY id DESC LIMIT 20', [id_number]);
  return (r.length && r[0].values.length) ? r[0].values.map(v => ({ points: v[0], reason: v[1], awarded_at: v[2] })) : [];
}

// Leaderboard: weighted score = 50% earned_pts + 30% sitin_hours + 20% task_completions
function dbGetLeaderboard() {
  dbEnsurePointsTable();
  const students = dbGetAllStudents();
  return students.map(s => {
    // Earned points
    const rp = db.exec('SELECT COALESCE(SUM(points),0) FROM student_points WHERE id_number=?', [s.id_number]);
    const earned = rp.length ? (rp[0].values[0][0] || 0) : 0;

    // Sit-in hours (count done sit-ins as proxy for hours; real hours need time_out)
    const rh = db.exec(
      `SELECT COUNT(*),
        SUM(CASE WHEN time_out IS NOT NULL
            THEN CAST((julianday(time_out) - julianday(time_in)) * 24 AS INTEGER)
            ELSE 0 END)
       FROM sit_in WHERE id_number=? AND status='Done'`, [s.id_number]);
    const sitinHours = (rh.length && rh[0].values[0][1]) ? parseInt(rh[0].values[0][1]) : 0;

    // Task completions = number of completed (Done) sit-ins for now
    const rc = db.exec(`SELECT COUNT(*) FROM sit_in WHERE id_number=? AND status='Done'`, [s.id_number]);
    const tasks = rc.length ? (rc[0].values[0][0] || 0) : 0;

    const score = Math.round(earned * 0.5 + sitinHours * 0.3 + tasks * 0.2);
    const fullname = [s.firstname, s.midname, s.lastname].filter(Boolean).join(' ');
    return { id_number: s.id_number, fullname, earned, sitinHours, tasks, score };
  }).sort((a, b) => b.score - a.score);
}

// Sit-ins per day for last 7 days (analytics)
function dbGetSitinsPerDay(days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const r = db.exec(
      `SELECT COUNT(*) FROM sit_in
       WHERE date(time_in) = date('now', '-${i} days')`
    );
    const cnt = r.length ? (r[0].values[0][0] || 0) : 0;
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({ label: d.toLocaleDateString('en-US', { month:'short', day:'numeric' }), count: cnt });
  }
  return result;
}

// ── Profile Picture ───────────────────────────────────────────
function saveProfilePic(id_number, base64) {
  localStorage.setItem('ccs_pic_' + id_number, base64);
}
function getProfilePic(id_number) {
  return localStorage.getItem('ccs_pic_' + id_number) || null;
}

// ── Session ───────────────────────────────────────────────────
function sessionSet(student) {
  localStorage.setItem('ccs_session', JSON.stringify({
    id_number: student.id_number,
    fullname:  [student.firstname, student.midname, student.lastname].filter(Boolean).join(' ')
  }));
}
function sessionGet() {
  const s = localStorage.getItem('ccs_session');
  return s ? JSON.parse(s) : null;
}
function sessionClear() {
  localStorage.removeItem('ccs_session');
}

// ── Helper ────────────────────────────────────────────────────
function rowToObj(result, rowIndex = 0) {
  const obj = {};
  result.columns.forEach((col, i) => obj[col] = result.values[rowIndex][i]);
  return obj;
}