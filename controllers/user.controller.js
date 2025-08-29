const logger = require("../utils/logger");
const sendResponse = require("../utils/sendResponse");
const ApiError = require("../utils/ApiError");
const asyncErrorHandler = require("../utils/asyncErrorHandler");
const User = require("../models/users.model");
const mongoose = require("mongoose");

const getProfile = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const user = await User.findById(userId)

  if (!user) {
    return next(new ApiError("User not found", 404));
  }

  return sendResponse(res, 200, "success", "User profile retrieved successfully", {
    user: { 
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      birthdate: user.birthdate,
      followers: user.followers,
      following: user.following,
      boards: user.boards,
      pins: user.pins,
      bookmarks: user.bookmarks,
      likedPins: user.likedPins,
      savedSearches: user.savedSearches,
      role: user.role.name, 
    },
  });
});

const updateProfile = asyncErrorHandler(async (req, res, next) => {
const userId = req.user.id;
if(!userId){
  return next(new ApiError("User not found", 404));
}
  const body = req.body ?? {};

const allowed = ["firstName", "lastName", "username", "bio", "birthdate" , "gender"];

 const updates = Object.fromEntries(
    allowed
      .filter((k) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined)
      .map((k) => [k, body[k]])
  );

  if (Object.keys(updates).length === 0) {
    return next(new ApiError("No fields to update", 400));
  }
  //year-month-day format
  if (updates.birthdate) {
    const birthdate = new Date(updates.birthdate);
    if (isNaN(birthdate.getTime())) {
      return next(new ApiError("Invalid birthdate format", 400));
    }
    updates.birthdate = birthdate;
  }
  if(updates.gender){
    if(!["male", "female"].includes(updates.gender)){
      return next(new ApiError("Invalid gender value", 400));
    }
  }

const user = await User.findByIdAndUpdate(
  userId,
  { $set: updates },
  {
    new: true,              
  }
);
logger.info('User profile updated successfully', { userId, updates });
sendResponse(res, 200, "success", "User profile updated successfully", {
  user: {
    id: user._id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    role: user.role,
  },
});
});

const addFollow = asyncErrorHandler(async(req,res,next)=>{
  const userId = req.user.id;
  const followUserId = req.params.id;

  if (userId === followUserId) {
    return next(new ApiError("You cannot follow yourself", 400));
  }

 const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const followUser = await User.findById(followUserId)
        .select("_id username avatar firstName lastName bio birthdate role followers following boards pins bookmarks likedPins")
        .session(session);

      if (!followUser) {
        throw new ApiError("User not found", 404);
      }

      
      const [u1, u2] = await Promise.all([
        User.updateOne(
          { _id: userId },
          { $addToSet: { following: followUser._id } },
          { session }
        ),
        User.updateOne(
          { _id: followUser._id },
          { $addToSet: { followers: userId } },
          { session }
        ),
      ]);

      
      if (u1.modifiedCount === 0 && u2.modifiedCount === 0) {
        throw new ApiError("You are already following this user", 409);
      }

      
      const updatedTarget = await User.findById(followUser._id)
        .select("_id username avatar firstName lastName bio birthdate role followers following boards pins bookmarks likedPins")
        .lean()
        .session(session);

      sendResponse(res, 200, "success", "User followed successfully", {
        user: {
          id: updatedTarget._id,
          username: updatedTarget.username,
          avatar: updatedTarget.avatar,
          firstName: updatedTarget.firstName,
          lastName: updatedTarget.lastName,
          bio: updatedTarget.bio,
          birthdate: updatedTarget.birthdate,
          followers: updatedTarget.followers?.length ?? 0,
          following: updatedTarget.following?.length ?? 0,
          boards: updatedTarget.boards?.length ?? 0,
          pins: updatedTarget.pins?.length ?? 0,
          bookmarks: updatedTarget.bookmarks?.length ?? 0,
          likedPins: updatedTarget.likedPins?.length ?? 0,
          role: typeof updatedTarget.role === "object" && updatedTarget.role?.name
            ? updatedTarget.role.name
            : updatedTarget.role, 
        },
      });
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError("Failed to follow user", 500));
  } finally {
    session.endSession();
  }
});


const removeFollow = asyncErrorHandler(async(req,res,next)=>{
  const userId = req.user.id;
  const unfollowUserId = req.params.id;

  if (userId === unfollowUserId) {
    return next(new ApiError("You cannot unfollow yourself", 400));
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const target = await User.findById(unfollowUserId)
        .select("_id username avatar firstName lastName bio birthdate role followers following boards pins bookmarks likedPins")
        .session(session);

      if (!target) {
        throw new ApiError("User not found", 404);
      }

      const [u1, u2] = await Promise.all([
        User.updateOne(
          { _id: userId },
          { $pull: { following: target._id } },
          { session }
        ),
        User.updateOne(
          { _id: target._id },
          { $pull: { followers: userId } },
          { session }
        ),
      ]);

     
      if (u1.modifiedCount === 0 && u2.modifiedCount === 0) {
        throw new ApiError("You are not following this user", 409);
      }

      const updatedTarget = await User.findById(target._id)
        .select("_id username avatar firstName lastName bio birthdate role followers following boards pins bookmarks likedPins")
        .lean()
        .session(session);

      sendResponse(res, 200, "success", "User unfollowed successfully", {
        user: {
          id: updatedTarget._id,
          username: updatedTarget.username,
          avatar: updatedTarget.avatar,
          firstName: updatedTarget.firstName,
          lastName: updatedTarget.lastName,
          bio: updatedTarget.bio,
          birthdate: updatedTarget.birthdate,
          followers: updatedTarget.followers?.length ?? 0,
          following: updatedTarget.following?.length ?? 0,
          boards: updatedTarget.boards?.length ?? 0,
          pins: updatedTarget.pins?.length ?? 0,
          bookmarks: updatedTarget.bookmarks?.length ?? 0,
          likedPins: updatedTarget.likedPins?.length ?? 0,
          role: typeof updatedTarget.role === "object" && updatedTarget.role?.name
            ? updatedTarget.role.name
            : updatedTarget.role,
        },
      });
    });
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError("Failed to unfollow user", 500));
  } finally {
    session.endSession();
  }
});

const getFollowers = asyncErrorHandler(async (req, res, next) => {
  const userId = req.user.id;
  const user = await User.findById(userId)
    .select("followers")
    .populate("followers", "_id username avatar firstName lastName bio birthdate role")
    .lean();
  if (!user) {
    return next(new ApiError("User not found", 404));
  }
  sendResponse(res, 200, "success", "Followers retrieved successfully", {
    followers: user.followers,
  });
});

module.exports = {
  getProfile,
  updateProfile,
  addFollow,
  removeFollow,
  getFollowers,
}
