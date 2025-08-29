const express = require("express");
const { 
 createBoard,
    getBoard,
    getBoardsByUser,
    getPublicBoards,
    updateBoard,
    patchBoard,
    deleteBoard,
    addPinToBoard,
    removePinFromBoard
 } = require("../controllers/board.controller");

const router = express.Router();

const auth = require("../middlewares/authMiddleware");

// POST /boards
router.post("/", auth(), createBoard);

// GET /boards
router.get("/user", auth(), getBoardsByUser);

// GET /boards/public
router.get("/public", auth(), getPublicBoards);

// GET /boards/:boardId
router.get("/:boardId", auth(), getBoard);

// PUT /boards/:boardId
router.put("/:boardId", auth(), updateBoard);

// DELETE /boards/:boardId
router.delete("/:boardId", auth(), deleteBoard);

// POST /boards/:boardId/pins
router.post("/:boardId/pins", auth(), addPinToBoard);

// DELETE /boards/:boardId/pins/:pinId
router.delete("/:boardId/pins/:pinId", auth(), removePinFromBoard);

module.exports = router;