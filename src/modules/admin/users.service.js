const bcrypt = require('bcryptjs');
const repo = require('./users.repo');

const ROLES = ['VENDEDOR', 'JEFE', 'ANALISTA', 'ADMIN'];

function validUsername(u) {
    // letras, números, punto, guión bajo y guión (simple)
    return /^[a-zA-Z0-9._-]{3,50}$/.test(u);
}

async function list(filtros) {
    return repo.list(filtros);
}

async function getById(id) {
    if (!Number.isInteger(id) || id <= 0) return null;
    return repo.getById(id);
}

async function create({ username, nombre, correo, rol, estado, password }) {
    if (!username || !validUsername(username)) throw new Error('Username inválido (3-50, letras/números . _ -)');
    if (!nombre || nombre.length > 120) throw new Error('Nombre inválido');
    if (!ROLES.includes(rol)) throw new Error('Rol inválido');
    if (!password || password.length < 8) throw new Error('Password mínimo 8 caracteres');

    const exists = await repo.getByUsername(username);
    if (exists) throw new Error('Username ya existe');

    const pass_hash = await bcrypt.hash(password, 10);

    await repo.create({
        username,
        nombre,
        correo,
        rol,
        estado: estado ? 1 : 0,
        pass_hash
    });
}

async function update(id, { nombre, correo, rol, estado }) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('ID inválido');
    if (!nombre || nombre.length > 120) throw new Error('Nombre inválido');
    if (!ROLES.includes(rol)) throw new Error('Rol inválido');

    const u = await repo.getById(id);
    if (!u) throw new Error('Usuario no encontrado');

    await repo.update(id, {
        nombre,
        correo,
        rol,
        estado: estado ? 1 : 0
    });
}

async function toggleEstado(id) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('ID inválido');
    await repo.toggleEstado(id);
}

async function resetPassword(id, newPass) {
    if (!Number.isInteger(id) || id <= 0) throw new Error('ID inválido');
    if (!newPass || newPass.length < 8) throw new Error('Password mínimo 8 caracteres');

    const pass_hash = await bcrypt.hash(newPass, 10);
    await repo.updatePassword(id, pass_hash);
}

module.exports = { list, getById, create, update, toggleEstado, resetPassword };