import { api } from './api.js';
import { initLayout } from './layout.js';
import { esc, showLoading, showError, emptyHtml, fmtDate, fmtDay, fmtDateTime, fmtTime, fmtMoney, fmtPct } from './ui.js';

const content = document.getElementById('content');
const ACTION_TEXT = { login: 'logged in', password_changed: 'changed their password' };
let dashboardWindow = 7;
let pollingEnabled = true;
let requestSequence = 0;
let syncTimer;

const stat = (label, value, note = '') =>
  `<div class="col-6 col-lg"><div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>${note ? `<div class="stat-note">${esc(note)}</div>` : ''}</div></div>`;

const panel = (title, body, { flush = false, aside = '' } = {}) =>
  `<section class="panel h-100"><div class="panel-head"><h2>${esc(title)}</h2>${aside}</div><div class="panel-body${flush ? ' flush' : ''}">${body}</div></section>`;

const meter = (pct) => {
  const cls = pct === null ? '' : pct < 75 ? 'low' : pct < 85 ? 'mid' : '';
  return `<div class="meter ${cls}" role="img" aria-label="Attendance ${pct ?? 0} percent"><span style="width:${Math.min(pct ?? 0, 100)}%"></span></div>`;
};

const noticesPanel = (notices) =>
  panel('Notices', notices.length
    ? `<ul class="list-plain">${notices.map((n) => `<li><div class="fw-semibold">${esc(n.title)}</div><div class="muted small">${fmtDate(n.publish_date)}</div></li>`).join('')}</ul>`
    : emptyHtml('No notices', 'New notices from the school will appear here.', 'fa-bell'), { flush: notices.length > 0 });

const eventsPanel = (events = []) =>
  panel('Upcoming events', events.length
    ? `<ul class="list-plain">${events.map((e) => `<li><div class="fw-semibold">${esc(e.title)}</div><div class="muted small">${fmtDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` to ${fmtDate(e.endDate)}` : ''}</div></li>`).join('')}</ul>`
    : emptyHtml('No upcoming events', 'The school calendar will show here.', 'fa-calendar-days'), { flush: events.length > 0 });

const yearBanner = (d) => (d.hasAcademicYear ? '' :
  `<div class="alert alert-warning" role="status">No current academic year is set, so class, exam and fee figures are empty until one is created.</div>`);

const head = (title, sub) => `<div class="page-head mb-4"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;

const examsTable = (rows, withClass) =>
  rows.length
    ? `<div class="table-responsive"><table class="table"><thead><tr><th>Date</th>${withClass ? '<th>Class</th>' : ''}<th>Exam</th><th>Subject</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${fmtDay(r.exam_date)}</td>${withClass ? `<td>${esc(r.class_name)}</td>` : ''}<td>${esc(r.exam)}</td><td>${esc(r.subject)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyHtml('No upcoming exams', 'Scheduled exams will show up here.', 'fa-file-pen');

const count = (value) => Number(value || 0).toLocaleString('en-IN');

function animatedMetric(label, value, note, icon, accent = 'cyan') {
  return `<article class="intel-kpi intel-kpi-${accent}"><div class="intel-kpi-top"><span>${esc(label)}</span><i class="fa-solid ${icon}" aria-hidden="true"></i></div><strong data-count-to="${Number(value) || 0}">0</strong><small>${esc(note)}</small></article>`;
}

function radialAttendance(attendance) {
  const pct = attendance.studentsMarked ? Number(attendance.pct) || 0 : 0;
  const dash = Math.max(0, Math.min(100, pct)) * 2.2;
  return `<div class="attendance-radial" role="img" aria-label="Today's student attendance: ${attendance.studentsMarked ? esc(fmtPct(pct)) : 'not marked'}">
    <svg viewBox="0 0 84 84" aria-hidden="true"><circle class="radial-track" cx="42" cy="42" r="35"></circle><circle class="radial-value" cx="42" cy="42" r="35" stroke-dasharray="${dash} 220"></circle></svg>
    <span>${attendance.studentsMarked ? esc(fmtPct(pct)) : '--'}</span></div>`;
}

function trendGraphic(rows) {
  if (!rows.length) return emptyHtml('No attendance records', 'Daily attendance will appear when it has been recorded.', 'fa-chart-line');
  const width = 720;
  const height = 190;
  const padX = 18;
  const padY = 18;
  const points = rows.map((row, index) => ({
    x: padX + (rows.length === 1 ? (width - padX * 2) / 2 : index * (width - padX * 2) / (rows.length - 1)),
    y: height - padY - (Math.max(0, Math.min(100, Number(row.pct) || 0)) / 100) * (height - padY * 2),
    row,
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points.at(-1).x} ${height - padY} L ${points[0].x} ${height - padY} Z`;
  const ticks = [25, 50, 75].map((value) => {
    const y = height - padY - (value / 100) * (height - padY * 2);
    return `<line class="trend-grid" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}"></line><text class="trend-tick" x="${padX}" y="${y - 5}">${value}%</text>`;
  }).join('');
  return `<svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Student attendance trend over ${rows.length} recorded days" preserveAspectRatio="none">
    <defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#54e4f2" stop-opacity=".24"></stop><stop offset="1" stop-color="#54e4f2" stop-opacity="0"></stop></linearGradient></defs>
    ${ticks}<path class="trend-area" d="${area}"></path><path class="trend-line" d="${line}"></path>
    ${points.map(({ x, y, row }) => `<circle class="trend-point" cx="${x}" cy="${y}" r="4"><title>${esc(fmtDay(row.day))}: ${esc(fmtPct(row.pct))}</title></circle>`).join('')}
  </svg><div class="trend-labels">${rows.length > 1 ? `<span>${esc(fmtDay(rows[0].day))}</span><span>${esc(fmtDay(rows.at(-1).day))}</span>` : `<span>${esc(fmtDay(rows[0].day))}</span>`}</div>`;
}

