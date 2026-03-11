import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080

const app = express()

app.get("/", (req,res)=>{
res.send("AZASAVED BOT PRO RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running on port",PORT)
})

const bot = new TelegramBot(TOKEN,{ polling:true })

console.log("🤖 BOT PRO STARTED")

// =================
// CACHE
// =================

const cache = new Map()

// =================
// ANTISPAM
// =================

const cooldown = new Map()

function antiSpam(userId){

const now = Date.now()

if(cooldown.has(userId)){
if(now - cooldown.get(userId) < 2000){
return true
}
}

cooldown.set(userId,now)
return false

}

// =================
// START
// =================

bot.onText(/\/start/, (msg)=>{

const chatId = msg.chat.id

bot.sendMessage(
chatId,
`🚀 AZASAVED BOT

Отправь ссылку:

• TikTok
• Instagram
• YouTube`,
{
reply_markup:{
keyboard:[
["📥 Скачать видео"],
["ℹ️ Помощь","📢 Канал"]
],
resize_keyboard:true
}
}
)

})

// =================
// MESSAGE
// =================

bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const text = msg.text
const userId = msg.from.id

if(!text) return
if(text.startsWith("/")) return

// кнопки

if(text === "📥 Скачать видео"){
bot.sendMessage(chatId,"📥 Отправь ссылку на видео")
return
}

if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 Как пользоваться

1️⃣ Отправь ссылку
2️⃣ Бот скачает видео
3️⃣ Получи файл`)
return
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return
}

// антиспам

if(antiSpam(userId)){
bot.sendMessage(chatId,"⏳ Подожди немного")
return
}

// =================
// CACHE
// =================

if(cache.has(text)){

const video = cache.get(text)

await bot.sendVideo(chatId,video,{
caption:"⚡ Быстро из кэша"
})

return
}

const loading = await bot.sendMessage(chatId,"⚡ Скачиваю...")

try{

// =================
// TIKTOK
// =================

if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data?.data?.play){

cache.set(text,data.data.play)

await bot.sendVideo(chatId,data.data.play,{
caption:"🎬 TikTok | Powered by AZA Technology"
})

}

}

// =================
// INSTAGRAM
// =================

else if(text.includes("instagram.com")){

bot.sendMessage(chatId,
`⚠ Instagram загрузчик временно

Используй:
https://snapinst.app`
)

}

// =================
// YOUTUBE
// =================

else if(text.includes("youtube.com") || text.includes("youtu.be")){

bot.sendMessage(chatId,
`⚠ YouTube загрузчик временно

Используй:
https://ssyoutube.com`
)

}

else{

bot.sendMessage(chatId,"❌ Неправильная ссылка")

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
