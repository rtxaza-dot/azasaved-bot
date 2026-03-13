import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155 // Твой ID установлен ✅

// EXPRESS
const app = express()
app.get("/", (req, res) => res.send("AZASAVED BOT RUNNING 🚀"))
app.listen(PORT, () => console.log("Server running", PORT))

// TELEGRAM
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("BOT STARTED")

// DATABASE
const users = new Map()
const referrals = new Map()

// FORMAT NUMBERS
function formatCount(num) {
    if (!num) return "0"
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
    if (num >= 1000) return (num / 1000).toFixed(1) + "K"
    return num.toString()
}

// SAVE USER
function addDownload(userId, username, firstName) {
    const name = username ? `@${username}` : firstName || "Unknown"
    if (!users.has(userId)) {
        users.set(userId, { name, downloads: 1 })
    } else {
        const u = users.get(userId)
        u.downloads++
        u.name = name
        users.set(userId, u)
    }
}

// START
bot.onText(/\/start$/, (msg) => {
    const buttons = [
        ["📥 Скачать видео"],
        ["🏆 Топ скачивателей", "📊 Статистика"],
        ["👥 Пригласить друзей", "📢 Канал"]
    ]
    if (msg.from.id === ADMIN_ID) buttons.push(["⚙️ Админ Панель"])

    bot.sendMessage(msg.chat.id, `🚀 Привет, ${msg.from.first_name}!\nОтправь ссылку TikTok для скачивания.`, {
        reply_markup: { keyboard: buttons, resize_keyboard: true }
    })
})

// MESSAGE HANDLER
bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text
    const userId = msg.from.id

    if (!text || text.startsWith("/")) return

    // АДМИН ПАНЕЛЬ
    if (text === "⚙️ Админ Панель" && userId === ADMIN_ID) {
        let userList = "📋 *СПИСОК ПОЛЬЗОВАТЕЛЕЙ:*\n\n"
        users.forEach((data, id) => {
            userList += `• \`${id}\` | ${data.name} | 📥: ${data.downloads}\n`
        })
        const finalMsg = users.size > 0 ? userList : "Пользователей пока нет."
        bot.sendMessage(chatId, finalMsg.slice(0, 4000) + "\n\n📢 *Для рассылки напишите:* \n`рассылка: текст сообщения`", { parse_mode: "Markdown" })
        return
    }

    // ЛОГИКА РАССЫЛКИ
    if (text.startsWith("рассылка:") && userId === ADMIN_ID) {
        const broadcastMsg = text.replace("рассылка:", "").trim()
        let count = 0
        users.forEach((data, id) => {
            bot.sendMessage(id, broadcastMsg).catch(() => {})
            count++
        })
        return bot.sendMessage(chatId, `✅ Рассылка завершена! Отправлено ${count} пользователям.`)
    }

    // КНОПКИ МЕНЮ
    if (text === "📊 Статистика") {
        let total = 0
        users.forEach(u => total += u.downloads)
        return bot.sendMessage(chatId, `📊 *Статистика*\n\n👤 Юзеров: ${users.size}\n📥 Всего скачиваний: ${total}`, { parse_mode: "Markdown" })
    }

    if (text === "🏆 Топ скачивателей") {
        const top = [...users.values()].sort((a, b) => b.downloads - a.downloads).slice(0, 10)
        let msgTop = "🏆 *ТОП ЮЗЕРОВ*\n\n"
        top.forEach((u, i) => msgTop += `${i + 1}️⃣ ${u.name} — ${u.downloads} видео\n`)
        return bot.sendMessage(chatId, msgTop, { parse_mode: "Markdown" })
    }

    if (text === "👥 Пригласить друзей") {
        return bot.sendMessage(chatId, `👥 Ссылка:\nhttps://t.me/${BOT_USERNAME}?start=${userId}`)
    }

    if (text === "📥 Скачать видео") return bot.sendMessage(chatId, "Жду ссылку TikTok...")

    // СКАНЕР TIKTOK
    const links = text.match(/https?:\/\/(?:vm\.|www\.|vt\.)?tiktok\.com\/[^\s]+/g)
    if (!links) return

    for (const link of links) {
        const progress = await bot.sendMessage(chatId, "⏳ Обработка...")
        try {
            const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`)
            const data = await res.json()
            await bot.deleteMessage(chatId, progress.message_id).catch(() => {})

            if (data?.data) {
                const stats = `👁 ${formatCount(data.data.play_count)} | ❤️ ${formatCount(data.data.digg_count)}`
                const caption = `🎬 TikTok HD | AZA Technology\n\n${stats}`

                if (data.data.images) {
                    for (let i = 0; i < data.data.images.length; i += 10) {
                        const chunk = data.data.images.slice(i, i + 10)
                        const media = chunk.map((img, idx) => ({
                            type: "photo", media: img, caption: (i === 0 && idx === 0) ? caption : ""
                        }))
                        await bot.sendMediaGroup(chatId, media)
                    }
                } else {
                    await bot.sendVideo(chatId, data.data.hdplay || data.data.play, { caption })
                }
                addDownload(userId, msg.from.username, msg.from.first_name)
            }
        } catch (e) {
            bot.sendMessage(chatId, "❌ Ошибка загрузки.")
        }
    }
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
