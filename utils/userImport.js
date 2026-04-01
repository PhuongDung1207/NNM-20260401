let exceljs = require('exceljs')
let path = require('path')
let crypto = require('crypto')
let mongoose = require('mongoose')
let roleModel = require('../schemas/roles')
let userModel = require('../schemas/users')
let userController = require('../controllers/users')
let { ensureMailConfig, sendImportedUserPasswordMail } = require('./mailHandler')

function getCellValue(value) {
    if (value === null || value === undefined) {
        return ''
    }
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) {
            return value.richText.map(item => item.text).join('')
        }
        if (value.text) {
            return String(value.text)
        }
        if (value.result !== null && value.result !== undefined) {
            return String(value.result)
        }
        if (value.hyperlink) {
            return String(value.hyperlink)
        }
    }
    return String(value)
}

function normalizeText(value) {
    return getCellValue(value).trim()
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function pickRandomCharacter(source) {
    return source[crypto.randomInt(0, source.length)]
}

function shuffleCharacters(characters) {
    for (let index = characters.length - 1; index > 0; index--) {
        let randomIndex = crypto.randomInt(0, index + 1)
        let current = characters[index]
        characters[index] = characters[randomIndex]
        characters[randomIndex] = current
    }
    return characters
}

function generatePassword(length = 16) {
    let upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    let lower = 'abcdefghijkmnopqrstuvwxyz'
    let digits = '23456789'
    let specials = '!@#$%^&*'
    let allCharacters = upper + lower + digits + specials
    let password = [
        pickRandomCharacter(upper),
        pickRandomCharacter(lower),
        pickRandomCharacter(digits),
        pickRandomCharacter(specials)
    ]

    while (password.length < length) {
        password.push(pickRandomCharacter(allCharacters))
    }

    return shuffleCharacters(password).join('')
}

function buildHeaderMap(worksheet) {
    let headerMap = new Map()
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
        let header = normalizeText(cell.value).toLowerCase()
        if (header) {
            headerMap.set(header, columnNumber)
        }
    })
    return headerMap
}

async function importUsersFromExcelFile(filePath) {
    ensureMailConfig()

    let workbook = new exceljs.Workbook()
    let resolvedPath = path.resolve(filePath)
    await workbook.xlsx.readFile(resolvedPath)

    let worksheet = workbook.worksheets[0]
    if (!worksheet) {
        throw new Error('File Excel khong co worksheet nao')
    }

    let headerMap = buildHeaderMap(worksheet)
    let usernameColumn = headerMap.get('username')
    let emailColumn = headerMap.get('email')

    if (!usernameColumn || !emailColumn) {
        throw new Error('File Excel phai co 2 cot username va email')
    }

    let userRole = await roleModel.findOne({
        isDeleted: false,
        name: { $regex: /^user$/i }
    })

    if (!userRole) {
        throw new Error("Khong tim thay role 'user' trong database")
    }

    let existingUsers = await userModel.find({}, 'username email').lean()
    let existingUsernames = new Set(
        existingUsers
            .map(user => normalizeText(user.username).toLowerCase())
            .filter(Boolean)
    )
    let existingEmails = new Set(
        existingUsers
            .map(user => normalizeText(user.email).toLowerCase())
            .filter(Boolean)
    )
    let usernamesInFile = new Set()
    let emailsInFile = new Set()
    let results = []

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
        let row = worksheet.getRow(rowIndex)
        let username = normalizeText(row.getCell(usernameColumn).value)
        let email = normalizeText(row.getCell(emailColumn).value).toLowerCase()

        if (!username && !email) {
            continue
        }

        let errors = []
        let usernameKey = username.toLowerCase()
        let emailKey = email.toLowerCase()

        if (!username) {
            errors.push('username khong duoc de trong')
        }
        if (!email) {
            errors.push('email khong duoc de trong')
        } else if (!isValidEmail(email)) {
            errors.push('email khong hop le')
        }
        if (username && usernamesInFile.has(usernameKey)) {
            errors.push('username bi trung trong file import')
        }
        if (email && emailsInFile.has(emailKey)) {
            errors.push('email bi trung trong file import')
        }
        if (username && existingUsernames.has(usernameKey)) {
            errors.push('username da ton tai trong he thong')
        }
        if (email && existingEmails.has(emailKey)) {
            errors.push('email da ton tai trong he thong')
        }

        if (username) {
            usernamesInFile.add(usernameKey)
        }
        if (email) {
            emailsInFile.add(emailKey)
        }

        if (errors.length > 0) {
            results.push({
                row: rowIndex,
                username: username,
                email: email,
                status: 'failed',
                errors: errors
            })
            continue
        }

        let password = generatePassword(16)
        let session = await mongoose.startSession()
        session.startTransaction()

        try {
            await userController.CreateUser({
                username: username,
                password: password,
                email: email,
                role: userRole._id,
                status: true
            }, session)

            let mailInfo = await sendImportedUserPasswordMail({
                to: email,
                username: username,
                password: password
            })

            await session.commitTransaction()
            existingUsernames.add(usernameKey)
            existingEmails.add(emailKey)

            results.push({
                row: rowIndex,
                username: username,
                email: email,
                role: userRole.name,
                status: 'created',
                passwordSent: true,
                messageId: mailInfo.messageId,
                response: mailInfo.response,
                accepted: mailInfo.accepted
            })
        } catch (error) {
            await session.abortTransaction()
            results.push({
                row: rowIndex,
                username: username,
                email: email,
                status: 'failed',
                errors: [error.message]
            })
        } finally {
            await session.endSession()
        }
    }

    let successCount = results.filter(item => item.status === 'created').length
    let failureCount = results.filter(item => item.status === 'failed').length

    return {
        filePath: resolvedPath,
        totalRows: results.length,
        successCount: successCount,
        failureCount: failureCount,
        results: results
    }
}

module.exports = {
    importUsersFromExcelFile
}
