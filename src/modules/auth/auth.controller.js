const authService = require('./auth.service');

function viewLogin(req, res) {
    res.render('pages/login.njk', { error: null });
}

async function doLogin(req, res) {
    try {
        const { username, password } = req.body;
        const user = await authService.validateUser(username, password);

        if (!user) return res.status(401).render('pages/login.njk', { error: 'Credenciales inválidas' });
        if (!user.estado) return res.status(403).render('pages/login.njk', { error: 'Usuario deshabilitado' });

        req.session.user = {
            id_user: user.id_user,
            username: user.username,
            nombre: user.nombre,
            rol: user.rol
        };
        return res.redirect('/solicitudes');
    } catch (e) {
        console.error(e);
        return res.status(500).render('pages/login.njk', { error: 'Error interno' });
    }
}

function logout(req, res) {
    req.session.destroy(() => res.redirect('/login'));
}

module.exports = { viewLogin, doLogin, logout };
