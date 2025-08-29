//utilities
const ApiError = require('../utils/ApiError');
const asyncErrorHandler = require('../utils/asyncErrorHandler');
const sendResponse = require('../utils/sendResponse');
//models
const Board = require('../models/board.model');
const Pin = require('../models/pin.model');
const User = require('../models/users.model');


// ---- Helpers ----
const ALLOWED_PRIVACY = new Set(['public', 'private']);

const parsePagination = (req) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const skip = (page - 1) * limit;

  const sort = (req.query.sort || 'createdAt:desc')
    .split(',')
    .reduce((acc, part) => {
      const [field, dir = 'desc'] = part.split(':');
      acc[field] = dir.toLowerCase() === 'desc' ? -1 : 1;
      return acc;
    }, {});

  return { limit, page, skip, sort };
};

// ---- Controllers ----


// POST /boards
const createBoard = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user?.id;
  const { title, description = '', privacy = 'public' } = req.body;

  if (!userId) return next(new ApiError('Authentication required', 401));
  if (!title) return next(new ApiError('Board title is required', 400));
  if (!ALLOWED_PRIVACY.has(privacy)) return next(new ApiError('Invalid privacy value', 400));

  
  const board = await Board.create({
      name: title,
      description: description,
      owner: userId,
      privacy
    });
    await User.findByIdAndUpdate(userId, {
      $addToSet: { boards: board._id }
    });

  return sendResponse(res, 201, 'success', 'Board created', { board });
});

// GET /boards/:boardId
const getBoard = asyncErrorHandler(async (req, res, next) => {
  const { boardId } = req.params;
  if (!boardId) return next(new ApiError('Board ID is required', 400));

  const board = await Board.findById(boardId)
    .populate('owner', 'name avatar')
    .populate('pins','-keywords -comments -likers');

  if (!board) return next(new ApiError('Board not found', 404));

  const requesterId = req.user?.id;
  const isOwner = requesterId && String(requesterId) === String(board.owner._id);
  if (board.privacy === 'private' && !isOwner) {
    return next(new ApiError('You are not authorized to view this board', 403));
  }

  return sendResponse(res, 200, 'success', 'Board retrieved', { board });
});

// GET /boards  (current user's boards)
const getBoardsByUser = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id
  console.log(userId);
  console.log(typeof userId);
  if (!userId) return next(new ApiError('Authentication required', 401));

  const { limit, skip, sort, page } = parsePagination(req);

  const boards = await Board.find({ owner: req.user.id }).sort(sort).skip(skip).limit(limit).populate('pins','-keywords -comments -likers');
  const total = await Board.countDocuments({ owner: req.user.id });

  return sendResponse(res, 200, 'success', 'Boards retrieved', { boards, pagination: { total, limit, page } });
});

// GET /boards/public
const getPublicBoards = asyncErrorHandler(async (req, res) => {
  const { limit, skip, sort, page } = parsePagination(req);
  const q = req.query.q?.trim();

  const filter = { privacy: 'public' };
  if (q) filter.name = { $regex: q, $options: 'i' };

  const [boards, total] = await Promise.all([
    Board.find(filter).sort(sort).skip(skip).limit(limit).populate('pins','-keywords -comments -likers'),
    Board.countDocuments(filter)
  ]);

  return sendResponse(res, 200, 'success', 'Public boards retrieved', {
    boards,
    pagination: { total, limit, page }
  });
});

// PUT /boards/:boardId  (full/semantic update)
const updateBoard = asyncErrorHandler(async (req, res, next) => {
  const { boardId } = req.params;
  const userId = req.user?.id;
  const { title, description, privacy } = req.body;

  if (!userId) return next(new ApiError('Authentication required', 401));
  if (!boardId) return next(new ApiError('Board ID is required', 400));

  const board = await Board.findById(boardId);
  if (!board) return next(new ApiError('Board not found', 404));
  if (String(board.owner) !== String(userId)) {
    return next(new ApiError('Not authorized to update this board', 403));
  }

  if (title !== undefined) board.name = String(title).trim();
  if (description !== undefined) board.description = String(description).trim();
  if (privacy !== undefined) {
    if (!ALLOWED_PRIVACY.has(privacy)) return next(new ApiError('Invalid privacy value', 400));
    board.privacy = privacy;
  }

  await board.save();
  return sendResponse(res, 200, 'success', 'Board updated', { board });
});


// DELETE /boards/:boardId
const deleteBoard = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user?.id;
  const { boardId } = req.params;

  if (!userId) return next(new ApiError('Authentication required', 401));
  if (!boardId) return next(new ApiError('Board ID is required', 400));

  const board = await Board.findById(boardId);
  if (!board) return next(new ApiError('Board not found', 404));
  if (String(board.owner) !== String(userId)) {
    return next(new ApiError('Not authorized to delete this board', 403));
  }

  const session = await Board.startSession();
  try {
    await session.withTransaction(async () => {
      await Board.deleteOne({ _id: boardId }).session(session);
      await User.updateOne(
        { _id: req.user._id },
        { $pull: { boards: boardId } }
      ).session(session);
    });
  } finally {
    session.endSession();
  }

  return sendResponse(res, 200, 'success', 'Board deleted', { boardId });
});

// POST /boards/:boardId/pins      
const addPinToBoard = asyncErrorHandler(async (req, res, next) => {
  const { boardId } = req.params;
  const { pinId } = req.body;
  const userId = req.user?.id;

  if (!userId) return next(new ApiError('Authentication required', 401));
  if (!boardId) return next(new ApiError('Board ID is required', 400));
  if (!pinId) return next(new ApiError('Pin ID is required', 400));

  const [board, pin] = await Promise.all([
    Board.findById(boardId),
    Pin.findById(pinId)
  ]);

  if (!board) return next(new ApiError('Board not found', 404));
  if (String(board.owner) !== String(userId)) {
    return next(new ApiError('Not authorized to modify this board', 403));
  }
  if (!pin) return next(new ApiError('Pin not found', 404));

  if (String(pin.owner) !== String(userId) && pin.privacy !== 'public') {
    return next(new ApiError('Not authorized to add this pin', 403));
  }

  const exists = board.pins.some(id => String(id) === String(pinId));
  if (exists) return next(new ApiError('Pin already in board', 409));
  await board.updateOne({ $push: { keywords: pin.keywords } });
  board.pins.push(pinId);
  await board.save();

  return sendResponse(res, 200, 'success', 'Pin added to board', { board });
});

// DELETE /boards/:boardId/pins/:pinId
const removePinFromBoard = asyncErrorHandler(async (req, res, next) => {
  const { boardId, pinId } = req.params;
  const userId = req.user?.id;

  if (!userId) return next(new ApiError('Authentication required', 401));
  if (!boardId) return next(new ApiError('Board ID is required', 400));
  if (!pinId) return next(new ApiError('Pin ID is required', 400));

  const board = await Board.findById(boardId);
  if (!board) return next(new ApiError('Board not found', 404));
  if (String(board.owner) !== String(userId)) {
    return next(new ApiError('Not authorized to modify this board', 403));
  }

  const before = board.pins.length;
  board.pins = board.pins.filter(id => String(id) !== String(pinId));
  const after = board.pins.length;

  if (before === after) return next(new ApiError('Pin not in board', 404));

  await board.save();
  return sendResponse(res, 200, 'success', 'Pin removed from board', { board });
});

module.exports = {
    createBoard,
    getBoard,
    getBoardsByUser,
    getPublicBoards,
    updateBoard,
    deleteBoard,
    addPinToBoard,
    removePinFromBoard
};