function enrollmentGraphic(rows) {
  if (!rows.length) return emptyHtml('No class enrollment', 'Enrollment data will appear once students are enrolled.', 'fa-chart-column');
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  return `<div class="enrollment-list">${rows.map((row) => {
    const value = Number(row.value) || 0;
    const width = Math.round(value / max * 100 / 5) * 5;
    return `<div class="enrollment-row" title="${esc(row.label)}: ${count(value)} students"><div><span>${esc(row.label)}</span><strong>${count(value)}</strong></div><div class="enrollment-track"><span class="data-width-${width}"></span></div></div>`;
  }).join('')}</div>`;
}

function teacherRows(view, rows, search = '') {
  const filtered = rows.filter((row) => String(row.teacher_name).toLowerCase().includes(search.toLowerCase()));
  if (!filtered.length) return `<div class="intel-empty">${search ? 'No teachers match this search.' : 'No records for this period.'}</div>`;
  const performance = view === 'performance';
  return `<div class="table-responsive intel-table-wrap"><table class="table intel-table"><thead><tr><th>Teacher</th><th>${performance ? 'Avg. score' : 'Attendance'}</th><th>${performance ? 'Exams' : 'Present'}</th><th>${performance ? 'Coverage' : 'Late / absent'}</th></tr></thead><tbody>${filtered.map((row) => {
    const pct = Number(performance ? row.percentage : row.pct) || 0;
    const width = Math.round(Math.max(0, Math.min(100, pct)) / 5) * 5;
    return `<tr><td><span class="teacher-avatar">${esc(String(row.teacher_name).split(/\s+/).map((part) => part[0] || '').slice(0, 2).join('').toUpperCase())}</span><span class="teacher-name">${esc(row.teacher_name)}</span></td><td><strong class="${pct >= 85 ? 'tone-good' : pct >= 70 ? 'tone-warn' : 'tone-cool'}">${esc(fmtPct(pct))}</strong><div class="teacher-meter"><span class="data-width-${width}"></span></div></td><td>${performance ? count(row.exams) : count(row.present)}</td><td>${performance ? `<span class="teacher-exams">${count(row.exams)} exam${Number(row.exams) === 1 ? '' : 's'} recorded</span>` : `<span class="teacher-exams">${count(row.late)} late · ${count(row.absent)} absent</span>`}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function flowNode(key, label, value, meta, icon) {
  return `<button type="button" class="flow-node flow-node-${key}" data-flow-node="${key}" aria-pressed="false" title="Inspect ${esc(label)} data">
    <span class="flow-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><span class="flow-copy"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(meta)}</small></span><span class="flow-live" aria-hidden="true"></span>
  </button>`;
}

function renderAdmin(d, user, syncedAt) {
  document.body.classList.add('dashboard-mode');
  dashboardWindow = Number(d.windowDays) || dashboardWindow;
  const today = d.stats.todayAttendance || {};
  const attendanceRows = d.teacherAttendance || [];
  const performanceRows = d.teacherPerformance || [];
  const recentActivities = d.recentActivities || [];
  const upcomingExams = d.upcomingExams || [];
  const charts = d.charts || {};
  const attendanceTrend = charts.attendanceTrend || [];
  const enrollment = charts.enrollment || [];
  const pendingFees = Number(d.stats.pendingFees) || 0;
  const topology = {
    students: `${count(d.stats.students)} active student profiles are present in the school directory.`,
    teachers: `${count(d.stats.teachers)} active teacher profiles are available to academic operations.`,
    attendance: today.studentsMarked ? `${count(today.studentsMarked)} student attendance records were marked today; ${count(attendanceRows.reduce((total, row) => total + Number(row.records || 0), 0))} teacher records fall inside the selected window.` : 'No student attendance has been marked today; teacher attendance still reflects the selected period.',
    academics: `${count(upcomingExams.length)} upcoming exams are scheduled; ${count(performanceRows.length)} teachers have exam-performance records.`,
    finance: `Outstanding fee balance is ${fmtMoney(pendingFees)} for the current academic year.`,
    activity: `${count(recentActivities.length)} recent audit events are available from the activity log.`,
  };
  const activityIcon = (action) => /fee|payment/.test(action) ? 'fa-coins' : /attendance/.test(action) ? 'fa-user-check' : /mark|exam/.test(action) ? 'fa-square-poll-vertical' : /login/.test(action) ? 'fa-arrow-right-to-bracket' : 'fa-bolt';
  const activityMarkup = recentActivities.length
    ? `<ol class="activity-stream">${recentActivities.map((activity) => `<li><span class="activity-icon"><i class="fa-solid ${activityIcon(activity.action)}" aria-hidden="true"></i></span><div><strong>${esc(activity.user_name || 'System user')}</strong><span>${esc(ACTION_TEXT[activity.action] || String(activity.action).replace(/_/g, ' '))}${activity.entity ? ` · ${esc(activity.entity)}` : ''}</span><time datetime="${esc(String(activity.created_at))}">${fmtDateTime(activity.created_at)}</time></div></li>`).join('')}</ol>`
    : emptyHtml('No activity logged', 'Recorded system activity will appear here.', 'fa-clock-rotate-left');
  const examsMarkup = upcomingExams.length
    ? `<div class="exam-stream">${upcomingExams.map((exam) => `<article class="exam-item"><time>${esc(fmtDay(exam.exam_date))}</time><div><strong>${esc(exam.exam)}</strong><span>${esc(exam.class_name)} · ${esc(exam.subject)}</span></div><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></article>`).join('')}</div>`
    : emptyHtml('No scheduled exams', 'Upcoming exam schedules will be shown here.', 'fa-calendar-check');
  const syncLabel = syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  content.innerHTML = `
    <div class="intel-shell">
      <section class="intel-hero">
        <div class="intel-hero-copy"><div class="intel-eyebrow"><span class="live-pulse"></span> SCHOOL ERP <span>/</span> EXECUTIVE INTELLIGENCE</div><h1>School command center</h1><p>${esc(d.academicYear ? `${d.academicYear} academic year` : 'Academic year not configured')} <span class="hero-divider">·</span> Welcome, ${esc(user.name)}</p></div>
        <div class="intel-controls"><label class="window-picker"><span>ATTENDANCE WINDOW</span><select id="dashboard-window" aria-label="Attendance data window"><option value="7"${dashboardWindow === 7 ? ' selected' : ''}>7 days</option><option value="30"${dashboardWindow === 30 ? ' selected' : ''}>30 days</option><option value="90"${dashboardWindow === 90 ? ' selected' : ''}>90 days</option></select></label><button class="intel-icon-button" type="button" id="dashboard-refresh" title="Refresh data" aria-label="Refresh dashboard"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i></button><button class="intel-poll-button" type="button" id="dashboard-poll" aria-pressed="${pollingEnabled}"><span class="live-pulse"></span><span>${pollingEnabled ? 'LIVE UPDATES' : 'PAUSED'}</span></button></div>
      </section>
      ${!d.hasAcademicYear ? `<div class="intel-alert" role="status">No current academic year is set. Academic, exam, and fee metrics will be limited until one is configured.</div>` : ''}
      <section class="intel-kpis" aria-label="School key performance indicators">
        ${animatedMetric('Students', d.stats.students, 'active profiles', 'fa-user-graduate', 'cyan')}
        ${animatedMetric('Teaching staff', d.stats.teachers, 'active educators', 'fa-chalkboard-user', 'violet')}
        ${animatedMetric('Classes', d.stats.classes, 'in current year', 'fa-layer-group', 'blue')}
        <article class="intel-kpi intel-kpi-attendance"><div class="intel-kpi-top"><span>STUDENT ATTENDANCE</span><i class="fa-solid fa-chart-pie" aria-hidden="true"></i></div><div class="attendance-kpi-content">${radialAttendance(today)}<small>${today.studentsMarked ? `${count(today.present)} present · ${count(today.absent)} absent` : 'Awaiting today\'s register'}</small></div></article>
        <article class="intel-kpi intel-kpi-amber"><div class="intel-kpi-top"><span>FEES OUTSTANDING</span><i class="fa-solid fa-wallet" aria-hidden="true"></i></div><strong class="kpi-money">${esc(fmtMoney(pendingFees))}</strong><small>current academic year</small></article>
      </section>

      <section class="intel-panel topology-panel" aria-labelledby="topology-title">
        <div class="intel-panel-head"><div><div class="intel-overline">LIVE DATA FLOW</div><h2 id="topology-title">School systems topology</h2></div><div class="connection-state"><span class="live-pulse"></span><span>API CONNECTED</span><small>polled every 30s</small></div></div>
        <div class="flow-stage">
          <svg class="flow-wires" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wire-flow" x1="0" x2="1"><stop offset="0" stop-color="#8875ff"></stop><stop offset=".52" stop-color="#54e4f2"></stop><stop offset="1" stop-color="#61a9ff"></stop></linearGradient></defs>
            <path class="flow-path" d="M190 54 C300 54 330 150 420 150"></path><path class="flow-path flow-path-slow" d="M190 246 C300 246 330 150 420 150"></path><path class="flow-path" d="M580 150 C670 150 700 54 810 54"></path><path class="flow-path flow-path-slow" d="M580 150 L810 150"></path><path class="flow-path" d="M580 150 C670 150 700 246 810 246"></path>
            <circle class="flow-particle particle-one" r="4"><animateMotion dur="4s" repeatCount="indefinite" path="M190 54 C300 54 330 150 420 150"></animateMotion></circle><circle class="flow-particle particle-two" r="4"><animateMotion dur="5.5s" repeatCount="indefinite" path="M190 246 C300 246 330 150 420 150"></animateMotion></circle><circle class="flow-particle particle-three" r="4"><animateMotion dur="4.7s" repeatCount="indefinite" path="M580 150 C670 150 700 54 810 54"></animateMotion></circle><circle class="flow-particle particle-four" r="4"><animateMotion dur="6s" repeatCount="indefinite" path="M580 150 L810 150"></animateMotion></circle><circle class="flow-particle particle-five" r="4"><animateMotion dur="5s" repeatCount="indefinite" path="M580 150 C670 150 700 246 810 246"></animateMotion></circle>
          </svg>
          ${flowNode('students', 'Students', count(d.stats.students), 'directory records', 'fa-user-graduate')}
          ${flowNode('teachers', 'Teachers', count(d.stats.teachers), 'staff records', 'fa-chalkboard-user')}
          ${flowNode('core', 'ERP core', 'SYNC', d.academicYear || 'Academic year unset', 'fa-cubes-stacked')}
          ${flowNode('attendance', 'Attendance', count(today.studentsMarked), 'marked today', 'fa-user-check')}
          ${flowNode('academics', 'Academics', count(upcomingExams.length), 'upcoming exams', 'fa-book-open')}
          ${flowNode('finance', 'Finance', fmtMoney(pendingFees), 'fees outstanding', 'fa-coins')}
        </div>
        <div class="flow-insight"><div class="flow-insight-mark"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i></div><div><span id="flow-insight-title">SYSTEM OVERVIEW</span><p id="flow-insight-text">Select any system node to inspect its current data snapshot.</p></div><span class="flow-snapshot">${count(recentActivities.length)} AUDIT EVENTS</span></div>
      </section>

      <section class="intel-grid intel-grid-analytics" aria-label="Attendance and enrollment analytics">
        <article class="intel-panel"><div class="intel-panel-head"><div><div class="intel-overline">ATTENDANCE INTELLIGENCE</div><h2>Student attendance trend</h2></div><span class="panel-range">${dashboardWindow} DAY WINDOW</span></div><div class="intel-panel-body"><div class="chart-summary"><strong>${attendanceTrend.length ? esc(fmtPct(attendanceTrend.at(-1).pct)) : '--'}</strong><span>latest recorded day</span></div>${trendGraphic(attendanceTrend)}</div></article>
        <article class="intel-panel"><div class="intel-panel-head"><div><div class="intel-overline">ENROLLMENT DISTRIBUTION</div><h2>Students by class</h2></div><span class="panel-range">${count(d.stats.classes)} CLASSES</span></div><div class="intel-panel-body">${enrollmentGraphic(enrollment)}</div></article>
      </section>

      <section class="intel-grid intel-grid-operations" aria-label="Teacher operations and system health">
        <article class="intel-panel teacher-panel"><div class="intel-panel-head"><div><div class="intel-overline">PEOPLE OPERATIONS</div><h2>Teacher workforce</h2></div><div class="teacher-filters" role="group" aria-label="Teacher data view"><button type="button" class="teacher-tab is-active" data-teacher-view="attendance" aria-pressed="true">Attendance</button><button type="button" class="teacher-tab" data-teacher-view="performance" aria-pressed="false">Performance</button></div></div>
          <div class="teacher-toolbar"><label class="teacher-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="teacher-search" type="search" placeholder="Find a teacher" aria-label="Search teachers"></label><span>${count(d.stats.teachers)} TEACHERS</span></div><div id="teacher-data" class="intel-panel-body flush">${teacherRows('attendance', attendanceRows)}</div>
        </article>
        <article class="intel-panel health-panel"><div class="intel-panel-head"><div><div class="intel-overline">PLATFORM STATUS</div><h2>System health</h2></div><span class="health-badge"><span class="live-pulse"></span> OPERATIONAL</span></div><div class="health-rows"><div><span><i class="fa-solid fa-server"></i> Dashboard API</span><strong id="api-health">CONNECTED</strong></div><div><span><i class="fa-solid fa-database"></i> Data services</span><strong>RESPONDING</strong></div><div><span><i class="fa-solid fa-clock"></i> Last sync</span><strong id="sync-time">${esc(syncLabel)}</strong></div><div><span><i class="fa-solid fa-arrows-rotate"></i> Auto refresh</span><strong id="poll-state">${pollingEnabled ? '30 SECONDS' : 'PAUSED'}</strong></div></div><div class="health-footer"><span class="health-spark" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span>LIVE DATA FEED</span></div></article>
      </section>

      <section class="intel-grid intel-grid-activity" aria-label="Recent system events and upcoming exams">
        <article class="intel-panel"><div class="intel-panel-head"><div><div class="intel-overline">AUDIT STREAM</div><h2>Recent activity</h2></div><span class="panel-range">${count(recentActivities.length)} EVENTS</span></div><div class="intel-panel-body">${activityMarkup}</div></article>
        <article class="intel-panel"><div class="intel-panel-head"><div><div class="intel-overline">ACADEMIC CALENDAR</div><h2>Upcoming exams</h2></div><span class="panel-range">${count(upcomingExams.length)} SCHEDULED</span></div><div class="intel-panel-body">${examsMarkup}</div></article>
      </section>
      ${d.events?.length ? `<section class="intel-panel intel-events"><div class="intel-panel-head"><div><div class="intel-overline">SCHOOL CALENDAR</div><h2>Upcoming events</h2></div></div><div class="intel-panel-body">${d.events.map((event) => `<article class="exam-item"><time>${esc(fmtDay(event.startDate))}</time><div><strong>${esc(event.title)}</strong><span>${esc(event.eventType || 'School event')}</span></div></article>`).join('')}</div></section>` : ''}
    </div>`;

  const insightTitle = document.getElementById('flow-insight-title');
  const insightText = document.getElementById('flow-insight-text');
  content.querySelectorAll('[data-flow-node]').forEach((node) => node.addEventListener('click', () => {
    content.querySelectorAll('[data-flow-node]').forEach((item) => item.setAttribute('aria-pressed', String(item === node)));
    insightTitle.textContent = node.querySelector('.flow-copy span').textContent.toUpperCase();
    insightText.textContent = topology[node.dataset.flowNode] || 'Current system data is available.';
  }));

  let teacherView = 'attendance';
  const search = document.getElementById('teacher-search');
  const teacherData = document.getElementById('teacher-data');
  const updateTeacherTable = () => { teacherData.innerHTML = teacherRows(teacherView, teacherView === 'attendance' ? attendanceRows : performanceRows, search.value); };
  search.addEventListener('input', updateTeacherTable);
  content.querySelectorAll('[data-teacher-view]').forEach((button) => button.addEventListener('click', () => {
    teacherView = button.dataset.teacherView;
    content.querySelectorAll('[data-teacher-view]').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    updateTeacherTable();
  }));

  document.getElementById('dashboard-window').addEventListener('change', (event) => load(user, Number(event.target.value), true));
  document.getElementById('dashboard-refresh').addEventListener('click', () => load(user, dashboardWindow, true));
  document.getElementById('dashboard-poll').addEventListener('click', (event) => {
    pollingEnabled = !pollingEnabled;
    event.currentTarget.setAttribute('aria-pressed', String(pollingEnabled));
    event.currentTarget.innerHTML = `<span class="live-pulse"></span><span>${pollingEnabled ? 'LIVE UPDATES' : 'PAUSED'}</span>`;
    document.getElementById('poll-state').textContent = pollingEnabled ? '30 SECONDS' : 'PAUSED';
  });

  content.querySelectorAll('[data-count-to]').forEach((element) => {
    const target = Number(element.dataset.countTo) || 0;
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start) / 650, 1);
      element.textContent = count(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  });

  clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (pollingEnabled && !document.hidden) load(user, dashboardWindow, true);
  }, 30000);
}

