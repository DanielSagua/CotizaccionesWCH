function requireAnyRole(roles = []) {
    return (req, res, next) => {
        const user = req.session?.user;
        if (!user) return res.redirect('/login');
        if (!roles.includes(user.rol)) return res.status(403).send('No autorizado');
        return next();
    };
}

module.exports = { requireAnyRole };
