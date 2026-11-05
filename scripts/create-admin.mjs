// Creates the first School Administrator. Usage:
//   ADMIN_EMAIL=head@school.edu.gh ADMIN_NAME="Head Teacher" ADMIN_PASSWORD='Choose-A-Strong-1' npm run db:setup-admin
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Set DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.'); process.exit(1);
}
if (ADMIN_PASSWORD.length < 8 || !/[A-Za-z]/.test(ADMIN_PASSWORD) || !/\d/.test(ADMIN_PASSWORD)) {
  console.error('ADMIN_PASSWORD needs at least 8 characters with letters and numbers.'); process.exit(1);
}
const c = new pg.Client({ connectionString: DATABASE_URL });
await c.connect();
const exists = await c.query("select 1 from users where role='school_admin' limit 1");
if (exists.rowCount) { console.log('A School Administrator already exists. Create further accounts from inside the app.'); await c.end(); process.exit(0); }
await c.query(
  `insert into users (email, full_name, password_hash, role, must_change_password) values ($1,$2,$3,'school_admin', true)`,
  [ADMIN_EMAIL.trim(), ADMIN_NAME.trim(), await bcrypt.hash(ADMIN_PASSWORD, 12)],
);
await c.end();
console.log(`School Administrator created: ${ADMIN_EMAIL}. The password must be changed at first login.`);
