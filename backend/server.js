require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const cors = require('cors');

const { dbConfig } = require('./config/db');
const { apiLimiter, requireXhrHeader } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET is missing or too short (min 32 chars). See .env.example.');
  process.exit(1);
}

const app = express();
if (isProd) app.set('trust proxy', 1); // needed for secure cookies behind a reverse proxy

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

if (process.env.CORS_ORIGIN) {
  const origins = process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
}

app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    name: 'school_erp.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MySQLStore({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

// API
app.use('/api', apiLimiter, requireXhrHeader);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/academic-years', require('./routes/academicYears.routes'));
app.use('/api/classes', require('./routes/classes.routes'));
app.use('/api/sections', require('./routes/sections.routes'));
app.use('/api/subjects', require('./routes/subjects.routes'));
app.use('/api/class-subjects', require('./routes/classSubjects.routes'));
app.use('/api/teachers', require('./routes/teachers.routes'));
app.use('/api/students', require('./routes/students.routes'));
app.use('/api/parents', require('./routes/parents.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/timetable', require('./routes/timetable.routes'));
app.use('/api/assignments', require('./routes/assignments.routes'));
app.use('/api/materials', require('./routes/materials.routes'));
app.use('/api/exams', require('./routes/exams.routes'));
app.use('/api/marks', require('./routes/marks.routes'));
app.use('/api/results', require('./routes/results.routes'));
app.use('/api/remarks', require('./routes/remarks.routes'));
app.use('/api/grades', require('./routes/grades.routes'));
app.use('/api/fees', require('./routes/fees.routes'));
app.use('/api/notices', require('./routes/notices.routes'));
app.use('/api/events', require('./routes/events.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/system', require('./routes/system.routes'));

// Frontend (static)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/', (req, res) => res.redirect('/pages/login.html'));

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`School ERP running on http://localhost:${port}`);
  require('./jobs').start();
});
