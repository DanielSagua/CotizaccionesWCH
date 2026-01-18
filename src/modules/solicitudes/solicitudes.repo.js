const { getPool, sql } = require('../../config/db');

async function listEstados() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT id_estado, nombre
    FROM dbo.EstadosSolicitud
    WHERE activo = 1
    ORDER BY id_estado ASC
  `);
  return r.recordset;
}

async function listAnalistas() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT id_user, nombre, username
    FROM dbo.Users
    WHERE estado = 1 AND rol = 'ANALISTA'
    ORDER BY nombre ASC
  `);
  return r.recordset;
}

function diffFields(before, after, keys) {
  const changes = {};
  for (const k of keys) {
    const b = before?.[k] ?? null;
    const a = after?.[k] ?? null;
    const bVal = (b instanceof Date) ? b.toISOString() : b;
    const aVal = (a instanceof Date) ? a.toISOString() : a;
    if (bVal !== aVal) changes[k] = { before: bVal, after: aVal };
  }
  return changes;
}

async function getDefaultEstadoId(trx) {
  const r = await trx.request().query(`
    SELECT TOP 1 id_estado
    FROM dbo.EstadosSolicitud
    WHERE es_default = 1 AND activo = 1
    ORDER BY id_estado ASC
  `);
  if (!r.recordset[0]) throw new Error('No existe estado default en EstadosSolicitud');
  return r.recordset[0].id_estado;
}

async function getSolicitudForUpdate(trx, id_solicitud) {
  const r = await trx.request()
    .input('id', sql.Int, id_solicitud)
    .query(`
      SELECT TOP 1
        s.id_solicitud, s.cliente, s.asunto, s.detalle, s.deadline_utc, s.id_estado,
        s.owner_user_id, s.assigned_user_id,
        e.nombre AS estado
      FROM dbo.Solicitudes s WITH (UPDLOCK, ROWLOCK)
      INNER JOIN dbo.EstadosSolicitud e ON e.id_estado = s.id_estado
      WHERE s.id_solicitud = @id
    `);

  return r.recordset[0] || null;
}

