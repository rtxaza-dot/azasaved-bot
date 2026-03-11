import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

if(!TOKEN){
console.log("❌ TOKEN NOT FOUND")
process.exit(1)
}

const bot = new TelegramBot(TOKEN,{ polling:true })

console.log("🚀 AZASAVED BOT STARTED")

// ---------------- START ----------------

bot.onText(/\/start/, (msg)=>{

const chatId = msg.chat.id

bot.sendMessage(
chatId,
`👋 Добро пожаловать в AZASAVED BOT

📥 Скачивай видео и фото из:
• TikTok
• Instagram

Нажмите кнопку ниже и отправьте ссылку.`,
{
reply_markup:{
keyboard:[
["📥 Скачать медиа"],
["ℹ️ Помощь","📢 Канал"],
["👨‍💻 Разработчик"]
],
resize_keyboard:true
}
}
)

})

// ---------------- MESSAGE ----------------

bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const text = msg.text

if(!text) return

// игнор команд
if(text.startsWith("/")) return

// ---------- КНОПКИ ----------

if(text === "📥 Скачать медиа"){
bot.sendMessage(chatId,"📥 Киньте ссылку на видео или фото")
return
}

if(text === "ℹ️ Помощь"){
bot.sendMessage(
chatId,
`📖 Как пользоваться ботом

1️⃣ Скопируй ссылку из TikTok или Instagram
2️⃣ Отправь её боту
3️⃣ Получи медиа за пару секунд`
)
return
}

if(text === "📢 Канал"){
bot.sendMessage(chatId,"https://t.me/AZATECHNOLOGY_FREE")
return
}

if(text === "👨‍💻 Разработчик"){
bot.sendMessage(chatId,"👨‍💻 AZA Technology")
return
}

// ---------- НЕ ССЫЛКА ----------

if(!text.includes("http")) return

bot.sendMessage(chatId,"⏳ Скачиваю...")

try{

// =====================================================
// TIKTOK
// =====================================================

if(text.includes("tiktok.com")){

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`

const response = await fetch(api)

const raw = await response.text()

let data

try{
data = JSON.parse(raw)
}catch{
console.log("TikTok API ERROR:",raw)
bot.sendMessage(chatId,"❌ TikTok API ошибка")
return
}

if(data?.data?.play){

await bot.sendVideo(chatId,data.data.play)

bot.sendMessage(chatId,"⚡ Powered by AZA Technology")

return
}

}

// =====================================================
// INSTAGRAM
// =====================================================

if(text.includes("instagram.com")){

const api = `https://api.vxtiktok.com/instagram?url=${encodeURIComponent(text)}`

const response = await fetch(api)

const raw = await response.text()

let data

try{
data = JSON.parse(raw)
}catch{
console.log("Instagram API ERROR:",raw)
bot.sendMessage(chatId,"❌ Instagram API ошибка")
return
}

if(data?.media){

for(const media of data.media){

if(media.type === "video"){
await bot.sendVideo(chatId,media.url)
}

if(media.type === "photo"){
await bot.sendPhoto(chatId,media.url)
}

}

bot.sendMessage(chatId,"⚡ Powered by AZA Technology")

return
}

}

// ---------- НЕ СКАЧАЛОСЬ ----------

bot.sendMessage(chatId,"❌ Не удалось скачать")

}catch(err){

console.log("DOWNLOAD ERROR:",err)

bot.sendMessage(chatId,"❌ Ошибка скачивания")

}

})
