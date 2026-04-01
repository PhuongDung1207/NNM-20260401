let express = require("express");
let router = express.Router();
let mongoose = require("mongoose");
let messageModel = require("../schemas/messages");
let userModel = require("../schemas/users");
let { CheckLogin } = require("../utils/authHandler");

const USER_SELECT = "_id username fullName avatarUrl";

function normalizeMessageContent(body) {
  if (body.messageContent && typeof body.messageContent === "object") {
    return body.messageContent;
  }

  return {
    type: body.type,
    text: body.text
  };
}

router.get("/", CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = new mongoose.Types.ObjectId(req.user._id);

    // Group by the other user in each conversation, then keep only the newest message.
    let conversations = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: currentUserId }, { to: currentUserId }]
        }
      },
      {
        $addFields: {
          conversationUserId: {
            $cond: [{ $eq: ["$from", currentUserId] }, "$to", "$from"]
          }
        }
      },
      {
        $sort: {
          createdAt: -1,
          _id: -1
        }
      },
      {
        $group: {
          _id: "$conversationUserId",
          lastMessage: {
            $first: "$$ROOT"
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $match: {
          "user.isDeleted": false
        }
      },
      {
        $project: {
          _id: 0,
          user: {
            _id: "$user._id",
            username: "$user.username",
            fullName: "$user.fullName",
            avatarUrl: "$user.avatarUrl"
          },
          lastMessage: {
            _id: "$lastMessage._id",
            from: "$lastMessage.from",
            to: "$lastMessage.to",
            messageContent: "$lastMessage.messageContent",
            createdAt: "$lastMessage.createdAt",
            updatedAt: "$lastMessage.updatedAt"
          }
        }
      },
      {
        $sort: {
          "lastMessage.createdAt": -1,
          "lastMessage._id": -1
        }
      }
    ]);

    conversations = await messageModel.populate(conversations, [
      {
        path: "lastMessage.from",
        model: "user",
        select: USER_SELECT
      },
      {
        path: "lastMessage.to",
        model: "user",
        select: USER_SELECT
      }
    ]);

    res.send(conversations);
  } catch (error) {
    res.status(400).send({
      message: error.message
    });
  }
});

router.post("/", CheckLogin, async function (req, res, next) {
  try {
    let to = req.body.to;
    let messageContent = normalizeMessageContent(req.body);

    if (!mongoose.isValidObjectId(to)) {
      res.status(400).send({
        message: "to phai la userID hop le"
      });
      return;
    }

    if (
      !messageContent ||
      !["file", "text"].includes(messageContent.type) ||
      typeof messageContent.text !== "string" ||
      !messageContent.text.trim()
    ) {
      res.status(400).send({
        message: "messageContent khong hop le"
      });
      return;
    }

    let receiver = await userModel.findOne({
      _id: to,
      isDeleted: false
    });

    if (!receiver) {
      res.status(404).send({
        message: "user nhan khong ton tai"
      });
      return;
    }

    let newMessage = new messageModel({
      from: req.user._id,
      to: to,
      messageContent: {
        type: messageContent.type,
        text: messageContent.text.trim()
      }
    });

    await newMessage.save();

    let result = await messageModel
      .findById(newMessage._id)
      .populate("from", USER_SELECT)
      .populate("to", USER_SELECT);

    res.status(201).send(result);
  } catch (error) {
    res.status(400).send({
      message: error.message
    });
  }
});

router.get("/:userID", CheckLogin, async function (req, res, next) {
  try {
    let currentUserId = req.user._id;
    let otherUserId = req.params.userID;

    if (!mongoose.isValidObjectId(otherUserId)) {
      res.status(400).send({
        message: "userID khong hop le"
      });
      return;
    }

    let user = await userModel.findOne({
      _id: otherUserId,
      isDeleted: false
    });

    if (!user) {
      res.status(404).send({
        message: "user khong ton tai"
      });
      return;
    }

    let messages = await messageModel
      .find({
        $or: [
          {
            from: currentUserId,
            to: otherUserId
          },
          {
            from: otherUserId,
            to: currentUserId
          }
        ]
      })
      .sort({
        createdAt: 1,
        _id: 1
      })
      .populate("from", USER_SELECT)
      .populate("to", USER_SELECT);

    res.send(messages);
  } catch (error) {
    res.status(400).send({
      message: error.message
    });
  }
});

module.exports = router;
