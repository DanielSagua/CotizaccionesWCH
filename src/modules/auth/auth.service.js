const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../../config/db');

async function validateUser(username, password) {
    if (!username || !password) return null;

    const pool = await getPool();
    const r = await pool.request()
        .input('username', sql.NVarChar, username.trim())
        .query(`
      SELECT TOP 1 id_user, username, nombre, rol, estado, pass_hash
      FROM dbo.Users
      WHERE username = @username
    `);

    const user = r.recordset[0];
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.pass_hash);
    if (!ok) return null;

    return user;
}

module.exports = { validateUser };
