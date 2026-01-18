const service = require('./users.service');

function parseIntSafe(v, def) {
    const n = parseInt(String(v || ''), 10);
    return Number.isFinite(n) ? n : def;
}

async function list(req, res) {
    const filtros = req.query;
    const page = Math.max(1, parseIntSafe(filtros.page, 1));
    const pageSize = [10, 20, 50, 100].includes(parseIntSafe(filtros.pageSize, 20)) ? parseIntSafe(filtros.pageSize, 20) : 20;

    const data = await service.list({ ...filtros, page, pageSize });

    res.render('pages/admin-users-list.njk', {
        user: req.session.user,
        filtros: { ...filtros, page, pageSize },
        rows: data.rows,
        total: data.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((data.total || 0) / pageSize))
    });
}

async function viewNew(req, res) {
    res.render('pages/admin-user-form.njk', {
        user: req.session.user,
        mode: 'new',
        error: null,
        form: { username: '', nombre: '', correo: '', rol: 'VENDEDOR', estado: 1, password: '' }
    });
}

async function create(req, res) {
    try {
        await service.create({
            username: (req.body.username || '').trim(),
            nombre: (req.body.nombre || '').trim(),
            correo: (req.body.correo || '').trim() || null,
            rol: String(req.body.rol || '').toUpperCase(),
            estado: req.body.estado === '1' ? 1 : 0,
            password: String(req.body.password || '')
        });

        req.session.flash = { type: 'success', message: 'Usuario creado' };
        return res.redirect('/admin/users');
    } catch (e) {
        return res.status(400).render('pages/admin-user-form.njk', {
            user: req.session.user,
            mode: 'new',
            error: e.message || 'No se pudo crear',
            form: {
                username: req.body.username || '',
                nombre: req.body.nombre || '',
                correo: req.body.correo || '',
                rol: (req.body.rol || 'VENDEDOR'),
                estado: req.body.estado === '1' ? 1 : 0,
                password: ''
            }
        });
    }
}

async function viewEdit(req, res) {
    const id = Number(req.params.id);
    const u = await service.getById(id);
    if (!u) return res.status(404).send('Usuario no encontrado');

    res.render('pages/admin-user-form.njk', {
        user: req.session.user,
        mode: 'edit',
        error: null,
        form: {
            id_user: u.id_user,
            username: u.username,
            nombre: u.nombre,
            correo: u.correo || '',
            rol: u.rol,
            estado: u.estado ? 1 : 0,
            password: ''
        }
    });
}

async function update(req, res) {
    const id = Number(req.params.id);

    try {
        await service.update(id, {
            nombre: (req.body.nombre || '').trim(),
            correo: (req.body.correo || '').trim() || null,
            rol: String(req.body.rol || '').toUpperCase(),
            estado: req.body.estado === '1' ? 1 : 0
        });

        req.session.flash = { type: 'success', message: 'Usuario actualizado' };
        return res.redirect('/admin/users');
    } catch (e) {
        const u = await service.getById(id);
        if (!u) return res.status(404).send('Usuario no encontrado');

        return res.status(400).render('pages/admin-user-form.njk', {
            user: req.session.user,
            mode: 'edit',
            error: e.message || 'No se pudo actualizar',
            form: {
                id_user: id,
                username: u.username,
                nombre: req.body.nombre || u.nombre,
                correo: req.body.correo || (u.correo || ''),
                rol: req.body.rol || u.rol,
                estado: req.body.estado === '1' ? 1 : 0,
                password: ''
            }
        });
    }
}

async function toggleEstado(req, res) {
    const id = Number(req.params.id);
    await service.toggleEstado(id);

    req.session.flash = { type: 'success', message: 'Estado actualizado' };
    return res.redirect('/admin/users');
}

async function resetPass(req, res) {
    const id = Number(req.params.id);
    const newPass = String(req.body.new_password || '');

    await service.resetPassword(id, newPass);

    req.session.flash = { type: 'success', message: 'Contraseña reseteada' };
    return res.redirect('/admin/users');
}

module.exports = { list, viewNew, create, viewEdit, update, toggleEstado, resetPass };
