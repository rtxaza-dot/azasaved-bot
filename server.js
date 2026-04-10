import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3001
const ADMIN_ID = 5331869155

if (!TOKEN) {
    console.log("❌ Нет токена")
    process.exit(1)
}

// --- SERVER ---
const app = express()
app.get("/", (req, res) => res.send("Бот работает"))
app.listen(PORT, () => console.log(`🌐 Сервер: ${PORT}`))

// --- BOT ---
const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 300,
        autoStart: true
    }
})

// --- ЗАЩИТА ОТ 409 ОШИБКИ ---
async function initBot() {
    try {
        await bot.deleteWebHook()
        console.log("🧹 Webhook удалён")
    } catch (e) {}

    try {
        await bot.stopPolling()
    } catch (e) {}

    try {
        await bot.startPolling()
        console.log("🤖 Бот запущен")
    } catch (e) {
        console.log("❌ Ошибка запуска:", e.message)
    }
}
initBot()

// --- МЕНЮ ---
const getMenu = (userId) => ({
    reply_markup: {
        keyboard: [
            ["📥 Скачать TikTok"],
            ...(userId === ADMIN_ID ? [["⚙️ Админ"]] : [])
        ],
        resize_keyboard: true
    }
})

// --- START ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Кидай ссылку TikTok", getMenu(msg.from.id))
})

// --- ФУНКЦИЯ СКАЧИВАНИЯ ---
async function downloadTikTok(link) {
    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`
    const { data } = await axios.get(api)

    if (!data || !data.data) throw new Error("API error")

    return {
        video: data.data.hdplay || data.data.play,
        images: data.data.images || [],
        author: data.data.author?.unique_id || "unknown"
    }
}

// --- ОБРАБОТКА ---
bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text

    if (!text || text.startsWith("/")) return

    const links = text.match(/https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s]+/g)
    if (!links) return

    for (const link of links) {
        const wait = await bot.sendMessage(chatId, "⏳ Обрабатываю...")

        try {
            const data = await downloadTikTok(link)

            // --- ФОТО ---
            if (data.images.length > 0) {
                for (let img of data.images) {
                    await bot.sendPhoto(chatId, img)
                }

                await bot.sendMessage(chatId, `✅ Фото скачаны\n👤 ${data.author}`)
            }

            // --- ВИДЕО ---
            else if (data.video) {
                const stream = await axios({
                    url: data.video,
                    responseType: "stream"
                })

                await bot.sendVideo(chatId, stream.data, {
                    caption: `✅ Видео скачано\n👤 ${data.author}`
                })
            } else {
                throw new Error("Нет контента")
            }

            bot.deleteMessage(chatId, wait.message_id).catch(() => {})

        } catch (e) {
            console.error(e)

            bot.editMessageText("❌ Ошибка при скачивании", {
                chat_id: chatId,
                message_id: wait.message_id
            })
        }
    }
})

// --- АНТИ КРАШ ---
process.on("uncaughtException", (err) => {
    console.log("💥 Ошибка:", err.message)
})

process.on("unhandledRejection", (err) => {
    console.log("💥 Promise ошибка:", err)
})
