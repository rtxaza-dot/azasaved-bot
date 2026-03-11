import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080

const app = express()

app.get("/",(req,res)=>{
res.send("AZASAVED BOT PRO RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running on port",PORT)
})

const bot = new TelegramBot(TOKEN,{polling:true})

console.log("🤖 BOT PRO STARTED")

// =================
// CACHE (ускорение)
// =================

const cache = new Map()

// =================
// START
// =================

bot.onText(/\/start/,(msg)=>{

bot.sendMessage(
msg.chat.id,
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

bot.on("message",async(msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(!text) return
if(text.startsWith("/")) return

if(text === "📥 Скачать видео"){
bot.sendMessage(chatId,"📥 Отправь ссылку")
return
}

if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,"Отправь ссылку TikTok / Instagram / YouTube")
return
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return
}

// =================
// LOADING ANIMATION
// =================

const loading = await bot.sendAnimation(
chatId,
"https://media.giphy.com/media/y1ZBcOGOOtlpC/giphy.gif",
{caption:"⏳ Подождите секунду..."}
)

try{

// =================
// CACHE
// =================

if(cache.has(text)){

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,cache.get(text))

return
}


// =================
// TIKTOK
// =================

if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

// видео
if(data?.data?.play){

cache.set(text,data.data.play)

await bot.sendVideo(chatId,data.data.play,{
caption:"🎬 TikTok | AZA Technology"
})

}

// фото slides
if(data?.data?.images){

for(const img of data.data.images){

await bot.sendPhoto(chatId,img)

}

}

}


// =================
// INSTAGRAM
// =================

else if(text.includes("instagram.com")){

const api = `https://api.vxtiktok.com/instagram?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data?.video){

cache.set(text,data.video)

await bot.sendVideo(chatId,data.video,{
caption:"📸 Instagram"
})

}

}


// =================
// YOUTUBE
// =================

else if(text.includes("youtube.com") || text.includes("youtu.be")){

const api = `https://api.vxtiktok.com/youtube?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data?.video){

cache.set(text,data.video)

await bot.sendVideo(chatId,data.video,{
caption:"🎬 YouTube"
})

}

}

else{

await bot.deleteMessage(chatId,loading.message_id)

bot.sendMessage(chatId,"❌ Неправильная ссылка")

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
