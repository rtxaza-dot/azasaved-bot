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
res.send("AZASAVED BOT PRO RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running on",PORT)
})

// TELEGRAM BOT
const bot = new TelegramBot(TOKEN,{polling:true})

console.log("🤖 BOT STARTED")

// CACHE
const cache = new Map()

// USERS
const users = new Map()

function addDownload(userId){

if(!users.has(userId)){
users.set(userId,1)
}else{
users.set(userId,users.get(userId)+1)
}

}

// START
bot.onText(/\/start/,(msg)=>{

const name = msg.from.first_name || "друг"

bot.sendMessage(
msg.chat.id,
`🚀 *Добро пожаловать ${name}!*

Это быстрый TikTok Downloader ⚡

📥 Отправь ссылку и получи видео без водяного знака`,
{
parse_mode:"Markdown",
reply_markup:{
keyboard:[
["📥 Скачать видео"],
["🏆 Топ пользователей","📊 Статистика"],
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
const userId = msg.from.id

if(!text) return
if(text.startsWith("/")) return

// кнопка скачать
if(text === "📥 Скачать видео"){
bot.sendMessage(chatId,"📥 Отправь ссылку TikTok")
return
}

// помощь
if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,
`📖 *Инструкция*

1️⃣ Отправь ссылку TikTok  
2️⃣ Подожди несколько секунд  
3️⃣ Получи видео`,
{parse_mode:"Markdown"}
)
return
}

// канал
if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return
}

// статистика
if(text === "📊 Статистика"){
bot.sendMessage(chatId,
`📊 Статистика бота

👤 Пользователей: ${users.size}`
)
return
}

// топ пользователей
if(text === "🏆 Топ пользователей"){

let top = [...users.entries()]
.sort((a,b)=>b[1]-a[1])
.slice(0,5)

let textTop = "🏆 Топ пользователей\n\n"

top.forEach((u,i)=>{
textTop += `${i+1}. ID ${u[0]} — ${u[1]} скачиваний\n`
})

bot.sendMessage(chatId,textTop)

return
}

// проверка ссылки
if(!text.includes("tiktok.com")){
bot.sendMessage(chatId,"❌ Это не ссылка TikTok")
return
}

// анимация загрузки
const progress = await bot.sendMessage(chatId,"⏳ Подготовка...")

await new Promise(r=>setTimeout(r,500))
await bot.editMessageText("📥 Получаю видео...",{
chat_id:chatId,
message_id:progress.message_id
})

await new Promise(r=>setTimeout(r,500))
await bot.editMessageText("🚀 Отправляю...",{
chat_id:chatId,
message_id:progress.message_id
})

try{

// CACHE
if(cache.has(text)){

await bot.deleteMessage(chatId,progress.message_id)

await bot.sendVideo(chatId,cache.get(text))

addDownload(userId)

return
}

// API
const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,progress.message_id)

// VIDEO
if(data?.data?.play){

cache.set(text,data.data.play)

await bot.sendVideo(chatId,data.data.play,{
caption:"🎬 TikTok | AZA Technology"
})

addDownload(userId)

}

// SLIDES
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