async function list(scope, filtros) {
  const pool = await getPool();

  const page = Math.max(1, Number(filtros.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(filtros.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const cliente = (filtros.cliente || '').trim();
  const asunto = (filtros.asunto || '').trim();
  const id_estado = filtros.id_estado ? Number(filtros.id_estado) : null;
  const assigned_user_id = filtros.assigned_user_id ? Number(filtros.assigned_user_id) : null;
  const onlyAssigned = Boolean(filtros.onlyAssigned);

  let where = `WHERE 1=1 `;
  if (cliente) where += ` AND s.cliente LIKE '%' + @cliente + '%'`;
  if (asunto) where += ` AND s.asunto  LIKE '%' + @asunto  + '%'`;
  if (id_estado) where += ` AND s.id_estado = @id_estado`;
  if (assigned_user_id) where += ` AND s.assigned_user_id = @assigned_user_id`;
  if (onlyAssigned) where += ` AND s.assigned_user_id IS NOT NULL`;

  if (scope.mode === 'OWNER') where += ` AND s.owner_user_id = @scopeUser`;
  if (scope.mode === 'ASSIGNED') where += ` AND s.assigned_user_id = @scopeUser`;

  const req = pool.request();
  if (cliente) req.input('cliente', sql.NVarChar, cliente);
  if (asunto) req.input('asunto', sql.NVarChar, asunto);
  if (id_estado) req.input('id_estado', sql.Int, id_estado);
  if (assigned_user_id) req.input('assigned_user_id', sql.Int, assigned_user_id);
  if (scope.mode !== 'ALL') req.input('scopeUser', sql.Int, scope.id_user);

  const baseFrom = `
    FROM dbo.Solicitudes s
    INNER JOIN dbo.EstadosSolicitud e ON e.id_estado = s.id_estado
    INNER JOIN dbo.Users ou ON ou.id_user = s.owner_user_id
    LEFT  JOIN dbo.Users au ON au.id_user = s.assigned_user_id
    ${where}
  `;

  const countR = await req.query(`SELECT COUNT(1) AS total ${baseFrom}`);
  const total = countR.recordset[0]?.total || 0;

  req.input('offset', sql.Int, offset);
  req.input('pageSize', sql.Int, pageSize);

  const rowsR = await req.query(`
    SELECT
      s.id_solicitud, s.cliente, s.asunto, s.deadline_utc, s.created_at_utc,
      e.nombre AS estado,
      ou.nombre AS owner_nombre,
      au.nombre AS assigned_nombre
    ${baseFrom}
    ORDER BY s.created_at_utc DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return { rows: rowsR.recordset, total };
}

async function createWithHistory({ cliente, asunto, detalle, deadlineUtcIso, ownerUserId, actorUserId, meta }) {
  const pool = await getPool();
  const trx = new sql.Transaction(pool);
  await trx.begin();

  try {
    const estadoId = await getDefaultEstadoId(trx);

    const ins = await trx.request()
      .input('cliente', sql.NVarChar, cliente)
      .input('asunto', sql.NVarChar, asunto)
      .input('detalle', sql.NVarChar, detalle)
      .input('deadline_utc', sql.DateTimeOffset, deadlineUtcIso ? new Date(deadlineUtcIso) : null)
      .input('owner_user_id', sql.Int, ownerUserId)
      .input('assigned_user_id', sql.Int, null)
      .input('id_estado', sql.Int, estadoId)
      .query(`
        INSERT INTO dbo.Solicitudes (cliente, asunto, detalle, deadline_utc, owner_user_id, assigned_user_id, id_estado)
        OUTPUT INSERTED.id_solicitud
        VALUES (@cliente, @asunto, @detalle, @deadline_utc, @owner_user_id, @assigned_user_id, @id_estado)
      `);

    const id_solicitud = ins.recordset[0].id_solicitud;

    await trx.request()
      .input('id_solicitud', sql.Int, id_solicitud)
      .input('accion', sql.VarChar, 'CREATE')
      .input('resumen', sql.NVarChar, 'Solicitud creada')
      .input('cambios_json', sql.NVarChar, JSON.stringify({
        after: { id_solicitud, cliente, asunto, detalle, deadline_utc: deadlineUtcIso, owner_user_id: ownerUserId, assigned_user_id: null, id_estado: estadoId }
      }))
      .input('actor_user_id', sql.Int, actorUserId)
      .input('ip', sql.VarChar, meta?.ip || null)
      .input('user_agent', sql.NVarChar, meta?.userAgent || null)
      .query(`
        INSERT INTO dbo.SolicitudesHistorial (id_solicitud, accion, resumen, cambios_json, actor_user_id, ip, user_agent)
        VALUES (@id_solicitud, @accion, @resumen, @cambios_json, @actor_user_id, @ip, @user_agent)
      `);

    await trx.commit();
    return { id_solicitud };
  } catch (e) {
    try { await trx.rollback(); } catch (_) { }
    throw e;
  }
}

async function updateWithHistory({ id_solicitud, actorUserId, meta, fields }) {
  const pool = await getPool();
  const trx = new sql.Transaction(pool);
  await trx.begin();

  try {
    const before = await getSolicitudForUpdate(trx, id_solicitud);
    if (!before) throw new Error('Solicitud no encontrada');

    const sets = [];
    const req = trx.request().input('id', sql.Int, id_solicitud);

    if (Object.prototype.hasOwnProperty.call(fields, 'cliente')) {
      sets.push('cliente = @cliente');
      req.input('cliente', sql.NVarChar, fields.cliente);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'asunto')) {
      sets.push('asunto = @asunto');
      req.input('asunto', sql.NVarChar, fields.asunto);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'detalle')) {
      sets.push('detalle = @detalle');
      req.input('detalle', sql.NVarChar, fields.detalle);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'deadlineUtcIso')) {
      sets.push('deadline_utc = @deadline_utc');
      req.input('deadline_utc', sql.DateTimeOffset, fields.deadlineUtcIso ? new Date(fields.deadlineUtcIso) : null);
    }

    if (!sets.length) throw new Error('No hay cambios para aplicar');

    sets.push(`updated_at_utc = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')`);

    await req.query(`
      UPDATE dbo.Solicitudes
      SET ${sets.join(', ')}
      WHERE id_solicitud = @id
    `);

    const after = await getSolicitudForUpdate(trx, id_solicitud);
    const cambios = diffFields(before, after, ['cliente', 'asunto', 'detalle', 'deadline_utc']);

    if (Object.keys(cambios).length) {
      await trx.request()
        .input('id_solicitud', sql.Int, id_solicitud)
        .input('accion', sql.VarChar, 'UPDATE')
        .input('resumen', sql.NVarChar, 'Solicitud editada')
        .input('cambios_json', sql.NVarChar, JSON.stringify({ cambios }))
        .input('actor_user_id', sql.Int, actorUserId)
        .input('ip', sql.VarChar, meta?.ip || null)
        .input('user_agent', sql.NVarChar, meta?.userAgent || null)
        .query(`
          INSERT INTO dbo.SolicitudesHistorial (id_solicitud, accion, resumen, cambios_json, actor_user_id, ip, user_agent)
          VALUES (@id_solicitud, @accion, @resumen, @cambios_json, @actor_user_id, @ip, @user_agent)
        `);
    }

    await trx.commit();
  } catch (e) {
    try { await trx.rollback(); } catch (_) { }
    throw e;
  }
}

async function assignWithHistory({ id_solicitud, assignedUserId, actorUserId, meta }) {
  const pool = await getPool();
  const trx = new sql.Transaction(pool);
  await trx.begin();

  try {
    const before = await getSolicitudForUpdate(trx, id_solicitud);
    if (!before) throw new Error('Solicitud no encontrada');

    if (assignedUserId !== null) {
      const chk = await trx.request()
        .input('uid', sql.Int, assignedUserId)
        .query(`
          SELECT TOP 1 id_user
          FROM dbo.Users
          WHERE id_user = @uid AND estado = 1 AND rol = 'ANALISTA'
        `);
      if (!chk.recordset[0]) throw new Error('El usuario asignado no es un analista activo');
    }

    await trx.request()
      .input('id', sql.Int, id_solicitud)
      .input('assigned', sql.Int, assignedUserId)
      .query(`
        UPDATE dbo.Solicitudes
        SET assigned_user_id = @assigned,
            updated_at_utc = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')
        WHERE id_solicitud = @id
      `);

    const after = await getSolicitudForUpdate(trx, id_solicitud);
    const cambios = diffFields(before, after, ['assigned_user_id']);

    await trx.request()
      .input('id_solicitud', sql.Int, id_solicitud)
      .input('accion', sql.VarChar, 'ASSIGN')
      .input('resumen', sql.NVarChar, assignedUserId ? 'Analista asignado' : 'Analista desasignado')
      .input('cambios_json', sql.NVarChar, JSON.stringify({ cambios }))
      .input('actor_user_id', sql.Int, actorUserId)
      .input('ip', sql.VarChar, meta?.ip || null)
      .input('user_agent', sql.NVarChar, meta?.userAgent || null)
      .query(`
        INSERT INTO dbo.SolicitudesHistorial (id_solicitud, accion, resumen, cambios_json, actor_user_id, ip, user_agent)
        VALUES (@id_solicitud, @accion, @resumen, @cambios_json, @actor_user_id, @ip, @user_agent)
      `);

    await trx.commit();
  } catch (e) {
    try { await trx.rollback(); } catch (_) { }
    throw e;
  }
}

async function changeEstadoWithHistory({ id_solicitud, id_estado, actorUserId, meta }) {
  const pool = await getPool();
  const trx = new sql.Transaction(pool);
  await trx.begin();

  try {
    const before = await getSolicitudForUpdate(trx, id_solicitud);
    if (!before) throw new Error('Solicitud no encontrada');

    const es = await trx.request()
      .input('eid', sql.Int, id_estado)
      .query(`
        SELECT TOP 1 id_estado, nombre
        FROM dbo.EstadosSolicitud
        WHERE id_estado = @eid AND activo = 1
      `);
    if (!es.recordset[0]) throw new Error('Estado inválido');

    await trx.request()
      .input('id', sql.Int, id_solicitud)
      .input('id_estado', sql.Int, id_estado)
      .query(`
        UPDATE dbo.Solicitudes
        SET id_estado = @id_estado,
            updated_at_utc = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00')
        WHERE id_solicitud = @id
      `);

    const after = await getSolicitudForUpdate(trx, id_solicitud);
    const cambios = diffFields(before, after, ['id_estado', 'estado']);

    await trx.request()
      .input('id_solicitud', sql.Int, id_solicitud)
      .input('accion', sql.VarChar, 'CHANGE_STATUS')
      .input('resumen', sql.NVarChar, `Estado cambiado a: ${es.recordset[0].nombre}`)
      .input('cambios_json', sql.NVarChar, JSON.stringify({ cambios }))
      .input('actor_user_id', sql.Int, actorUserId)
      .input('ip', sql.VarChar, meta?.ip || null)
      .input('user_agent', sql.NVarChar, meta?.userAgent || null)
      .query(`
        INSERT INTO dbo.SolicitudesHistorial (id_solicitud, accion, resumen, cambios_json, actor_user_id, ip, user_agent)
        VALUES (@id_solicitud, @accion, @resumen, @cambios_json, @actor_user_id, @ip, @user_agent)
      `);

    await trx.commit();
  } catch (e) {
    try { await trx.rollback(); } catch (_) { }
    throw e;
  }
}

async function addCommentWithHistory({ id_solicitud, comentario, actorUserId, meta }) {
  const pool = await getPool();
  const trx = new sql.Transaction(pool);
  await trx.begin();

  try {
    const locked = await getSolicitudForUpdate(trx, id_solicitud);
    if (!locked) throw new Error('Solicitud no encontrada');

    const ins = await trx.request()
      .input('id_solicitud', sql.Int, id_solicitud)
      .input('actor_user_id', sql.Int, actorUserId)
      .input('comentario', sql.NVarChar, comentario)
      .query(`
        INSERT INTO dbo.SolicitudesComentarios (id_solicitud, actor_user_id, comentario)
        OUTPUT INSERTED.id_comentario
        VALUES (@id_solicitud, @actor_user_id, @comentario)
      `);

    const id_comentario = ins.recordset[0].id_comentario;

    await trx.request()
      .input('id_solicitud', sql.Int, id_solicitud)
      .input('accion', sql.VarChar, 'COMMENT')
      .input('resumen', sql.NVarChar, 'Comentario agregado')
      .input('cambios_json', sql.NVarChar, JSON.stringify({ id_comentario, comentario }))
      .input('actor_user_id', sql.Int, actorUserId)
      .input('ip', sql.VarChar, meta?.ip || null)
      .input('user_agent', sql.NVarChar, meta?.userAgent || null)
      .query(`
        INSERT INTO dbo.SolicitudesHistorial (id_solicitud, accion, resumen, cambios_json, actor_user_id, ip, user_agent)
        VALUES (@id_solicitud, @accion, @resumen, @cambios_json, @actor_user_id, @ip, @user_agent)
      `);

    await trx.commit();
  } catch (e) {
    try { await trx.rollback(); } catch (_) { }
    throw e;
  }
}

async function getDetalle(scope, id_solicitud, paging = {}) {
  const pool = await getPool();

  const histPage = Math.max(1, Number(paging.histPage || 1));
  const comPage = Math.max(1, Number(paging.comPage || 1));
  const histSize = Math.max(5, Number(paging.histSize || 10));
  const comSize = Math.max(5, Number(paging.comSize || 10));

  const histOffset = (histPage - 1) * histSize;
  const comOffset = (comPage - 1) * comSize;

  let where = `WHERE s.id_solicitud = @id `;
  if (scope.mode === 'OWNER') where += ` AND s.owner_user_id = @scopeUser`;
  if (scope.mode === 'ASSIGNED') where += ` AND s.assigned_user_id = @scopeUser`;

  const req = pool.request().input('id', sql.Int, id_solicitud);
  if (scope.mode !== 'ALL') req.input('scopeUser', sql.Int, scope.id_user);

  const sol = await req.query(`
    SELECT
      s.id_solicitud, s.cliente, s.asunto, s.detalle, s.deadline_utc,
      s.created_at_utc, s.updated_at_utc,
      e.nombre AS estado,
      ou.nombre AS owner_nombre, ou.username AS owner_username,
      au.nombre AS assigned_nombre, au.username AS assigned_username
    FROM dbo.Solicitudes s
    INNER JOIN dbo.EstadosSolicitud e ON e.id_estado = s.id_estado
    INNER JOIN dbo.Users ou ON ou.id_user = s.owner_user_id
    LEFT  JOIN dbo.Users au ON au.id_user = s.assigned_user_id
    ${where}
  `);

  const solicitud = sol.recordset[0];
  if (!solicitud) return null;

  const histCount = await pool.request()
    .input('id', sql.Int, id_solicitud)
    .query(`SELECT COUNT(1) AS total FROM dbo.SolicitudesHistorial WHERE id_solicitud=@id`);

  const comCount = await pool.request()
    .input('id', sql.Int, id_solicitud)
    .query(`SELECT COUNT(1) AS total FROM dbo.SolicitudesComentarios WHERE id_solicitud=@id`);

  const histTotal = histCount.recordset[0]?.total || 0;
  const comTotal = comCount.recordset[0]?.total || 0;

  const hist = await pool.request()
    .input('id', sql.Int, id_solicitud)
    .input('off', sql.Int, histOffset)
    .input('sz', sql.Int, histSize)
    .query(`
      SELECT
        h.id_historial, h.accion, h.resumen, h.cambios_json,
        h.created_at_utc,
        u.nombre AS actor_nombre,
        u.rol AS actor_rol
      FROM dbo.SolicitudesHistorial h
      INNER JOIN dbo.Users u ON u.id_user = h.actor_user_id
      WHERE h.id_solicitud = @id
      ORDER BY h.created_at_utc DESC
      OFFSET @off ROWS FETCH NEXT @sz ROWS ONLY
    `);

  const com = await pool.request()
    .input('id', sql.Int, id_solicitud)
    .input('off', sql.Int, comOffset)
    .input('sz', sql.Int, comSize)
    .query(`
      SELECT
        c.id_comentario,
        c.comentario,
        c.created_at_utc,
        u.nombre AS actor_nombre,
        u.rol AS actor_rol
      FROM dbo.SolicitudesComentarios c
      INNER JOIN dbo.Users u ON u.id_user = c.actor_user_id
      WHERE c.id_solicitud = @id
      ORDER BY c.created_at_utc DESC
      OFFSET @off ROWS FETCH NEXT @sz ROWS ONLY
    `);

  return {
    solicitud,
    historial: hist.recordset,
    comentarios: com.recordset,
    histPager: { page: histPage, size: histSize, total: histTotal },
    comPager: { page: comPage, size: comSize, total: comTotal }
  };
}


module.exports = {
  list,
  listEstados,
  listAnalistas,
  createWithHistory,
  updateWithHistory,
  assignWithHistory,
  changeEstadoWithHistory,
  addCommentWithHistory,
  getDetalle
};
