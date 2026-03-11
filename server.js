import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 8080

const app = express()

app.get("/", (req,res)=>{
res.send("AZASAVED BOT RUNNING 🚀")
})

app.listen(PORT,()=>{
console.log("Server running on port",PORT)
})

const bot = new TelegramBot(TOKEN,{ polling:true })

console.log("🤖 BOT STARTED")

// антиспам
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


// START
bot.onText(/\/start/, (msg)=>{

const chatId = msg.chat.id

bot.sendMessage(
chatId,
`👋 Добро пожаловать в AZASAVED BOT

📥 Отправь ссылку TikTok и я скачаю видео`,
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
bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const text = msg.text

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
`📖 Как пользоваться

1️⃣ Скопируй ссылку TikTok
2️⃣ Отправь её боту
3️⃣ Получи видео без водяного знака`
)

return

}


// канал
if(text === "📢 Канал"){

bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")

return

}


// антиспам
if(antiSpam(msg.from.id)){

bot.sendMessage(chatId,"⏳ Подожди пару секунд")

return

}


// проверка ссылки
if(!text.includes("tiktok.com")){

bot.sendMessage(chatId,"❌ Это не ссылка TikTok")

return

}


const loading = await bot.sendMessage(chatId,"⚡ Скачиваю...")

try{

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const res = await fetch(api)
const data = await res.json()

await bot.deleteMessage(chatId,loading.message_id)

if(data?.data?.play){

await bot.sendVideo(chatId,data.data.play,{
caption:"⚡ Powered by AZA Technology"
})

}else{

bot.sendMessage(chatId,"❌ Не удалось скачать")

}

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
