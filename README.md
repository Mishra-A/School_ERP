# School ERP

Role-based school management web app (Admin, Teacher, Student, Parent).
Stack: Node.js + Express, MySQL, vanilla JS, Bootstrap 5, Chart.js.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Auth, full database schema, roles, role-based dashboards | **Done** |
| 2 | Students, teachers, parents, classes, subjects, academic years | **Done** |
| 3 | Attendance, timetable, assignments, study material | **Done** |
| 4 | Exams, marks, grades, PDF report cards, teacher remarks | **Done** |
| 5 | Fees, notices, events, reports | **Done** |
| 6 | Analytics, notifications, email, testing, hardening | **Done** |

## Setup

Requires Node 18+ and MySQL 8 (MariaDB 10.5+ also works).

```bash
npm install
cp .env.example .env          # then fill in SESSION_SECRET, DB_*, ADMIN_*
npm run db:migrate            # creates the database, tables and updates (safe to re-run; run it after every update)
npm run db:seed               # roles, default grade scale, first admin (safe to re-run)
npm start                     # http://localhost:3000
```

Generate a session secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

The seed creates an idempotent demo roster for the current academic year (students, teachers, classes, sections and recent attendance) so the dashboards are populated. Test runs skip demo school data so API fixtures remain isolated. Demo accounts use sample credentials; change passwords before exposing the app publicly.

## First-time setup in the app (Phase 2)

Log in as the admin and work through **Academics** left to right:

1. **Academic years**: add the current year (tick "Make this the current year").
2. **Subjects**: add the school's subjects.
3. **Teachers** page: add teachers. Each gets a one-time temporary password, shown once, to hand over.
4. **Classes and sections**: add classes (e.g. Class 5), then sections (A, B) and optionally a class teacher.
5. **Teaching assignments**: choose a section and assign each subject to a teacher.
6. **Students** page: add students and place them in a section. Open a student's profile to link parents.
7. **Parents** page: add parents *before* linking them from the student's profile.

### Phase 3 features

- **Attendance** (teacher/admin): pick class + subject + date, mark Present/Absent/Late/Leave, save. Re-saving updates the day.
  Teachers can mark or correct only the last 7 days and only for subjects they teach; admins have no limit. Future dates are blocked.
  Reports by section and date range (optionally one subject), with CSV download. Students and parents see percentages on the student profile.
- **Timetable**: admin builds each section's week from its subject assignments. A teacher can't be booked in two places at the same
  time (overlapping times or the same period number), nor a section twice. Teachers, students and parents get read-only views.
  Changing a subject's teacher moves its timetable slots too, unless the new teacher is busy then.
- **Assignments**: teachers create them (optional attachment, due date), see who submitted, download work and write feedback.
  Students submit a file (can replace it until reviewed; late submissions are flagged). Parents see their child's list read-only.
- **Study material**: teachers upload files per class and subject; students and parents download them.

### Phase 4 features

- **Exams** (admin): create an exam for a class, add each subject with date, time, maximum and pass marks. An exam or subject that
  already has marks can't be deleted, and maximum marks can't be lowered below marks already entered.
- **Marks entry** (teacher/admin): teachers enter marks only for subjects they teach, only once the exam date has passed, and can mark a
  student absent. Clearing a box removes that student's mark.
- **Results**: total, percentage, grade and pass/fail are calculated by the app. Grades come from the editable grade scale (Exams > Grade scale).
  Rules: absent counts as 0 marks and a fail in that subject (its maximum still counts in the total); overall result is *Pass* only if
  every subject is passed; while any subject has no marks the result is *Pending* and gets no overall grade.
- **Report cards**: PDF per student and exam, with Hindi and English text, the school name from `SCHOOL_NAME` in `.env`, and the latest remarks.
  Students and parents download their own; teachers and admin download for students they can see.
- **Teacher remarks**: written by teachers about their own students; visible to the student and parents, deletable by the author or admin.
- Admin edits made through Phase 4 need `npm run db:migrate` once (adds the "absent" flag to marks).

### Phase 5 features

- **Fees** (admin): set fees per class (each applies to every student enrolled in it that year), record payments, see who owes, and
  download PDF receipts. Students and parents see total, paid, remaining, due dates, payment history and receipts. Teachers have no
  access to fees. There are no discounts or part-year fees yet; every enrolled student owes the full class fee.
  - A payment can't exceed the balance of that fee. Concurrent payments for the same student are serialised, so a balance can't be overpaid.
  - Payments are never deleted. A wrong one is **voided** (reason required): it stays on the record, is marked VOID on its receipt,
    and no longer counts towards paid totals or the dashboard.
  - Receipt numbers look like `R2026000123` (year + payment id).
