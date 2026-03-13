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

// DATABASE
const users = new Map()
const referrals = new Map()
const cache = new Map()

// --- НОВАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ ОПИСАНИЯ ---
async function updateBotDescription() {
    try {
        const count = users.size;
        // Устанавливает текст под названием бота
        await bot.setMyDescription({
            description: `${count} пользователей используют этот бот 🚀`
        });
    } catch (err) {
        console.error("Ошибка обновления описания:", err.message);
    }
}

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

function formatCount(num) {
    if (!num) return "0"
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
    if (num >= 1000) return (num / 1000).toFixed(1) + "K"
    return num.toString()
}

function setCache(key, value) {
    cache.set(key, { value, expire: Date.now() + 1000 * 60 * 60 })
}

function getCache(key) {
    const data = cache.get(key)
    if (!data) return null
    if (Date.now() > data.expire) { cache.delete(key); return null }
    return data.value
}

function addDownload(userId, username) {
    const isNewUser = !users.has(userId);
    const u = users.get(userId) || { username: username || "unknown", downloads: 0 }
    u.downloads++
    users.set(userId, u)
    
    // Если пользователь новый — обновляем описание в профиле
    if (isNewUser) {
        updateBotDescription();
    }
}

// HANDLERS
bot.onText(/\/start (.+)/, (msg, match) => {
    const refId = match[1]
    const userId = msg.from.id
    if (refId && refId != userId) {
        referrals.set(refId, (referrals.get(refId) || 0) + 1)
    }
})

bot.onText(/\/start$/, (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    
    // Регистрируем пользователя при старте, если его нет
    if (!users.has(userId)) {
        users.set(userId, { username: username, downloads: 0 });
        updateBotDescription(); // Обновляем "3 пользователя..." в профиле
    }

    const name = msg.from.first_name || "друг"
    bot.sendMessage(msg.chat.id, 
        `🚀 Добро пожаловать, ${name}\n\n🔥 Я создал этого бота для скачивания TikTok в Ultra HD качестве.\n\nПросто отправь мне ссылку!`,
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

    if (text === "📥 Скачать видео") return bot.sendMessage(chatId, "Отправь ссылку на TikTok")
    if (text === "📢 Канал") return bot.sendMessage(chatId, "https://t.me/AZATECHNOLOGY_FREE")
    if (text === "👥 Пригласить друзей") {
        const link = `https://t.me/${BOT_USERNAME}?start=${userId}`
        return bot.sendMessage(chatId, `👥 Твоя ссылка:\n${link}\n\nПриглашено: ${referrals.get(userId) || 0}`)
    }
    if (text === "📊 Статистика") {
        let total = 0
        users.forEach(u => total += u.downloads)
        return bot.sendMessage(chatId, `📊 Статистика\n\n👤 Пользователей: ${users.size}\n📥 Скачиваний: ${total}`)
    }
    if (text === "🏆 Топ скачивателей") {
        const top = [...users.values()].sort((a, b) => b.downloads - a.downloads).slice(0, 10)
        let msgTop = "🏆 ТОП СКАЧИВАТЕЛЕЙ\n\n"
        top.forEach((u, i) => msgTop += `${i + 1}️⃣ @${u.username} — ${u.downloads} видео\n`)
        return bot.sendMessage(chatId, top.length > 0 ? msgTop : "Топ пока пуст")
    }

    const links = text.match(/https?:\/\/(?:vm\.|www\.|vt\.)?tiktok\.com\/[^\s]+/g)
    if (!links) return

    for (const link of links) {
        queue.push(async () => {
            const progress = await bot.sendMessage(chatId, "⏳ Обработка в Ultra HD...")
            try {
                const cached = getCache(link)
                if (cached) {
                    await bot.deleteMessage(chatId, progress.message_id).catch(()=>{})
                    await bot.sendVideo(chatId, cached, { caption: "🎬 TikTok HD | AZA Technology" })
                    addDownload(userId, username)
                    return
                }

                const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`)
                const data = await res.json()
                await bot.deleteMessage(chatId, progress.message_id).catch(()=>{})

                if (!data || !data.data) {
                    return bot.sendMessage(chatId, "❌ Ошибка: Не удалось получить данные.")
                }

                const views = formatCount(data.data.play_count)
                const likes = formatCount(data.data.digg_count)
                const captionText = `🎬 TikTok HD | AZA Technology\n\n👁 ${views} | ❤️ ${likes}`

                if (data.data.images && data.data.images.length > 0) {
                    const images = data.data.images
                    for (let i = 0; i < images.length; i += 10) {
                        const chunk = images.slice(i, i + 10)
                        const media = chunk.map((img, idx) => ({
                            type: "photo",
                            media: img,
                            caption: (i === 0 && idx === 0) ? captionText : ""
                        }))
                        await bot.sendMediaGroup(chatId, media).catch(console.error)
                    }
                    addDownload(userId, username)
                } 
                else if (data.data.play) {
                    const videoUrl = data.data.hdplay || data.data.play
                    setCache(link, videoUrl)
                    await bot.sendVideo(chatId, videoUrl, { caption: captionText })
                    addDownload(userId, username)
                } else {
                    bot.sendMessage(chatId, "❌ Ошибка: Медиа файл не найден.")
                }

            } catch (err) {
                console.error(err)
                bot.sendMessage(chatId, "❌ Ошибка при скачивании.")
            }
        })
    }
    processQueue()
})

process.on("unhandledRejection", console.error)
process.on("uncaughtException", console.error)
