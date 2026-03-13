import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080
const BOT_USERNAME = "AZASAVED_bot"

// EXPRESS
const app = express()
app.get("/", (req, res) => res.send("AZASAVED BOT RUNNING 🚀"))
app.listen(PORT, () => console.log("Server running on port", PORT))

// TELEGRAM
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("BOT STARTED")

// DATABASE (В продакшене лучше использовать MongoDB/PostgreSQL)
const users = new Map()
const referrals = new Map()
const cache = new Map()

// QUEUE SYSTEM
const queue = []
let working = false

async function processQueue() {
    if (working || queue.length === 0) return
    working = true

    while (queue.length > 0) {
        const job = queue.shift()
        try {
            await job()
        } catch (err) {
            console.error("Queue Job Error:", err)
        }
    }
    working = false
}

// CACHE LOGIC
function setCache(key, value) {
    cache.set(key, {
        value,
        expire: Date.now() + 1000 * 60 * 60 // 1 час
    })
}

function getCache(key) {
    const data = cache.get(key)
    if (!data) return null
    if (Date.now() > data.expire) {
        cache.delete(key)
        return null
    }
    return data.value
}

// DOWNLOAD COUNT
function addDownload(userId, username) {
    const userData = users.get(userId) || { username: username || "unknown", downloads: 0 }
    userData.downloads++
    users.set(userId, userData)
}

// REF START (Исправлено регулярное выражение)
bot.onText(/\/start (.+)/, (msg, match) => {
    const refId = parseInt(match[1])
    const userId = msg.from.id

    if (refId && refId !== userId) {
        const currentRefs = referrals.get(refId) || 0
        referrals.set(refId, currentRefs + 1)
    }
})

// START COMMAND
bot.onText(/\/start$/, (msg) => {
    const name = msg.from.first_name || "друг"
    bot.sendMessage(msg.chat.id,
        `🚀 Добро пожаловать, ${name}\n\n🔥 Скачивай TikTok без водяного знака\n\nПросто отправь ссылку`,
        {
            reply_markup: {
                keyboard: [
                    ["📥 Скачать видео"],
                    ["🏆 Топ скачивателей", "📊 Статистика"],
                    ["👥 Пригласить друзей", "📢 Канал"]
                ],
                resize_keyboard: true
            }
        })
})

// MESSAGE HANDLER
bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text
    const userId = msg.from.id
    const username = msg.from.username || msg.from.first_name

    if (!text || text.startsWith("/")) return // Игнорируем команды

    // BUTTONS
    if (text === "📥 Скачать видео") {
        return bot.sendMessage(chatId, "Отправь ссылку на TikTok видео")
    }

    if (text === "📢 Канал") {
        return bot.sendMessage(chatId, "https://t.me/AZATECHNOLOGY_FREE")
    }

    if (text === "👥 Пригласить друзей") {
        const link = `https://t.me/${BOT_USERNAME}?start=${userId}`
        const count = referrals.get(userId) || 0
        return bot.sendMessage(chatId, `👥 Твоя ссылка:\n${link}\n\nПриглашено: ${count}`)
    }

    if (text === "📊 Статистика") {
        let total = 0
        users.forEach(u => total += u.downloads)
        return bot.sendMessage(chatId, `📊 Статистика\n\n👤 Пользователей: ${users.size}\n📥 Скачиваний: ${total}`)
    }

    if (text === "🏆 Топ скачивателей") {
        const top = Array.from(users.values())
            .sort((a, b) => b.downloads - a.downloads)
            .slice(0, 10)

        let msgTop = "🏆 ТОП СКАЧИВАТЕЛЕЙ\n\n"
        top.forEach((u, i) => {
            msgTop += `${i + 1}️⃣ @${u.username} — ${u.downloads} видео\n`
        })
        return bot.sendMessage(chatId, top.length > 0 ? msgTop : "Список пуст")
    }

    // ПОИСК ССЫЛОК (Исправлено регулярное выражение)
    const links = text.match(/https?:\/\/(?:vm\.|www\.|vt\.)?tiktok\.com\/[^\s]+/g)

    if (!links) {
        // Если это не кнопка и не ссылка - игнорим или просим ссылку
        if (!["📥 Скачать видео", "📊 Статистика", "🏆 Топ скачивателей", "👥 Пригласить друзей", "📢 Канал"].includes(text)) {
            bot.sendMessage(chatId, "❌ Отправьте корректную ссылку на TikTok")
        }
        return
    }

    // ОБРАБОТКА ССЫЛОК
    for (const link of links) {
        queue.push(async () => {
            const progress = await bot.sendMessage(chatId, "⏳ Загрузка...")
            try {
                const cached = getCache(link)
                if (cached) {
                    await bot.deleteMessage(chatId, progress.message_id)
                    await bot.sendVideo(chatId, cached, { caption: "🎬 TikTok | AZA Technology" })
                    addDownload(userId, username)
                    return
                }

                const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
                const res = await fetch(api)
                const data = await res.json()

                await bot.deleteMessage(chatId, progress.message_id).catch(() => {})

                if (data?.data?.play) {
                    const videoUrl = data.data.play
                    setCache(link, videoUrl)

                    const stats = `👁 ${data.data.play_count} | ❤️ ${data.data.digg_count} | 💬 ${data.data.comment_count}`

                    await bot.sendVideo(chatId, videoUrl, {
                        caption: `🎬 TikTok | AZA Technology\n\n${stats}`
                    })
                    addDownload(userId, username)
                } else if (data?.data?.images) {
                    // Обработка фото-слайдов
                    const media = data.data.images.map((img, i) => ({
                        type: "photo",
                        media: img,
                        caption: i === 0 ? "🎬 TikTok | AZA Technology" : ""
                    }))
                    await bot.sendMediaGroup(chatId, media)
                    addDownload(userId, username)
                } else {
                    bot.sendMessage(chatId, "❌ Не удалось получить видео. Возможно, оно приватное.")
                }

            } catch (err) {
                console.error(err)
                bot.sendMessage(chatId, "❌ Ошибка при обработке ссылки.")
            }
        })
    }
    processQueue()
})

// GLOBAL ERRORS
process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
