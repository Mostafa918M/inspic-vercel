const express = require('express');
const auth = require('../middlewares/authMiddleware');
const { getProfile,
    updateProfile,
    addFollow,
    removeFollow,
    getFollowers
 } = require('../controllers/user.controller');

const router = express.Router();


router.get('/profile', auth(), getProfile);
router.put('/profile',auth(),updateProfile);
router.get('/followers', auth(), getFollowers);
router.post('/follow/:id',auth(),addFollow);
router.delete('/follow/:id',auth(),removeFollow);

module.exports = router;