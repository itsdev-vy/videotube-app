import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from '../utils/ApiError.js';
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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
        $set: { refreshToken: null },
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

export { registerUser, loginUser, logoutUser, refreshAccessToken };