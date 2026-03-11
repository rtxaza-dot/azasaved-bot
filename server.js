import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import dotenv from "dotenv"
import mongoose from "mongoose"
import express from "express"

dotenv.config()

const TOKEN = process.env.TOKEN
const MONGO_URI = process.env.MONGO_URI
const PORT = process.env.PORT || 3000

// =================
// EXPRESS
// =================

const app = express()

app.get("/", (req,res)=>{
res.send("BOT RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running",PORT)
})

// =================
// MONGODB
// =================

mongoose.connect(MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err))

const User = mongoose.model("User",{ userId:Number })

// =================
// TELEGRAM BOT
// =================

const bot = new TelegramBot(TOKEN,{polling:true})

console.log("BOT STARTED")

// =================
// КЭШ (ускоряет работу)
// =================

const cache = new Map()

function getCache(url){
return cache.get(url)
}

function saveCache(url,data){

cache.set(url,{
data,
time:Date.now()
})

}

// очищаем старый кэш каждые 30 минут
setInterval(()=>{

const now = Date.now()

for(const [key,value] of cache){

if(now - value.time > 1800000){
cache.delete(key)
}

}

},600000)


// =================
// АНТИСПАМ
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

bot.onText(/\/start/, async (msg)=>{

const chatId = msg.chat.id
const userId = msg.from.id

const exist = await User.findOne({userId})

if(!exist){
await User.create({userId})
}

bot.sendMessage(chatId,
`🚀 AZASAVED BOT

📥 Отправь ссылку:

• TikTok
• Instagram
• YouTube`
)

})


// =================
// ОБРАБОТКА
// =================

bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const text = msg.text
const userId = msg.from.id

if(!text) return
if(text.startsWith("/")) return

if(antiSpam(userId)){
bot.sendMessage(chatId,"⏳ Подожди...")
return
}

const loading = await bot.sendMessage(chatId,"⚡ Загружаю...")

try{

// =================
// КЭШ
// =================

const cached = getCache(text)

if(cached){

await bot.deleteMessage(chatId,loading.message_id)

await bot.sendVideo(chatId,cached.data,{
caption:"⚡ Быстро из кэша"
})

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

if(data?.data?.play){

saveCache(text,data.data.play)

await bot.sendVideo(chatId,data.data.play,{
caption:"🎬 TikTok"
})

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

saveCache(text,data.video)

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

saveCache(text,data.video)

await bot.sendVideo(chatId,data.video,{
caption:"📺 YouTube"
})

}

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка")

}

})


// =================
// НЕ ПАДАТЬ
// =================

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
