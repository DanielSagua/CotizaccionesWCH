const service = require('./solicitudes.service');
const { buildQueryString } = require('../../utils/url');

function parseIntSafe(v, def) {
    const n = parseInt(String(v || ''), 10);
    return Number.isFinite(n) ? n : def;
}

function normalizePageSize(v) {
    const n = parseIntSafe(v, 20);
    const allowed = [10, 20, 50, 100];
    return allowed.includes(n) ? n : 20;
}

function buildPagerUrls(baseQuery, totalPages, currentPage) {
    const page = currentPage;
    const mk = (over) => `/solicitudes${buildQueryString(baseQuery, { ...over })}`;

    const prevUrl = page > 1 ? mk({ page: page - 1 }) : null;
    const nextUrl = page < totalPages ? mk({ page: page + 1 }) : null;

    // ventana de páginas
    const windowSize = 5;
    const start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const realStart = Math.max(1, end - windowSize + 1);

    const pages = [];
    for (let p = realStart; p <= end; p++) {
        pages.push({ n: p, url: mk({ page: p }), active: p === page });
    }

    return { prevUrl, nextUrl, pages };
}

async function list(req, res) {
    const user = req.session.user;

    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const pageSize = normalizePageSize(req.query.pageSize);
    const tab = String(req.query.tab || '').toLowerCase();

    const filtros = { ...req.query, page, pageSize, tab };
    const data = await service.listSolicitudes(user, filtros);

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
    const baseQuery = { ...req.query, pageSize, tab }; // se mantiene filtros
    delete baseQuery.page;

    const pager = buildPagerUrls(baseQuery, totalPages, page);

    // URLs tabs
    const mkTab = (t) => `/solicitudes${buildQueryString(baseQuery, { tab: t, page: 1 })}`;

    res.render('pages/solicitudes-list.njk', {
        user,
        filtros: { ...req.query, page, pageSize, tab },
        tab: data.tabResolved,
        tabs: data.tabs, // { key,label,url,active }
        rows: data.rows,
        total: data.total,
        page,
        pageSize,
        totalPages,
        pager,
        estados: data.estados || [],
        analistas: data.analistas || []
    });
}

async function viewNew(req, res) {
    const user = req.session.user;
    res.render('pages/solicitud-new.njk', {
        user,
        error: null,
        form: { cliente: '', asunto: '', detalle: '', deadline: '' }
    });
}

async function create(req, res) {
    const user = req.session.user;

    try {
        const payload = {
            cliente: (req.body.cliente || '').trim(),
            asunto: (req.body.asunto || '').trim(),
            detalle: (req.body.detalle || '').trim(),
            deadline_utc_iso: (req.body.deadline_utc_iso || '').trim()
        };

        const result = await service.createSolicitud(user, payload, req);

        req.session.flash = { type: 'success', message: `Solicitud #${result.id_solicitud} creada` };
        return res.redirect(`/solicitudes/${result.id_solicitud}`);
    } catch (e) {
        console.error(e);
        return res.status(400).render('pages/solicitud-new.njk', {
            user,
            error: e.message || 'No se pudo crear la solicitud',
            form: {
                cliente: req.body.cliente || '',
                asunto: req.body.asunto || '',
                detalle: req.body.detalle || '',
                deadline: req.body.deadline || ''
            }
        });
    }
}

async function detail(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    const histPage = Math.max(1, parseIntSafe(req.query.histPage, 1));
    const comPage = Math.max(1, parseIntSafe(req.query.comPage, 1));
    const histSize = 10;
    const comSize = 10;

    const data = await service.getDetalle(user, id, { histPage, histSize, comPage, comSize });
    if (!data) return res.status(404).send('Solicitud no encontrada');

    res.render('pages/solicitud-detalle.njk', {
        user,
        solicitud: data.solicitud,
        historial: data.historial,
        comentarios: data.comentarios,
        estados: data.estados || [],
        analistas: data.analistas || [],
        canEdit: data.canEdit,
        canAssign: data.canAssign,
        canChangeStatus: data.canChangeStatus,

        histPager: data.histPager,
        comPager: data.comPager
    });
}


async function viewEdit(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    const data = await service.getDetalle(user, id);
    if (!data) return res.status(404).send('Solicitud no encontrada');
    if (!data.canEdit) return res.status(403).send('No autorizado');

    res.render('pages/solicitud-edit.njk', {
        user,
        error: null,
        solicitud: data.solicitud,
        editPolicy: data.editPolicy
    });
}

async function update(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    try {
        const payload = {
            cliente: (req.body.cliente || '').trim(),
            asunto: (req.body.asunto || '').trim(),
            detalle: (req.body.detalle || '').trim(),
            deadline_utc_iso: (req.body.deadline_utc_iso || '').trim()
        };

        await service.updateSolicitud(user, id, payload, req);
        req.session.flash = { type: 'success', message: 'Solicitud actualizada' };
        return res.redirect(`/solicitudes/${id}`);
    } catch (e) {
        console.error(e);
        const data = await service.getDetalle(user, id);
        if (!data) return res.status(404).send('Solicitud no encontrada');

        return res.status(400).render('pages/solicitud-edit.njk', {
            user,
            error: e.message || 'No se pudo actualizar',
            solicitud: data.solicitud,
            editPolicy: data.editPolicy
        });
    }
}

async function assign(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    try {
        const assigned_user_id = req.body.assigned_user_id ? Number(req.body.assigned_user_id) : null;
        await service.assignAnalista(user, id, assigned_user_id, req);

        req.session.flash = { type: 'success', message: 'Asignación guardada' };
        return res.redirect(`/solicitudes/${id}`);
    } catch (e) {
        console.error(e);
        return res.status(400).send(e.message || 'No se pudo asignar');
    }
}

async function changeStatus(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    try {
        const id_estado = Number(req.body.id_estado);
        await service.changeEstado(user, id, id_estado, req);

        req.session.flash = { type: 'success', message: 'Estado actualizado' };
        return res.redirect(`/solicitudes/${id}`);
    } catch (e) {
        console.error(e);
        return res.status(400).send(e.message || 'No se pudo cambiar estado');
    }
}

async function addComment(req, res) {
    const user = req.session.user;
    const id = Number(req.params.id);

    try {
        const comentario = (req.body.comentario || '').trim();
        await service.addComentario(user, id, comentario, req);

        req.session.flash = { type: 'success', message: 'Comentario agregado' };
        return res.redirect(`/solicitudes/${id}`);
    } catch (e) {
        console.error(e);
        return res.status(400).send(e.message || 'No se pudo agregar comentario');
    }
}

async function exportCsv(req, res) {
    const user = req.session.user;

    const filtros = { ...req.query, page: 1, pageSize: 5000 };
    const csv = await service.exportSolicitudesCsv(user, filtros);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="solicitudes.csv"');
    res.write('\uFEFF'); // BOM Excel
    res.end(csv);
}



module.exports = { list, viewNew, create, detail, viewEdit, update, assign, changeStatus, addComment, exportCsv };
