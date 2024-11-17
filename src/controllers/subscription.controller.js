import mongoose, { isValidObjectId } from "mongoose"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params
    // TODO: toggle subscription

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channelId");
    }

    const user = await User.findById(req.user._id);
    const channel = await User.findById(channelId);

    if (!user) {
        throw new ApiError(404, "User not found");
    }
    if (!channel) {
        throw new ApiError(404, "Channel not found");
    }

    const subscription = await Subscription.findOne({
        subscriber: user,
        channel: channelId
    });

    if (subscription) {
        await Subscription.findByIdAndDelete(subscription._id);
        return res
            .status(200)
            .json(new ApiResponse(200, { isSubscribed: false }));
    }

    await Subscription.create({ subscriber: user, channel: channelId });
    return res
        .status(200)
        .json(new ApiResponse(200, { isSubscribed: true }));
})

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const { channelId } = req.params

    if (!isValidObjectId(channelId)) {
        throw new ApiError(400, "Invalid channelId");
    }

    const subscribersList = await Subscription.aggregate([
        {
            $match: {
                channel: new mongoose.Types.ObjectId(channelId),
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
            },
        },
    ])

    if (!subscribersList) {
        throw new ApiError(404, "No subscribers found");
    }

    return res.status(200).json(new ApiResponse(200, subscribersList, "Subscribers fetched successfully"));
})

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params

    if (!isValidObjectId(subscriberId)) {
        throw new ApiError(400, "Invalid subscriberId");
    }

    const subscribedChannels = await Subscription.aggregate([
        {
            $match: {
                subscriber: new mongoose.Types.ObjectId(subscriberId),
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "channel",
            },
        },
    ])

    if (!subscribedChannels) {
        throw new ApiError(404, "No channels found");
    }

    return res.status(200).json(new ApiResponse(200, subscribedChannels, "Channels fetched successfully"));
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}