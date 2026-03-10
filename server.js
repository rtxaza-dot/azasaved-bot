import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = "8757135302:AAHJ0KKnvLv_HWXVyjhze7GMXx-hyN7ZMOw"

const bot = new TelegramBot(TOKEN,{polling:true})

console.log("AZASAVED BOT started")

// START
bot.onText(/\/start/, (msg)=>{

bot.sendMessage(msg.chat.id,
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
})

})


// HELP
bot.onText(/\/help/, (msg)=>{

bot.sendMessage(msg.chat.id,
`📖 Как пользоваться ботом

1. Скопируйте ссылку из TikTok или Instagram
2. Отправьте её боту
3. Получите медиа за пару секунд ⚡`
)

})


// ABOUT
bot.onText(/\/about/, (msg)=>{

bot.sendMessage(msg.chat.id,
`🤖 AZASAVED BOT

Бот скачивает медиа из TikTok и Instagram.

⚡ Powered by AZA Technology`
)

})



// CHANNEL
bot.onText(/\/channel/, (msg)=>{

bot.sendMessage(msg.chat.id,
`📢 Подпишитесь на канал

⚡ AZA Technology

https://t.me/AZATECHNOLOGY_FREE`
)

})


// DEVELOPER
bot.onText(/\/developer/, (msg)=>{

bot.sendMessage(msg.chat.id,
"👨‍💻 Создатель: AZA Technology"
)

})


// PING
bot.onText(/\/ping/, (msg)=>{

bot.sendMessage(msg.chat.id,"🏓 Бот работает!")

})


// КНОПКА СКАЧАТЬ
bot.on("message",(msg)=>{

if(msg.text === "📥 Скачать медиа"){

bot.sendMessage(msg.chat.id,"📥 Киньте ссылку на видео или фото")

}

})


// СКАЧИВАНИЕ
bot.on("message", async (msg)=>{

const chatId = msg.chat.id
const url = msg.text

if(!url || !url.includes("http")) return

bot.sendMessage(chatId,"⏳ Скачиваю...")

try{

const api = `https://www.tikwm.com/api/?url=${url}`

const res = await fetch(api)
const data = await res.json()

if(data.data.play){

await bot.sendVideo(chatId,data.data.play)

}

if(data.data.images){

for(const img of data.data.images){

await bot.sendPhoto(chatId,img)

}

}

bot.sendMessage(chatId,"⚡ Powered by AZA Technology")

}catch(err){

console.log(err)

bot.sendMessage(chatId,"❌ Не удалось скачать")

}

})