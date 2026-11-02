// Sidebar items per role. Only pages that exist are listed; each phase adds its entries here.
const item = (key, label, icon, href) => ({ key, label, icon, href });

const dashboard = item('dashboard', 'Dashboard', 'fa-gauge', '/pages/dashboard.html');

export const NAV = {
  admin: [
    dashboard,
    item('academics', 'Academics', 'fa-school', '/pages/academics.html'),
    item('students', 'Students', 'fa-user-graduate', '/pages/students.html'),
    item('teachers', 'Teachers', 'fa-chalkboard-user', '/pages/teachers.html'),
    item('parents', 'Parents', 'fa-people-roof', '/pages/parents.html'),
    item('timetable', 'Timetable', 'fa-calendar-week', '/pages/timetable.html'),
    item('attendance', 'Attendance', 'fa-clipboard-user', '/pages/attendance.html'),
    item('assignments', 'Assignments', 'fa-book-open', '/pages/assignments.html'),
    item('exams', 'Exams', 'fa-file-pen', '/pages/exams.html'),
    item('marks', 'Marks and results', 'fa-square-poll-vertical', '/pages/marks.html'),
    item('fees', 'Fees', 'fa-indian-rupee-sign', '/pages/fees.html'),
    item('notices', 'Notices', 'fa-bullhorn', '/pages/notices.html'),
    item('events', 'Events', 'fa-calendar-days', '/pages/events.html'),
    item('reports', 'Reports', 'fa-chart-column', '/pages/reports.html'),
    item('settings', 'Settings', 'fa-gear', '/pages/settings.html'),
  ],
  teacher: [
    dashboard,
    item('students', 'My students', 'fa-user-graduate', '/pages/students.html'),
    item('attendance', 'Attendance', 'fa-clipboard-user', '/pages/attendance.html'),
    item('timetable', 'Timetable', 'fa-calendar-week', '/pages/timetable.html'),
    item('assignments', 'Assignments', 'fa-book-open', '/pages/assignments.html'),
    item('exams', 'Exams', 'fa-file-pen', '/pages/exams.html'),
    item('marks', 'Marks and results', 'fa-square-poll-vertical', '/pages/marks.html'),
    item('notices', 'Notices', 'fa-bullhorn', '/pages/notices.html'),
    item('events', 'Events', 'fa-calendar-days', '/pages/events.html'),
  ],
  student: [
    dashboard,
    item('profile', 'My profile', 'fa-id-card', '/pages/student.html'),
    item('timetable', 'Timetable', 'fa-calendar-week', '/pages/timetable.html'),
    item('assignments', 'Assignments', 'fa-book-open', '/pages/assignments.html'),
    item('results', 'Exams and results', 'fa-square-poll-vertical', '/pages/results.html'),
    item('fees', 'Fees', 'fa-indian-rupee-sign', '/pages/fees.html'),
    item('notices', 'Notices', 'fa-bullhorn', '/pages/notices.html'),
    item('events', 'Events', 'fa-calendar-days', '/pages/events.html'),
  ],
  parent: [
    dashboard,
    item('timetable', 'Timetable', 'fa-calendar-week', '/pages/timetable.html'),
    item('assignments', 'Assignments', 'fa-book-open', '/pages/assignments.html'),
    item('results', 'Exams and results', 'fa-square-poll-vertical', '/pages/results.html'),
    item('fees', 'Fees', 'fa-indian-rupee-sign', '/pages/fees.html'),
    item('notices', 'Notices', 'fa-bullhorn', '/pages/notices.html'),
    item('events', 'Events', 'fa-calendar-days', '/pages/events.html'),
  ],
};

export const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent' };
