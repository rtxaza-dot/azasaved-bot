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

// DATABASE (Данные сбросятся при перезагрузке сервера!)
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
        try { await job() } catch (err) { console.error("Queue Job Error:", err) }
    }
    working = false
}

// CACHE LOGIC
function setCache(key, value) {
    cache.set(key, { value, expire: Date.now() + 1000 * 60 * 60 })
}

function getCache(key) {
    const data = cache.get(key)
    if (!data) return null
    if (Date.now() > data.expire) { cache.delete(key); return null }
    return data.value
}

// DOWNLOAD COUNT
function addDownload(userId, username) {
    const userData = users.get(userId) || { username: username || "unknown", downloads: 0 }
    userData.downloads++
    users.set(userId, userData)
}

// HANDLERS
bot.onText(/\/start (.+)/, (msg, match) => {
    const refId = parseInt(match[1])
    const userId = msg.from.id
    if (refId && refId !== userId) {
        const currentRefs = referrals.get(refId) || 0
        referrals.set(refId, currentRefs + 1)
    }
})

bot.onText(/\/start$/, (msg) => {
    const name = msg.from.first_name || "друг"
    bot.sendMessage(msg.chat.id, 
        `🚀 Добро пожаловать, ${name}\n\n🔥 Скачивай TikTok в HD качестве\n\nПросто отправь ссылку`,
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

bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text
    const userId = msg.from.id
    const username = msg.from.username || msg.from.first_name

    if (!text || text.startsWith("/")) return

    // Кнопки меню
    if (text === "📥 Скачать видео") return bot.sendMessage(chatId, "Отправь ссылку на TikTok")
    if (text === "📢 Канал") return bot.sendMessage(chatId, "https://t.me/AZATECHNOLOGY_FREE")
    if (text === "👥 Пригласить друзей") {
        const link = `https://t.me/${BOT_USERNAME}?start=${userId}`
        return bot.sendMessage(chatId, `👥 Твоя ссылка:\n${link}\n\nПриглашено: ${referrals.get(userId) || 0}`)
    }
    if (text === "📊 Статистика") {
        let total = 0
        users.forEach(u => total += u.downloads)
        return bot.sendMessage(chatId, `📊 Статистика\n\n👤 Юзеров: ${users.size}\n📥 Скачиваний: ${total}`)
    }
    if (text === "🏆 Топ скачивателей") {
        const top = Array.from(users.values()).sort((a, b) => b.downloads - a.downloads).slice(0, 10)
        let msgTop = "🏆 ТОП СКАЧИВАТЕЛЕЙ\n\n"
        top.forEach((u, i) => msgTop += `${i + 1}️⃣ @${u.username} — ${u.downloads} видео\n`)
        return bot.sendMessage(chatId, top.length > 0 ? msgTop : "Список пуст")
    }

    // Поиск ссылок
    const links = text.match(/https?:\/\/(?:vm\.|www\.|vt\.)?tiktok\.com\/[^\s]+/g)
    if (!links) return

    for (const link of links) {
        queue.push(async () => {
            const progress = await bot.sendMessage(chatId, "⏳ Обработка видео в HD...")
            try {
                const cached = getCache(link)
                if (cached) {
                    await bot.deleteMessage(chatId, progress.message_id).catch(()=>{})
                    await bot.sendVideo(chatId, cached, { caption: "🎬 TikTok HD | AZA Technology" })
                    return addDownload(userId, username)
                }

                const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`)
                const data = await res.json()
                await bot.deleteMessage(chatId, progress.message_id).catch(()=>{})

                if (data?.data?.play) {
                    // ПРИОРИТЕТ HD: Берем hdplay, если его нет — обычный play
                    const videoUrl = data.data.hdplay || data.data.play
                    setCache(link, videoUrl)

                    const info = `🎬 *TikTok HD*\n\n👁 ${data.data.play_count} | ❤️ ${data.data.digg_count}\n👤 ${data.data.author.unique_id}`
                    
                    await bot.sendVideo(chatId, videoUrl, {
                        caption: info,
                        parse_mode: "Markdown"
                    })
                    addDownload(userId, username)
                } else if (data?.data?.images) {
                    // Фото-слайды (ограничение до 10 штук для Telegram)
                    const media = data.data.images.slice(0, 10).map((img, i) => ({
                        type: "photo",
                        media: img,
                        caption: i === 0 ? "🎬 TikTok Photo | AZA Technology" : ""
                    }))
                    await bot.sendMediaGroup(chatId, media)
                    addDownload(userId, username)
                } else {
                    bot.sendMessage(chatId, "❌ Не удалось найти видео по ссылке.")
                }
            } catch (err) {
                console.error(err)
                bot.sendMessage(chatId, "❌ Ошибка сервера.")
            }
        })
    }
    processQueue()
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
