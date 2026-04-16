// ── Navbar ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  if (hamburger) hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
  document.querySelectorAll('.dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      btn.closest('.dropdown').classList.toggle('open');
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown'))
      document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  });

  // Inject notification badge on student nav after DB is ready
  // We defer so that initDB() called by the page has time to run.
  setTimeout(injectNotifNavBadge, 600);
});

// ── Notification badge on top nav (student pages only) ────────
function injectNotifNavBadge() {
  // Find the Notifications link in the nav (student pages)
  const navLink = [...document.querySelectorAll('.nav-links a')]
    .find(a => a.href && a.href.includes('student_notifications.html'));
  if (!navLink) return; // admin pages – do nothing

  // Wrap text with badge container if not already wrapped
  if (!navLink.classList.contains('notif-nav-link')) {
    navLink.classList.add('notif-nav-link');
  }

  // Remove any existing badge before re-rendering
  navLink.querySelector('.notif-nav-badge')?.remove();

  // Compute unread count ──────────────────────────────────────
  const readSet = new Set(JSON.parse(localStorage.getItem('ccs_read_notifs') || '[]'));
  const ids = [];

  // 1. Announcements (text only)
  const anns = JSON.parse(localStorage.getItem('ccs_announcements') || '[]');
  anns.forEach((a, i) => { if (a.text) ids.push('ann_' + i); });

  // 2. Session alerts — need student data
  try {
    const sess = sessionGet();
    if (sess) {
      const student = dbGetStudent(sess.id_number);
      if (student) {
        if (student.session_cnt <= 5)                                ids.push('sess_low');
        if (student.session_cnt <= 15 && student.session_cnt > 5)   ids.push('sess_mid');

        // 3. Reservation updates
        try {
          const r = db.exec(
            `SELECT id FROM reservations WHERE id_number=? AND status IN ('Accepted','Denied') ORDER BY rowid DESC LIMIT 10`,
            [student.id_number]);
          if (r.length && r[0].values.length) r[0].values.forEach(v => ids.push('res_' + v[0]));
        } catch(e) {}

        // 4. Points awarded
        try {
          dbGetPointsLog(student.id_number).slice(0, 5).forEach((_, i) => ids.push('pts_' + i));
        } catch(e) {}
      }
    }
  } catch(e) {}

  const unread = ids.filter(id => !readSet.has(id)).length;
  if (unread <= 0) return;

  // Inject badge ─────────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className   = 'notif-nav-badge';
  badge.textContent = unread > 99 ? '99+' : String(unread);
  navLink.appendChild(badge);
}

// ── Password toggle ───────────────────────────────────────────
function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.innerHTML = inp.type === 'password' ? '&#128065;' : '&#128064;';
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = '') {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.transition='opacity .35s'; t.style.opacity='0'; setTimeout(()=>t.remove(),400); }, 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── Courses ───────────────────────────────────────────────────
const COURSE_SHORT = {
  'Information Technology':                      'IT',
  'Computer Engineering':                        'CpE',
  'Civil Engineering':                           'CE',
  'Mechanical Engineering':                      'ME',
  'Electrical Engineering':                      'EE',
  'Industrial Engineering':                      'IE',
  'Naval Architecture and Marine Engineering':   'NAME',
  'Elementary Education (BEEd)':                'BEEd',
  'Secondary Education (BSEd)':                 'BSEd',
  'Criminology':                                 'Crim',
  'Commerce':                                    'BCom',
  'Accountancy':                                 'BSA',
  'Hotel and Restaurant Management':             'HRM',
  'Customs Administration':                      'CA',
  'Computer Secretarial':                        'CS',
  'Industrial Psychology':                       'IP',
  'AB Political Science':                        'PolSci',
  'AB English':                                  'AB Eng',
};
const COURSE_LIST = Object.keys(COURSE_SHORT);

// ── Programming Languages (for Sit-in Purpose dropdown) ───────
const PROG_LANGUAGES = [
  'C Programming', 'C++', 'C#', 'Java', 'JavaScript',
  'Python', 'PHP', 'Ruby', 'Swift', 'Kotlin',
  'Go', 'Rust', 'TypeScript', 'HTML/CSS', 'SQL',
  'R', 'MATLAB', 'Assembly', 'Dart', 'Scala',
  'Visual Basic', 'ASP.Net', 'React', 'Node.js', 'Other'
];

// ── Lab Rooms ─────────────────────────────────────────────────
const LAB_ROOMS = ['524', '526', '530', '542', '544'];

// ── Admin guard ───────────────────────────────────────────────
function requireAdmin() {
  if (localStorage.getItem('ccs_admin_session') !== '1') window.location.href = 'login.html';
}
function adminLogout() {
  localStorage.removeItem('ccs_admin_session');
  window.location.href = 'login.html';
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('show'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

// ── Enter key clicks OK on any open modal ─────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const openModal = document.querySelector('.modal-overlay.show');
  if (!openModal) return;
  const okBtn = openModal.querySelector('.modal-ok');
  if (okBtn) { e.preventDefault(); okBtn.click(); }
});

// ── Date format ───────────────────────────────────────────────
function fmtDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getFullYear()}-${months[d.getMonth()]}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Profile Picture helpers ───────────────────────────────────
function previewPic(inputEl, previewImgId, initialsId) {
  const file = inputEl.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingPic = e.target.result;
    const img = document.getElementById(previewImgId);
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    const init = document.getElementById(initialsId);
    if (init) init.style.display = 'none';
  };
  reader.readAsDataURL(file);
}