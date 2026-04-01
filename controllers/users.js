let userModel = require('../schemas/users')

function isMongoSession(session) {
    return Boolean(
        session &&
        typeof session === 'object' &&
        typeof session.startTransaction === 'function' &&
        typeof session.endSession === 'function'
    )
}

async function createUser(data, session) {
    let newItem = new userModel({
        username: data.username,
        password: data.password,
        email: data.email,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl,
        status: data.status,
        role: data.role,
        loginCount: data.loginCount
    });
    let saveOptions = session ? { session } : undefined;
    await newItem.save(saveOptions);
    return newItem;
}

module.exports = {
    CreateAnUser: async function (username, password, email, role, session,
        fullName, avatarUrl, status, loginCount) {
        let currentSession = session
        let currentFullName = fullName
        let currentAvatarUrl = avatarUrl
        let currentStatus = status
        let currentLoginCount = loginCount

        if (!isMongoSession(session)) {
            currentSession = null
            currentFullName = session
            currentAvatarUrl = fullName
            currentStatus = avatarUrl
            currentLoginCount = status
        }

        return await createUser({
            username: username,
            password: password,
            email: email,
            fullName: currentFullName,
            avatarUrl: currentAvatarUrl,
            status: currentStatus,
            role: role,
            loginCount: currentLoginCount
        }, currentSession);
    },
    CreateUser: async function (data, session) {
        return await createUser(data, session);
    },
    GetAnUserByUsername: async function (username) {
        return await userModel.findOne({
            isDeleted: false,
            username: username
        })
    }, GetAnUserById: async function (id) {
        return await userModel.findOne({
            isDeleted: false,
            _id: id
        }).populate('role')
    }, GetAnUserByEmail: async function (email) {
        return await userModel.findOne({
            isDeleted: false,
            email: email
        })
    }, GetAnUserByToken: async function (token) {
        let user = await userModel.findOne({
            isDeleted: false,
            forgotPasswordToken: token
        })
        if (user.forgotPasswordTokenExp > Date.now()) {
            return user;
        }
        return false;
    }
}
