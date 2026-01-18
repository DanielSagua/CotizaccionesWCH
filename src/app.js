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

// Helmet SIN CSP (permite CDN + inline scripts)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Por si algún middleware/proxy deja CSP seteado
app.use((req, res, next) => {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    next();
});

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session ANTES de rutas protegidas
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
}));

// Flash + user global
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.flash = req.session?.flash || null;
    delete req.session.flash;
    next();
});

// Nunjucks (si tu carpeta views está en la raíz del proyecto)
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
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    }).format(d);
});

// Static ANTES de rutas
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Rutas
app.use(authRoutes);
app.use(solicitudesRoutes);
app.use(adminUsersRoutes);

app.get('/', (req, res) => res.redirect('/solicitudes'));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Error interno');
});

module.exports = app;
