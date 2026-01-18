require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../src/config/db');

(async () => {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const nombre = process.env.ADMIN_NOMBRE || 'Administrador';
    const correo = process.env.ADMIN_CORREO || null;

    if (!username || !password) {
        console.log('Falta ADMIN_USERNAME o ADMIN_PASSWORD en .env');
        process.exit(1);
    }

    const pool = await getPool();

    const exists = await pool.request()
        .input('username', sql.NVarChar, username)
        .query('SELECT id_user FROM dbo.Users WHERE username=@username');

    if (exists.recordset.length) {
        console.log('Admin ya existe:', username);
        process.exit(0);
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.request()
        .input('username', sql.NVarChar, username)
        .input('nombre', sql.NVarChar, nombre)
        .input('correo', sql.NVarChar, correo)
        .input('pass_hash', sql.NVarChar, hash)
        .input('rol', sql.VarChar, 'ADMIN')
        .query(`
      INSERT INTO dbo.Users (username, nombre, correo, pass_hash, rol, estado)
      VALUES (@username, @nombre, @correo, @pass_hash, @rol, 1)
    `);

    console.log('Admin creado OK:', username);
    process.exit(0);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
