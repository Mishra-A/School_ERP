# Deploying and running School ERP

This guide covers running the app for real users: starting it reliably, HTTPS, email, backups, updates and security.

## 1. What you need

- A computer or server that stays on during school hours (Windows or Linux), with **Node.js 18+** and **MySQL 8** (or MariaDB 10.5+).
- A domain or a fixed address on the school network, for example `https://erp.yourschool.in` or `http://192.168.1.10:3000`.

For a school-office computer on the local network, you can skip HTTPS and use the school's Wi-Fi/LAN. For access from the internet, use HTTPS (section 4).

## 2. First-time setup

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env: SESSION_SECRET, DB_*, ADMIN_*, SCHOOL_NAME, APP_URL
npm run db:migrate
npm run db:seed
```

Set `NODE_ENV=production` in `.env` for real use. This makes login cookies `secure` (HTTPS only), so only do it once HTTPS works.
Without HTTPS (LAN only), keep `NODE_ENV=development`.

For Render, set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to the hosted MySQL provider's connection details. Never leave `DB_HOST=localhost` in a hosted service; production startup rejects local database hosts. Set `DB_SSL=true` when the provider requires TLS. Render is detected from its platform environment and trusts one proxy hop for secure cookies and client IP rate limiting. Configure the Render health check path as `/readyz`; `/healthz` checks only that the process is alive, while `/readyz` also verifies the database connection.

## 3. Keeping it running

Running `npm start` in a window stops when the window closes or the computer restarts. Use a process manager instead.

**pm2 (Windows or Linux):**
```bash
npm install -g pm2
pm2 start backend/server.js --name school-erp
pm2 save
pm2 startup        # follow the one command it prints, so the app starts after a reboot
pm2 logs school-erp
```
On Windows, `pm2 startup` does not work directly. Install `pm2-windows-startup` (`npm i -g pm2-windows-startup`, then `pm2-startup install`),
or use Task Scheduler to run `pm2 resurrect` at logon.

Make sure MySQL itself also starts with the computer (XAMPP: tick "Service" next to MySQL in the control panel).

## 4. HTTPS (needed for internet access)

Put a reverse proxy in front of the app. The simplest is **Caddy**, which gets a free certificate automatically.
`Caddyfile`:
```
erp.yourschool.in {
    reverse_proxy localhost:3000
}
```
Point the domain's DNS to the server and open ports 80 and 443. Then set in `.env`:
```
NODE_ENV=production
APP_URL=https://erp.yourschool.in
```
Restart the app. (Nginx works too: proxy to `http://127.0.0.1:3000` and pass `X-Forwarded-Proto`.)

## 5. Email (optional)

Add to `.env`, then restart:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourschool@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Your School <yourschool@gmail.com>
APP_URL=https://erp.yourschool.in
```
- Gmail needs an **App password** (Google Account > Security > 2-Step Verification > App passwords); your normal password will not work.
- Any SMTP provider works (Zoho, Outlook, a hosting provider's mail server, Amazon SES...).
- Log in as admin, open **Settings**, and press **Send a test email to me**.
- Emails are sent for notices, new assignments and fee payments. Marks, remarks and absence alerts are in-app only.
  Each person can switch their own emails off from the account menu.
- Real email addresses matter: students created without a real email will not receive anything by email (they still see in-app notifications).

## 6. Backups (do this!)

Your data is in two places: the **MySQL database** and the **uploads folder** (`backend/uploads`, or `UPLOAD_DIR`).

```bash
npm run backup
```
creates `backups/backup-<date-time>/database.sql` plus a copy of the uploads. If it cannot find `mysqldump`, set `MYSQLDUMP_PATH` in `.env`
(XAMPP: `C:\xampp\mysql\bin\mysqldump.exe`).

- Run it daily. Windows: Task Scheduler > Create Basic Task > Daily > "Start a program" > `cmd` with arguments
  `/c cd /d C:\path\to\school-erp && npm run backup`. Linux: a cron line such as `0 2 * * * cd /path/to/school-erp && npm run backup`.
- **Copy the backups elsewhere** (another drive, Google Drive, a USB disk kept off-site). A backup on the same disk does not survive a disk failure.
- Delete old backup folders now and then, or the disk fills up.

**Restoring** (into an empty database):
```bash
mysql -u root -p -e "CREATE DATABASE school_erp CHARACTER SET utf8mb4"
mysql -u root -p school_erp < backups/backup-.../database.sql
```
then copy the backup's `uploads` folder contents back into `backend/uploads`, and run `npm run db:migrate` (safe, brings the schema up to date).
Practise a restore once on a spare computer so you know it works before you need it.

## 7. Updating to a new version

1. `npm start` window / `pm2 stop school-erp`.
2. **Run `npm run backup` first.**
3. Copy the new files over the old folder (keep your `.env` and `backend/uploads`).
4. `npm install`
5. `npm run db:migrate`   (applies any database changes; safe to repeat)
6. `npm start` / `pm2 restart school-erp`, then press Ctrl+F5 in the browser.

## 8. Checking that it works

`npm test` runs the automated checks (about 600) against a temporary database called `<DB_NAME>_test`. It never touches your real data,
sends no email, and uses a temporary uploads folder. Run it after updating. All suites should pass.

## 9. Security checklist

- [ ] `SESSION_SECRET` is long and random, and `.env` is not shared or uploaded anywhere (it is in `.gitignore`).
- [ ] The admin password is strong. Change it after the first login (account menu > Change password).
- [ ] New teachers, students and parents are made to choose their own password at first login. Hand over the temporary password privately.
- [ ] HTTPS is on if the app is reachable from the internet, with `NODE_ENV=production`.
- [ ] MySQL is not exposed to the internet (firewall port 3306), and the app uses a dedicated MySQL user rather than `root` where possible:
      `CREATE USER 'erp'@'localhost' IDENTIFIED BY '...'; GRANT ALL ON school_erp.* TO 'erp'@'localhost';`
- [ ] Backups run daily and a copy lives off the computer.
- [ ] `npm audit` shows no problems (run it after updates).
- [ ] Deactivate (do not delete) users who leave. This ends their session immediately.

Built-in protections: passwords are hashed (bcrypt), logins are rate limited per address and locked for 10 minutes after 5 wrong passwords
per account, sessions are stored in the database with secure cookies, state-changing requests need a custom header (CSRF), every request is
checked against the user's role and ownership (a student can never open another student's data by changing an id), uploads are limited by
type, size and file signature and are only served after a permission check.

## 10. Troubleshooting

| Problem | What to check |
|---|---|
| "Couldn't load this" on a page | Run `npm run db:migrate`, restart, Ctrl+F5. The error line under the message names the cause. |
| `ECONNREFUSED` on start or migrate | MySQL is not running. Start it (XAMPP Control Panel). |
| `Access denied for user` | `DB_USER` / `DB_PASSWORD` in `.env` are wrong. |
| Cannot log in after setting `NODE_ENV=production` | HTTPS is not set up; cookies with `secure` are not sent over plain HTTP. |
| Login works, then pages ask to log in again | The server restarted or `SESSION_SECRET` changed. |
| No emails | Settings > "Send a test email". Check the SMTP details, app password and that `SMTP_FROM` is set. |
| Hindi text is missing in PDFs | Run `npm install` again (the font packages must be present). |
