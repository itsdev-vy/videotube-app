import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from '../utils/ApiError.js';
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, error.message);
    }
}

const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, username, password } = req.body;

    if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({ $or: [{ email }, { username }] });

    if (existedUser) {
        throw new ApiError(409, "User already exists");
    }

    const avatarLocalPath = req?.files?.avatar[0]?.path;
    // const coverImageLocalPath = req?.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);


    if (!avatar) {
        throw new ApiError(400, "Avatar upload failed");
    }

    const user = await User.create({
        fullName,
        email,
        password,
        username: username.toLowerCase(),
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");
    //.select and -password -refreshToken is used to remove the password and refreshToken from the response

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user");
    }

    // return res.status(201).json({ user: createdUser }); will use below function as we had already created to send in a structure.
    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully",
        )
    );

});

const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;

    if (!username && !email) {
        throw new ApiError(400, "username or email is required");
    }

    const user = await User.findOne({ $or: [{ email }, { username }] });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (!user.isPasswordMatched(password)) {
        throw new ApiError(401, "Invalid credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .cookie("refreshToken", refreshToken, options)
        .cookie("accessToken", accessToken, options)
        .json(
            new ApiResponse(
                200,
                { user: loggedInUser, accessToken, refreshToken },
                "User logged in successfully",
            )
        )

});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, {
        $unset: { refreshToken: 1 },
    }, { new: true });

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res
        .status(200)
        .clearCookie("refreshToken", options)
        .clearCookie("accessToken", options)
        .json(
            new ApiResponse(
                200,
                {},
                "User logged out successfully",
            )
        )

});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const { incomingRefreshToken } = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized");
    }
    try {
        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decoded._id).select("-password -incomingRefreshToken");

        if (!user) {
            throw new ApiError(401, "Unauthorized");
        }

        if (incomingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Unauthorized");
        }

        const options = {
            httpOnly: true,
            secure: true,
        }

        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id);

        return res
            .status(200)
            .cookie("refreshToken", newRefreshToken, options)
            .cookie("accessToken", accessToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed successfully",
                )
            )

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (!user.isPasswordMatched(currentPassword)) {
        throw new ApiError(400, "Current password is incorrect");
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });
    const updatedUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Password changed successfully",
        )
    );
});

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select("-password -refreshToken");
    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "User fetched successfully",
        )
    );
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body;

    if (!fullName || !email) {
        throw new ApiError(400, "fullName and email are required");
    }

    const user = await User.findByIdAndUpdate(req.user._id, { $set: { fullName, email } }, { new: true }).select("-password");

    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "Account details updated successfully",
        )
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(500, "Failed to upload avatar");
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: { avatar: avatar.url } }, { new: true }).select("-password");
    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Avatar updated successfully",
        )
    );
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(500, "Failed to upload cover image");
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: { coverImage: coverImage.url } }, { new: true }).select("-password");
    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Cover image updated successfully",
        )
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const username = req?.params?.username;

    if (!username?.trim()) {
        throw new ApiError(400, "Username is required");
    }

    const channel = await User.aggregate([
        { $match: { username: username?.toLowerCase() } },
        { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribers" } },
        { $lookup: { from: "subscriptions", localField: "_id", foreignField: "subscriber", as: "subscribedTo" } },
        {
            $addFields:
            {
                subscribersCount: { $size: "$subscribers" },
                channelSubscribedToCount: { $size: "$subscribedTo" },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            }
        }
    ]);

    if (!channel?.length) {
        throw new ApiError(404, "Channel not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            channel[0],
            "User fetched successfully",
        )
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        // { $match: { _id: req.user._id } }, This will not work  because here we are getting id with string not with object with string id. Moongoose will not work with string id.
        { $match: { _id: new mongoose.Types.ObjectId(req.user._id) } },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                { $project: { avatar: 1, username: 1, fullName: 1 } }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: { $first: "$owner" }
                        }
                    }
                ]
            }
        },
    ])

    return res.status(200).json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully",
        )
    );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};