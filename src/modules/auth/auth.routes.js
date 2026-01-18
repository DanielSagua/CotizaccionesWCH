const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');

router.get('/login', controller.viewLogin);
router.post('/login', controller.doLogin);
router.post('/logout', controller.logout);

module.exports = router;
