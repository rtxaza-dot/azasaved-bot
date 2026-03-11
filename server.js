import express from "express"
import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN
const PORT = process.env.PORT || 3000

const app = express()

const bot = new TelegramBot(TOKEN)

const users = new Map()

console.log("🚀 AZASAVED BOT STARTED")

app.use(express.json())

// анти спам
function rateLimit(userId){

const now = Date.now()

if(!users.has(userId)){
users.set(userId,now)
return false
}

const last = users.get(userId)

if(now - last < 3000){
return true
}

users.set(userId,now)

return false
}


// WEBHOOK
app.post(`/bot${TOKEN}`, async (req,res)=>{

const msg = req.body.message

if(!msg){
res.sendStatus(200)
return
}

const chatId = msg.chat.id
const text = msg.text

if(rateLimit(chatId)){
bot.sendMessage(chatId,"⏳ Подождите пару секунд")
return res.sendStatus(200)
}

if(!text){
return res.sendStatus(200)
}


// START
if(text === "/start"){

bot.sendMessage(chatId,
`👋 Добро пожаловать

📥 Скачать видео:
• TikTok
• YouTube`,
{
reply_markup:{
keyboard:[
["📥 Скачать медиа"],
["ℹ️ Помощь","📢 Канал"]
],
resize_keyboard:true
}
})

return res.sendStatus(200)
}


// КНОПКИ
if(text === "📥 Скачать медиа"){
bot.sendMessage(chatId,"📥 Отправь ссылку")
return res.sendStatus(200)
}

if(text === "ℹ️ Помощь"){
bot.sendMessage(chatId,"Отправь ссылку TikTok или YouTube")
return res.sendStatus(200)
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return res.sendStatus(200)
}


// ССЫЛКА
if(!text.includes("http")){
return res.sendStatus(200)
}

bot.sendMessage(chatId,"⏳ Скачиваю...")


try{

// TIKTOK
if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const response = await fetch(api)

const data = await response.json()

if(data?.data?.play){

await bot.sendVideo(chatId,data.data.play)

return res.sendStatus(200)

}

}


// YOUTUBE
if(text.includes("youtube.com") || text.includes("youtu.be")){

const api = "https://api.cobalt.tools/api/json"

const response = await fetch(api,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
url:text
})
})

const data = await response.json()

if(data?.url){

await bot.sendVideo(chatId,data.url)

return res.sendStatus(200)

}

}

bot.sendMessage(chatId,"❌ Не удалось скачать")

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

res.sendStatus(200)

})

app.listen(PORT,()=>{

console.log("Server running")

})
