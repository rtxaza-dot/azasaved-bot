import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080

// EXPRESS
const app = express()

app.get("/",(req,res)=>{
res.send("AZASAVED BOT RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running on port",PORT)
})

// TELEGRAM BOT
const bot = new TelegramBot(TOKEN,{polling:true})

console.log("🤖 BOT STARTED")

// CACHE
const cache = new Map()

// START
bot.onText(/\/start/,(msg)=>{

bot.sendMessage(
msg.chat.id,
`🚀 AZASAVED BOT

📥 Отправь ссылку TikTok
и бот скачает видео`,
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

// MESSAGE
bot.on("message",async(msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(!text) return
if(text.startsWith("/")) return

// кнопки
if(text === "📥 Скачать видео"){
bot.sendMessage(chatId,"📥 Отправь ссылку TikTok")
return
}

if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 Как пользоваться

1️⃣ Скопируй ссылку TikTok
2️⃣ Отправь её боту
3️⃣ Получи видео`)
return
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return
}

// проверка ссылки
if(!text.includes("tiktok.com")){
bot.sendMessage(chatId,"❌ Это не ссылка TikTok")
return
}

// анимация загрузки
const loading = await bot.sendAnimation(
chatId,
"https://media.giphy.com/media/y1ZBcOGOOtlpC/giphy.gif",
{caption:"⏳ Подождите секунду..."}
)

try{

// CACHE
if(cache.has(text)){

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,cache.get(text),{
caption:"⚡ Быстро из кэша"
})

return
}

// API
const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

// VIDEO
if(data?.data?.play){

cache.set(text,data.data.play)

await bot.sendVideo(chatId,data.data.play,{
caption:"🎬 TikTok | Powered by AZA Technology"
})

}

// SLIDES (фото)
if(data?.data?.images){

for(const img of data.data.images){

await bot.sendPhoto(chatId,img)

}

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
