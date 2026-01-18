const repo = require('./solicitudes.repo');

function getMeta(req) {
    return {
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null
    };
}

function parseUtcIso(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

function isClosedOrCancelled(estadoNombre) {
    const x = (estadoNombre || '').toLowerCase();
    return x === 'cerrado' || x === 'cancelado';
}

function resolveTab(user, tab) {
    const rol = user.rol;

    const allowedByRole = {
        VENDEDOR: ['mine'],
        ANALISTA: ['assigned', 'mine'],
        JEFE: ['all', 'mine', 'assigned'],
        ADMIN: ['all', 'mine', 'assigned']
    };

    const allowed = allowedByRole[rol] || ['mine'];
    const normalized = (tab || '').toLowerCase();

    let resolved = allowed.includes(normalized) ? normalized : allowed[0];

    // default más lógico:
    if (!tab) {
        if (rol === 'ANALISTA') resolved = 'assigned';
        if (rol === 'VENDEDOR') resolved = 'mine';
        if (rol === 'JEFE' || rol === 'ADMIN') resolved = 'all';
    }

    return { resolved, allowed };
}

function tabToScopeAndFlags(user, tabResolved) {
    const rol = user.rol;

    // Para JEFE/ADMIN:
    // - all: todo
    // - mine: owner_user_id = yo
    // - assigned: todo pero con assigned_user_id IS NOT NULL (flag)
    if (rol === 'JEFE' || rol === 'ADMIN') {
        if (tabResolved === 'mine') return { scope: { mode: 'OWNER', id_user: user.id_user }, onlyAssigned: false };
        if (tabResolved === 'assigned') return { scope: { mode: 'ALL' }, onlyAssigned: true };
        return { scope: { mode: 'ALL' }, onlyAssigned: false };
    }

    // Para ANALISTA:
    if (rol === 'ANALISTA') {
        if (tabResolved === 'mine') return { scope: { mode: 'OWNER', id_user: user.id_user }, onlyAssigned: false };
        return { scope: { mode: 'ASSIGNED', id_user: user.id_user }, onlyAssigned: false };
    }

    // Para VENDEDOR:
    return { scope: { mode: 'OWNER', id_user: user.id_user }, onlyAssigned: false };
}

function computePermissions(user, solicitud) {
    const rol = user.rol;

    const isOwner = solicitud.owner_username === user.username;
    const isAssigned = solicitud.assigned_username === user.username;

    const closed = isClosedOrCancelled(solicitud.estado);

    const canAssign = (rol === 'JEFE' || rol === 'ADMIN');
    const canChangeStatus = (rol === 'ANALISTA' || rol === 'JEFE' || rol === 'ADMIN');

    let canEdit = false;

    if (!closed) {
        if (rol === 'ADMIN' || rol === 'JEFE') canEdit = true;
        else if (rol === 'VENDEDOR' && isOwner) canEdit = true;
        else if (rol === 'ANALISTA' && isAssigned) canEdit = true;
    }

    // Política de edición por campo (UI)
    const editPolicy = {
        cliente: false,
        asunto: false,
        deadline: false,
        detalle: false
    };

    if (!closed) {
        if (rol === 'ADMIN' || rol === 'JEFE') {
            editPolicy.cliente = editPolicy.asunto = editPolicy.deadline = editPolicy.detalle = true;
        } else if (rol === 'VENDEDOR' && isOwner) {
            editPolicy.cliente = editPolicy.asunto = editPolicy.deadline = editPolicy.detalle = true;
        } else if (rol === 'ANALISTA' && isAssigned) {
            editPolicy.detalle = true; // v1
        }
    }

    return { canEdit, canAssign, canChangeStatus, isOwner, isAssigned, closed, editPolicy };
}

async function listSolicitudes(user, filtros) {
    const page = Math.max(1, Number(filtros.page || 1));
    const pageSize = Number(filtros.pageSize || 20);

    const { resolved: tabResolved, allowed } = resolveTab(user, filtros.tab);
    const { scope, onlyAssigned } = tabToScopeAndFlags(user, tabResolved);

    const [estados, rowsPack] = await Promise.all([
        repo.listEstados(),
        repo.list(scope, { ...filtros, page, pageSize, onlyAssigned })
    ]);

    let analistas = [];
    if (user.rol === 'JEFE' || user.rol === 'ADMIN') {
        analistas = await repo.listAnalistas();
    }

    const tabLabels = { all: 'Todas', mine: 'Mis solicitudes', assigned: 'Asignadas' };
    const tabs = allowed.map(key => ({
        key,
        label: tabLabels[key] || key,
        active: key === tabResolved
    }));

    return {
        tabResolved,
        tabs,
        rows: rowsPack.rows,
        total: rowsPack.total,
        estados,
        analistas
    };
}

async function createSolicitud(user, payload, req) {
    if (!payload.cliente) throw new Error('Cliente es obligatorio');
    if (!payload.asunto) throw new Error('Asunto es obligatorio');
    if (payload.cliente.length > 150) throw new Error('Cliente excede 150 caracteres');
    if (payload.asunto.length > 200) throw new Error('Asunto excede 200 caracteres');

    const deadlineIso = parseUtcIso(payload.deadline_utc_iso);

    return repo.createWithHistory({
        cliente: payload.cliente,
        asunto: payload.asunto,
        detalle: payload.detalle || null,
        deadlineUtcIso: deadlineIso,
        ownerUserId: user.id_user,
        actorUserId: user.id_user,
        meta: getMeta(req)
    });
}

async function getDetalle(user, id_solicitud, paging = {}) {
    if (!Number.isInteger(id_solicitud) || id_solicitud <= 0) return null;

    const scope =
        (user.rol === 'ADMIN' || user.rol === 'JEFE') ? { mode: 'ALL' } :
            (user.rol === 'ANALISTA') ? { mode: 'ASSIGNED', id_user: user.id_user } :
                { mode: 'OWNER', id_user: user.id_user };

    const data = await repo.getDetalle(scope, id_solicitud, paging);
    if (!data) return null;

    const permisos = computePermissions(user, data.solicitud);

    const estados = await repo.listEstados();
    let analistas = [];
    if (permisos.canAssign) analistas = await repo.listAnalistas();

    return { ...data, ...permisos, estados, analistas };
}


async function updateSolicitud(user, id_solicitud, payload, req) {
    const detail = await getDetalle(user, id_solicitud);
    if (!detail) throw new Error('Solicitud no encontrada');
    if (!detail.canEdit) throw new Error('No autorizado');

    const meta = getMeta(req);
    const rol = user.rol;

    const deadlineIso = parseUtcIso(payload.deadline_utc_iso);

    let fields = {};

    if (rol === 'ADMIN' || rol === 'JEFE' || rol === 'VENDEDOR') {
        if (!payload.cliente) throw new Error('Cliente es obligatorio');
        if (!payload.asunto) throw new Error('Asunto es obligatorio');
        if (payload.cliente.length > 150) throw new Error('Cliente excede 150 caracteres');
        if (payload.asunto.length > 200) throw new Error('Asunto excede 200 caracteres');

        fields = {
            cliente: payload.cliente,
            asunto: payload.asunto,
            detalle: payload.detalle || null,
            deadlineUtcIso: deadlineIso
        };
    } else if (rol === 'ANALISTA') {
        fields = { detalle: payload.detalle || null };
    } else {
        throw new Error('No autorizado');
    }

    await repo.updateWithHistory({
        id_solicitud,
        actorUserId: user.id_user,
        meta,
        fields
    });
}

async function assignAnalista(user, id_solicitud, assigned_user_id, req) {
    if (user.rol !== 'JEFE' && user.rol !== 'ADMIN') throw new Error('No autorizado');
    if (!Number.isInteger(id_solicitud) || id_solicitud <= 0) throw new Error('ID inválido');

    if (assigned_user_id !== null && (!Number.isInteger(assigned_user_id) || assigned_user_id <= 0)) {
        throw new Error('Analista inválido');
    }

    await repo.assignWithHistory({
        id_solicitud,
        assignedUserId: assigned_user_id,
        actorUserId: user.id_user,
        meta: getMeta(req)
    });
}


async function changeEstado(user, id_solicitud, id_estado, comentario, req) {
    if (!comentario || !comentario.trim()) throw new Error('Justificación requerida.');
    if (comentario.length > 4000) throw new Error('Justificación excede 4000 caracteres.');

    // tu lógica actual de workflow/permisos (se mantiene)
    const detail = await getDetalle(user, id_solicitud);
    if (!detail) throw new Error('Solicitud no encontrada o sin acceso');

    const estados = detail.estados || [];
    const target = estados.find(e => e.id_estado === id_estado);
    if (!target) throw new Error('Estado inválido');

    // (mantén tu validación de transiciones y roles tal como la tienes)

    const meta = {
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null
    };

    await repo.changeEstadoWithHistoryAndComment({
        id_solicitud,
        id_estado,
        actorUserId: user.id_user,
        comentario: comentario.trim(),
        meta
    });
}


async function addComentario(user, id_solicitud, comentario, req) {
    if (!comentario) throw new Error('Comentario vacío');
    if (comentario.length > 4000) throw new Error('Comentario excede 4000 caracteres');

    // validar acceso: si puede ver el detalle, puede comentar
    const detail = await getDetalle(user, id_solicitud);
    if (!detail) throw new Error('Solicitud no encontrada o sin acceso');

    await repo.addCommentWithHistory({
        id_solicitud,
        comentario,
        actorUserId: user.id_user,
        meta: getMeta(req)
    });
}

async function exportSolicitudesCsv(user, filtros) {
    // solo JEFE/ADMIN (ruta ya lo limita)
    const { resolved: tabResolved } = resolveTab(user, filtros.tab);
    const { scope, onlyAssigned } = tabToScopeAndFlags(user, tabResolved);

    const pack = await repo.list(scope, { ...filtros, onlyAssigned });

    const rows = pack.rows || [];
    const header = ['ID', 'Cliente', 'Asunto', 'Estado', 'Owner', 'Asignado', 'Creacion_UTC', 'Deadline_UTC'];

    const esc = (v) => {
        const s = (v === null || v === undefined) ? '' : String(v);
        const safe = s.replaceAll('"', '""');
        return `"${safe}"`;
    };

    const lines = [header.map(esc).join(',')];

    for (const r of rows) {
        lines.push([
            r.id_solicitud,
            r.cliente,
            r.asunto,
            r.estado,
            r.owner_nombre,
            r.assigned_nombre || '',
            r.created_at_utc || '',
            r.deadline_utc || ''
        ].map(esc).join(','));
    }

    return lines.join('\n');
}


module.exports = {
    listSolicitudes,
    createSolicitud,
    getDetalle,
    updateSolicitud,
    assignAnalista,
    changeEstado,
    addComentario,
    exportSolicitudesCsv
};
