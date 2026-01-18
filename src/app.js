require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const nunjucks = require('nunjucks');

const authRoutes = require('./modules/auth/auth.routes');
const solicitudesRoutes = require('./modules/solicitudes/solicitudes.routes');
const adminUsersRoutes = require('./modules/admin/users.routes');

const app = express();

// 1) Helmet SIN CSP (para permitir CDN + scripts inline del layout)
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 2) Session ANTES de cualquier ruta protegida
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
}));

// 3) Flash + user global (después de session)
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.flash = req.session?.flash || null;
    delete req.session.flash;
    next();
});

// 4) Nunjucks
const njkEnv = nunjucks.configure(path.join(__dirname, '..', 'views'), {
    autoescape: true,
    express: app
});

njkEnv.addFilter('fmtDT', (value) => {
    if (!value) return '-';
    const d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);

    return new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(d);
});

// 5) Static SIEMPRE antes de rutas (para que /public no redirija a login)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// 6) Rutas (después de session + static)
app.use(authRoutes);
app.use(solicitudesRoutes);
app.use(adminUsersRoutes);

app.get('/', (req, res) => res.redirect('/solicitudes'));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Error interno');
});

module.exports = app;