- **Notices**: admin posts to everyone, a role, or a class; teachers post only to students/parents of classes they teach. Optional
  attachment and a future publish date (hidden until then). Each person sees only notices meant for their role and class.
- **Events**: admin maintains the school calendar (exams, sports day, annual function, PTM, holidays, other); everyone can view it,
  and the next events show on every dashboard.
- **Reports** (admin): fees by class, method and month; attendance by section (with students under 75%); enrollment by class and gender;
  exam results by section and subject. Each table downloads as CSV.
- Run `npm run db:migrate` after updating (adds the void columns to payments).

### Phase 6 features

- **Dashboard charts** (Chart.js): admin sees attendance, enrollment, fees collected per month and average score per exam; students and
  parents see each child's score trend across exams.
- **In-app notifications**: a bell in the top bar (unread count, latest items, mark all read) and a Notifications page. People are told about:
  new notices (including scheduled ones on their publish date), new assignments, reviewed work, new marks, fee payments and voids, teacher
  remarks, and (parents only) when a child is marked absent. Everyone sees only their own; inactive users are skipped.
- **Email** (optional, Nodemailer): set `SMTP_*` in `.env`. Emails go out for notices, new assignments and fee payments, to people who have
  not switched emails off (account menu). Admin > Settings can send a test email. Without SMTP everything still works in-app.
- **Security**: temporary passwords (new users, admin resets) must be replaced at first login before anything else works; passwords need
  8+ characters with a letter and a number; 5 wrong passwords lock an account for 10 minutes (plus the per-address limit); a pinned
  vulnerable dependency was replaced (`npm audit`: 0 problems).
- **Backups**: `npm run backup` saves the database and uploads into `backups/`. **Deployment guide**: `docs/DEPLOYMENT.md` (running
  as a service, HTTPS, email, backup schedule, updating, security checklist, troubleshooting).
- **Automated tests**: `npm test` runs about 600 checks against a throwaway `<DB_NAME>_test` database and server. It never touches real data,
  sends no email and uses a temporary uploads folder. Run it after every update.

### Known limits (not built yet)

- Moving students up to the next class when a new academic year starts (promotion). Today each year's classes and enrollments are set up by hand.
- "Forgot password": only the admin can reset a password (it then forces a change).
- Fee discounts, concessions and part-year fees.
- The app is English only (names in Hindi work everywhere, including PDFs).

### File uploads

Allowed: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, png, jpg, jpeg, up to 10 MB. Files are saved under random names in
`backend/uploads/` (not publicly served), checked against their real file signature, and only downloadable through the app after a
permission check. Optional env var `UPLOAD_DIR` moves the folder. Back this folder up together with the database.

People are never hard-deleted (their history must survive). Use Deactivate instead; it blocks login immediately.

## Structure

```
backend/   config/ controllers/ routes/ services/ middleware/ validators/ utils/ uploads/ jobs.js server.js
frontend/  pages/ css/ js/ assets/        (served statically by Express)
database/  schema.sql  migrations/  migrate.js  seeds/seed.js
scripts/   backup.js
tests/     run.js  api/*.test.js
docs/      DEPLOYMENT.md
```

Request flow: route -> middleware (auth, role) -> controller -> validator -> service -> MySQL.

## Security notes

- Passwords hashed with bcrypt (12 rounds); login is rate limited and timing-safe for unknown emails.
- Sessions stored in MySQL, new session id on login, httpOnly + SameSite=Lax cookie (`secure` in production).
- `requireAuth` re-checks `is_active` on every request, so deactivating a user ends their session immediately.
- State-changing API calls must send `X-Requested-With: fetch` (CSRF defence); `frontend/js/api.js` does this.
- Helmet with a CSP that only allows this origin plus jsDelivr, cdnjs and Google Fonts.
- Dashboards derive the student/teacher/parent identity from the session, never from a client-supplied id.
  Later phases must keep that rule: use ownership checks on every `/:id` route.
- Every route that takes a student id goes through `access.service.js` (`canViewStudent`): admin = any, student = self,
  parent = linked children, teacher = students in sections they teach or are class teacher of. Unknown ids look the same as forbidden ones.
- Uploaded files are never served statically; every download goes through a permission check. A submission's file is visible only to
  the assignment's teacher, admin, the student, and the student's parents.
- Temporary passwords are random 10-character strings, hashed before storage, and returned once in the API response only.
- Production: set `NODE_ENV=production` and serve over HTTPS behind a proxy.

## Definitions

- **Attendance %** = (present + late) / (present + late + absent) x 100. Approved leave is excluded.
- **Pending fees** = fees due for enrolled students in the current academic year minus payments recorded against them.
- "Current academic year" is the row in `academic_years` with `is_current = 1`.
