// ============================================================
//  db.js — MySQL via PHP API (replaces sql.js/localStorage)
//  All functions keep the SAME signatures so HTML pages need
//  zero changes.
// ============================================================

// ── API endpoint (auto-detect base URL) ──────────────────────
const API_URL = (function() {
  // Get the directory of the current page
  const path = window.location.pathname;
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return window.location.origin + dir + 'api.php';
})();

// ── The global `db` object — mimics sql.js API ───────────────
// HTML pages call db.exec(sql, params) and db.run(sql, params)
// We proxy these to the PHP backend via synchronous XHR
const db = {
  exec: function(sql, params) {
    const response = apiCall('exec', sql, params || []);
    // sql.js returns array of {columns, values} — we match that format
    return response.results || [];
  },

  run: function(sql, params) {
    const response = apiCall('run', sql, params || []);
    if (response.error) {
      throw new Error(response.error);
    }
    return response;
  }
};

// ── Synchronous XHR to PHP API ───────────────────────────────
function apiCall(action, sql, params) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', API_URL, false); // false = synchronous
  xhr.setRequestHeader('Content-Type', 'application/json');

  try {
    xhr.send(JSON.stringify({ action, sql, params }));
    if (xhr.status === 200) {
      return JSON.parse(xhr.responseText);
    } else {
      console.error('API error:', xhr.status, xhr.responseText);
      return { results: [], error: 'HTTP ' + xhr.status };
    }
  } catch (e) {
    console.error('API call failed:', e);
    return { results: [], error: e.message };
  }
}

// ── initDB — verify PHP backend is reachable ─────────────────
async function initDB() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', API_URL, false);
    xhr.send();
    if (xhr.status === 200) {
      const resp = JSON.parse(xhr.responseText);
      if (resp.ok) {
        console.log('✅ Connected to MySQL database');
        return;
      }
    }
    console.error('❌ Cannot reach API:', xhr.responseText);
  } catch (e) {
    console.error('❌ Cannot reach MySQL API:', e.message);
  }
}

// ── saveDB — no-op (MySQL auto-persists) ─────────────────────
function saveDB() {
  // No-op: MySQL automatically persists data
}

// ── Students ─────────────────────────────────────────────────
function dbRegister(s) {
  try {
    db.run(`INSERT INTO students (id_number,lastname,firstname,midname,course,year_level,email,address,username,password)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [s.id_number,s.lastname,s.firstname,s.midname||'',s.course,s.year_level,s.email,s.address,s.username,s.password]);
    return { ok: true };
  } catch(e) {
    const m = e.message||'';
    if (m.includes('id_number') || m.includes('Duplicate') && m.includes('id_number')) return { ok:false, error:'ID Number already registered.' };
    if (m.includes('email'))     return { ok:false, error:'Email already registered.' };
    if (m.includes('username'))  return { ok:false, error:'Username already taken.' };
    return { ok:false, error:'Registration failed: ' + m };
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
}

function dbResetAllSessions() {
  db.run('UPDATE students SET session_cnt=30');
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
}

function dbEndSitin(sitId) {
  db.run("UPDATE sit_in SET status='Done', time_out=NOW() WHERE id=?", [sitId]);
}

// Pie chart data: sit-ins grouped by programming language (purpose)
function dbGetSitinsByPurpose() {
  const r = db.exec(`SELECT purpose, COUNT(*) as cnt FROM sit_in GROUP BY purpose ORDER BY cnt DESC`);
  if (!r.length || !r[0].values.length) return [];
  return r[0].values.map(row => ({ purpose: row[0], count: row[1] }));
}

// ── Points / Rewards ─────────────────────────────────────────
function dbEnsurePointsTable() {
  // Table is created by db_setup.php, but just in case:
  db.run(`CREATE TABLE IF NOT EXISTS student_points (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    id_number  VARCHAR(50) NOT NULL,
    points     INT NOT NULL DEFAULT 0,
    reason     VARCHAR(500) DEFAULT '',
    awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function dbAddPoints(id_number, points, reason) {
  db.run('INSERT INTO student_points (id_number, points, reason) VALUES (?,?,?)',
    [id_number, points, reason || '']);
}

function dbGetTotalPoints(id_number) {
  const r = db.exec('SELECT COALESCE(SUM(points),0) FROM student_points WHERE id_number=?', [id_number]);
  return r.length ? (r[0].values[0][0] || 0) : 0;
}

function dbGetPointsLog(id_number) {
  const r = db.exec('SELECT points, reason, awarded_at FROM student_points WHERE id_number=? ORDER BY id DESC LIMIT 20', [id_number]);
  return (r.length && r[0].values.length) ? r[0].values.map(v => ({ points: v[0], reason: v[1], awarded_at: v[2] })) : [];
}

// Leaderboard: weighted score = 50% earned_pts + 30% sitin_hours + 20% task_completions
function dbGetLeaderboard() {
  const students = dbGetAllStudents();
  return students.map(s => {
    // Earned points
    const rp = db.exec('SELECT COALESCE(SUM(points),0) FROM student_points WHERE id_number=?', [s.id_number]);
    const earned = rp.length ? (rp[0].values[0][0] || 0) : 0;

    // Sit-in hours
    const rh = db.exec(
      `SELECT COUNT(*),
        SUM(CASE WHEN time_out IS NOT NULL
            THEN TIMESTAMPDIFF(HOUR, time_in, time_out)
            ELSE 0 END)
       FROM sit_in WHERE id_number=? AND status='Done'`, [s.id_number]);
    const sitinHours = (rh.length && rh[0].values[0][1]) ? parseInt(rh[0].values[0][1]) : 0;

    // Task completions = number of completed (Done) sit-ins
    const rc = db.exec(`SELECT COUNT(*) FROM sit_in WHERE id_number=? AND status='Done'`, [s.id_number]);
    const tasks = rc.length ? (rc[0].values[0][0] || 0) : 0;

    const score = Math.round(earned * 0.5 + sitinHours * 0.3 + tasks * 0.2);
    const fullname = [s.firstname, s.midname, s.lastname].filter(Boolean).join(' ');
    return { id_number: s.id_number, fullname, earned, sitinHours, tasks, score };
  }).sort((a, b) => b.score - a.score);
}

// Sit-ins per day for last N days (analytics)
function dbGetSitinsPerDay(days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const r = db.exec(
      `SELECT COUNT(*) FROM sit_in
       WHERE DATE(time_in) = DATE_SUB(CURDATE(), INTERVAL ${i} DAY)`
    );
    const cnt = r.length ? (r[0].values[0][0] || 0) : 0;
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({ label: d.toLocaleDateString('en-US', { month:'short', day:'numeric' }), count: cnt });
  }
  return result;
}

// ── Profile Picture ───────────────────────────────────────────
// Stays in localStorage (per-browser, base64 data)
function saveProfilePic(id_number, base64) {
  localStorage.setItem('ccs_pic_' + id_number, base64);
}
function getProfilePic(id_number) {
  return localStorage.getItem('ccs_pic_' + id_number) || null;
}

// ── Session ───────────────────────────────────────────────────
// Stays in localStorage (per-browser login state)
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