let mongoose = require('mongoose')
let path = require('path')
let { importUsersFromExcelFile } = require('../utils/userImport')

async function main() {
    let filePath = process.argv[2]
    if (!filePath) {
        throw new Error('Vui long truyen duong dan file Excel can import')
    }

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/NNPTUD-C4')
    let result = await importUsersFromExcelFile(path.resolve(filePath))
    console.log(JSON.stringify(result, null, 2))
    await mongoose.disconnect()
}

main().catch(async function (error) {
    console.error(error.message)
    try {
        await mongoose.disconnect()
    } catch (disconnectError) {
        console.error(disconnectError.message)
    }
    process.exit(1)
})