function renderTeacher(d, user) {
  content.innerHTML = `
    ${head(`Welcome, ${user.name}`, d.academicYear ? `Academic year ${d.academicYear}` : '')}
    ${yearBanner(d)}
    <p class="mb-3"><a class="btn btn-primary btn-sm" href="/pages/attendance.html"><i class="fa-solid fa-clipboard-user me-1"></i>Mark attendance</a></p>
    <div class="row g-3 mb-4">
      ${stat('Sections', d.stats.sections)}
      ${stat('Subjects you teach', d.stats.subjectsTaught)}
      ${stat('Students', d.stats.studentsReached)}
      ${stat('Periods today', d.stats.periodsToday)}
    </div>
    <div class="row g-3">
      <div class="col-lg-7">${panel("Today's schedule", d.todaySchedule.length
        ? `<div class="table-responsive"><table class="table"><thead><tr><th>Period</th><th>Time</th><th>Class</th><th>Subject</th><th>Room</th></tr></thead><tbody>${d.todaySchedule.map((r) => `<tr><td>${r.period_no}</td><td>${fmtTime(r.start_time)} - ${fmtTime(r.end_time)}</td><td>${esc(r.class_name)} ${esc(r.section_name)}</td><td>${esc(r.subject)}</td><td>${esc(r.room || '-')}</td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No periods today', 'Your timetable slots for today will appear here.', 'fa-calendar-day'), { flush: d.todaySchedule.length > 0 })}
      </div>
      <div class="col-lg-5"><div class="mb-3">${noticesPanel(d.notices)}</div>${eventsPanel(d.events)}</div>
      <div class="col-12">${panel('Your classes', d.assigned.length
        ? `<div class="table-responsive"><table class="table"><thead><tr><th>Class</th><th>Section</th><th>Subject</th><th class="text-end">Students</th></tr></thead><tbody>${d.assigned.map((a) => `<tr><td>${esc(a.class_name)}</td><td>${esc(a.section_name)}</td><td>${esc(a.subject)}</td><td class="text-end">${a.students}</td></tr>`).join('')}</tbody></table></div>`
        : emptyHtml('No classes assigned', 'The school office assigns subjects to you. They will list here.', 'fa-chalkboard-user'), { flush: d.assigned.length > 0 })}
      </div>
    </div>`;
}

function studentBlock(s) {
  const placement = s.className ? `${s.className} ${s.sectionName}${s.rollNo ? `, roll ${s.rollNo}` : ''}` : 'Not enrolled in the current year';
  return `
    <div class="row g-3 mb-4">
      ${stat('Class', s.className ? `${s.className} ${s.sectionName}` : '-', s.rollNo ? `Roll no. ${s.rollNo}` : placement)}
      <div class="col-6 col-lg"><div class="stat"><div class="stat-label">Attendance</div><div class="stat-value">${fmtPct(s.attendancePercent)}</div><div class="mt-2">${meter(s.attendancePercent)}</div></div></div>
      ${stat('Fee due', fmtMoney(s.fees.remaining), `${fmtMoney(s.fees.paid)} paid of ${fmtMoney(s.fees.total)}`)}
    </div>
    ${panel('Upcoming exams', examsTable(s.upcomingExams, false), { flush: s.upcomingExams.length > 0 })}
    ${s.performance && s.performance.length ? `<div class="mt-3">${panel('Score in each exam', `<div class="chart-box"><canvas id="chart-perf-${s.id}"></canvas></div>`)}</div>` : ''}`;
}

function drawPerformance(s) {
  const el = document.getElementById(`chart-perf-${s.id}`);
  if (!el || !s.performance || !s.performance.length) return;
  new Chart(el, {
    type: 'line',
    data: { labels: s.performance.map((p) => p.name), datasets: [{ label: 'Score %', data: s.performance.map((p) => p.percentage), borderColor: '#b9780f', backgroundColor: '#b9780f', tension: 0.25 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
  });
}

function renderStudent(d) {
  content.innerHTML = `
    ${head(`Welcome, ${d.student.name}`, `Admission no. ${d.student.admissionNo}${d.academicYear ? ` - ${d.academicYear}` : ''}`)}
    <p class="mb-3"><a href="/pages/student.html?id=${d.student.id}">View my profile</a></p>
    ${yearBanner(d)}
    <div class="row g-3"><div class="col-lg-8">${studentBlock(d.student)}</div><div class="col-lg-4"><div class="mb-3">${noticesPanel(d.notices)}</div>${eventsPanel(d.events)}</div></div>`;
  drawPerformance(d.student);
}

function renderParent(d) {
  content.innerHTML = `
    ${head('Your children', d.academicYear ? `Academic year ${d.academicYear}` : '')}
    ${yearBanner(d)}
    <div class="row g-3">
      <div class="col-lg-8">
        ${d.children.length
          ? d.children.map((c) => `<div class="mb-4"><h2 class="h5 mb-3"><a class="text-decoration-none" href="/pages/student.html?id=${c.id}">${esc(c.name)}</a> <span class="muted fs-6">(${esc(c.relation)})</span></h2>${studentBlock(c)}</div>`).join('')
          : panel('Children', emptyHtml('No children linked yet', 'The school office links your account to your child. Contact them if this looks wrong.', 'fa-children'))}
      </div>
      <div class="col-lg-4"><div class="mb-3">${noticesPanel(d.notices)}</div>${eventsPanel(d.events)}</div>
    </div>`;
  d.children.forEach(drawPerformance);
}

async function load(user, windowDays = dashboardWindow, silent = false) {
  const requestId = ++requestSequence;
  if (!silent) showLoading(content, 'Loading your dashboard...');
  try {
    const url = user.role === 'admin' ? `/api/reports/dashboard?window=${windowDays}` : '/api/reports/dashboard';
    const d = await api.get(url);
    if (requestId !== requestSequence) return;
    ({ admin: renderAdmin, teacher: renderTeacher, student: renderStudent, parent: renderParent })[d.role](d, user, new Date());
  } catch (err) {
    if (requestId !== requestSequence) return;
    if (silent) {
      const health = document.getElementById('api-health');
      if (health) { health.textContent = 'UNAVAILABLE'; health.classList.add('tone-warn'); }
      const picker = document.getElementById('dashboard-window');
      if (picker) picker.value = String(dashboardWindow);
    } else showError(content, err.message, () => load(user));
  }
}

initLayout('dashboard', 'Dashboard').then(load).catch((err) => showError(content, err.message));
