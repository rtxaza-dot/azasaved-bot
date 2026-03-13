import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import fs from "fs"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155

// EXPRESS (нужно для Railway)
const app = express()
app.get("/", (req, res) => res.send("AZA TikTok Bot running 🚀"))
app.listen(PORT, () => console.log("Server started", PORT))

// TELEGRAM
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("Bot started")

// FILE DATABASE
const DB_FILE = "./users.json"

let users = {}

if (fs.existsSync(DB_FILE)) {
    users = JSON.parse(fs.readFileSync(DB_FILE))
}

function saveUsers() {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2))
}

// CACHE
const cache = new Map()

// FORMAT NUMBERS
function formatCount(num) {
    if (!num) return "0"
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
    if (num >= 1000) return (num / 1000).toFixed(1) + "K"
    return num.toString()
}

// SAVE DOWNLOAD
function addDownload(user) {

    const id = user.id
    const name = user.username ? `@${user.username}` : user.first_name

    if (!users[id]) {
        users[id] = {
            name,
            downloads: 1
        }
    } else {
        users[id].downloads++
        users[id].name = name
    }

    saveUsers()
}

// START
bot.onText(/\/start/, (msg) => {

    const keyboard = [
        ["🏆 Топ скачивателей", "📊 Статистика"],
        ["👥 Пригласить друзей"]
    ]

    if (msg.from.id === ADMIN_ID) {
        keyboard.push(["⚙️ Админ панель"])
    }

    bot.sendMessage(
        msg.chat.id,
        `🚀 Привет, ${msg.from.first_name}!

Отправьте ссылку TikTok и бот скачает видео в HD без водяного знака.`,
        {
            reply_markup: {
                keyboard,
                resize_keyboard: true
            }
        }
    )

})

// MESSAGE
bot.on("message", async (msg) => {

    const chatId = msg.chat.id
    const text = msg.text
    const userId = msg.from.id

    if (!text || text.startsWith("/")) return

    // СТАТИСТИКА
    if (text === "📊 Статистика") {

        let total = 0

        Object.values(users).forEach(u => {
            total += u.downloads
        })

        bot.sendMessage(
            chatId,
            `📊 Статистика

👤 Пользователей: ${Object.keys(users).length}
📥 Всего скачано видео: ${total}`
        )

        return
    }

    // ТОП
    if (text === "🏆 Топ скачивателей") {

        const top = Object.values(users)
            .sort((a, b) => b.downloads - a.downloads)
            .slice(0, 10)

        let message = "🏆 Топ скачивателей\n\n"

        top.forEach((u, i) => {
            message += `${i + 1}️⃣ ${u.name} — ${u.downloads} видео\n`
        })

        bot.sendMessage(chatId, message)

        return
    }

    // ПРИГЛАСИТЬ
    if (text === "👥 Пригласить друзей") {

        bot.sendMessage(
            chatId,
            `👥 Ваша ссылка приглашения:

https://t.me/${BOT_USERNAME}?start=${userId}`
        )

        return
    }

    // АДМИН
    if (text === "⚙️ Админ панель" && userId === ADMIN_ID) {

        bot.sendMessage(
            chatId,
            `⚙️ Админ панель

Для рассылки используйте:

рассылка: текст`
        )

        return
    }

    // РАССЫЛКА
    if (text.startsWith("рассылка:") && userId === ADMIN_ID) {

        const message = text.replace("рассылка:", "").trim()

        let sent = 0

        for (const id of Object.keys(users)) {

            try {
                await bot.sendMessage(id, message)
                sent++
            } catch {}

        }

        bot.sendMessage(chatId, `✅ Отправлено ${sent} пользователям`)

        return
    }

    // TIKTOK LINK
    const links = text.match(/https?:\/\/(vm\.|vt\.|www\.)?tiktok\.com\/[^\s]+/g)

    if (!links) return

    if (links.length > 5) {
        bot.sendMessage(chatId, "❌ Максимум 5 ссылок за раз.")
        return
    }

    for (const link of links) {

        const loading = await bot.sendMessage(chatId, "⏳ Загружаю TikTok...")

        try {

            if (cache.has(link)) {

                await bot.deleteMessage(chatId, loading.message_id)

                bot.sendVideo(chatId, cache.get(link), {
                    caption: "🎬 Видео из TikTok\n\n⬇️ Скачано через @" + BOT_USERNAME
                })

                addDownload(msg.from)

                continue
            }

            const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`)
            const data = await res.json()

            await bot.deleteMessage(chatId, loading.message_id)

            if (!data?.data) {

                bot.sendMessage(chatId, "❌ Не удалось скачать видео.")
                continue
            }

            const video = data.data.hdplay || data.data.play

            const caption =
`🎬 Видео из TikTok

👁 ${formatCount(data.data.play_count)}
❤️ ${formatCount(data.data.digg_count)}

⬇️ Скачано через @${BOT_USERNAME}`

            await bot.sendVideo(chatId, video, { caption })

            cache.set(link, video)

            addDownload(msg.from)

        } catch (e) {

            bot.sendMessage(chatId, "❌ Ошибка загрузки.")

        }

    }

})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
