const { getPool, sql } = require('../../config/db');

async function list({ q, rol, estado, page, pageSize }) {
    const pool = await getPool();
    const offset = (page - 1) * pageSize;

    q = (q || '').trim();
    rol = (rol || '').toUpperCase();
    const estadoN = (estado === '0' || estado === '1') ? Number(estado) : null;

    let where = 'WHERE 1=1';
    const req = pool.request();

    if (q) {
        where += ' AND (username LIKE \'%\' + @q + \'%\' OR nombre LIKE \'%\' + @q + \'%\' OR correo LIKE \'%\' + @q + \'%\')';
        req.input('q', sql.NVarChar, q);
    }
    if (rol) {
        where += ' AND rol = @rol';
        req.input('rol', sql.VarChar, rol);
    }
    if (estadoN !== null) {
        where += ' AND estado = @estado';
        req.input('estado', sql.Bit, estadoN);
    }

    const base = `FROM dbo.Users ${where}`;

    const totalR = await req.query(`SELECT COUNT(1) AS total ${base}`);
    const total = totalR.recordset[0]?.total || 0;

    req.input('offset', sql.Int, offset);
    req.input('pageSize', sql.Int, pageSize);

    const rowsR = await req.query(`
    SELECT id_user, username, nombre, correo, rol, estado, created_at_utc
    ${base}
    ORDER BY created_at_utc DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

    return { rows: rowsR.recordset, total };
}

async function getById(id) {
    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, id)
        .query(`SELECT TOP 1 id_user, username, nombre, correo, rol, estado FROM dbo.Users WHERE id_user=@id`);
    return r.recordset[0] || null;
}

async function getByUsername(username) {
    const pool = await getPool();
    const r = await pool.request()
        .input('u', sql.NVarChar, username)
        .query(`SELECT TOP 1 id_user FROM dbo.Users WHERE username=@u`);
    return r.recordset[0] || null;
}

async function create({ username, nombre, correo, rol, estado, pass_hash }) {
    const pool = await getPool();
    await pool.request()
        .input('username', sql.NVarChar, username)
        .input('nombre', sql.NVarChar, nombre)
        .input('correo', sql.NVarChar, correo)
        .input('rol', sql.VarChar, rol)
        .input('estado', sql.Bit, estado)
        .input('pass_hash', sql.NVarChar, pass_hash)
        .query(`
      INSERT INTO dbo.Users (username, nombre, correo, rol, estado, pass_hash)
      VALUES (@username, @nombre, @correo, @rol, @estado, @pass_hash)
    `);
}

async function update(id, { nombre, correo, rol, estado }) {
    const pool = await getPool();
    await pool.request()
        .input('id', sql.Int, id)
        .input('nombre', sql.NVarChar, nombre)
        .input('correo', sql.NVarChar, correo)
        .input('rol', sql.VarChar, rol)
        .input('estado', sql.Bit, estado)
        .query(`
      UPDATE dbo.Users
      SET nombre=@nombre, correo=@correo, rol=@rol, estado=@estado
      WHERE id_user=@id
    `);
}

async function toggleEstado(id) {
    const pool = await getPool();
    await pool.request()
        .input('id', sql.Int, id)
        .query(`
      UPDATE dbo.Users
      SET estado = CASE WHEN estado=1 THEN 0 ELSE 1 END
      WHERE id_user=@id
    `);
}

async function updatePassword(id, pass_hash) {
    const pool = await getPool();
    await pool.request()
        .input('id', sql.Int, id)
        .input('pass_hash', sql.NVarChar, pass_hash)
        .query(`
      UPDATE dbo.Users
      SET pass_hash=@pass_hash
      WHERE id_user=@id
    `);
}

module.exports = { list, getById, getByUsername, create, update, toggleEstado, updatePassword };
