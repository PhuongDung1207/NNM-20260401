const nodemailer = require("nodemailer");

const mailtrapConfig = {
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false,
    auth: {
        user: process.env.MAILTRAP_USER || process.env.SMTP_USER || "",
        pass: process.env.MAILTRAP_PASS || process.env.SMTP_PASS || "",
    },
};

const transporter = nodemailer.createTransport({
    host: mailtrapConfig.host,
    port: mailtrapConfig.port,
    secure: mailtrapConfig.secure,
    auth: mailtrapConfig.auth,
});

function ensureMailConfig() {
    if (!mailtrapConfig.auth.user || !mailtrapConfig.auth.pass) {
        throw new Error("Mailtrap chua duoc cau hinh. Hay set MAILTRAP_USER va MAILTRAP_PASS");
    }
}

module.exports = {
    ensureMailConfig: ensureMailConfig,
    sendMail: async (to,url) => {
        ensureMailConfig();
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@haha.com',
            to: to,
            subject: "RESET PASSWORD REQUEST",
            text: "lick vo day de doi pass", // Plain-text version of the message
            html: "lick vo <a href="+url+">day</a> de doi pass", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
        return info;
    },
    sendImportedUserPasswordMail: async ({ to, username, password }) => {
        ensureMailConfig();
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@haha.com',
            to: to,
            subject: "THONG TIN TAI KHOAN MOI",
            text: `Xin chao ${username}, tai khoan cua ban da duoc tao. Mat khau tam thoi: ${password}`,
            html: `<p>Xin chao <strong>${username}</strong>,</p><p>Tai khoan cua ban da duoc tao thanh cong.</p><p>Mat khau tam thoi: <strong>${password}</strong></p><p>Ban nen doi mat khau sau khi dang nhap.</p>`,
        });

        console.log("Imported user password mail sent:", info.messageId);
        return info;
    }
}
