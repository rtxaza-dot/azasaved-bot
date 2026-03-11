import TelegramBot from "node-telegram-bot-api"
import fetch from "node-fetch"

const TOKEN = process.env.TOKEN

const bot = new TelegramBot(TOKEN,{polling:true})

console.log("BOT STARTED")

bot.onText(/\/start/, (msg)=>{

bot.sendMessage(msg.chat.id,"Отправь ссылку TikTok или YouTube")

})

bot.on("message", async (msg)=>{

const text = msg.text
const chatId = msg.chat.id

if(!text) return
if(text.startsWith("/")) return

bot.sendMessage(chatId,"⏳ Скачиваю...")

try{

// TikTok
if(text.includes("tiktok.com")){

const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`)
const data = await res.json()

if(data.data.play){
await bot.sendVideo(chatId,data.data.play)
return
}

}

// YouTube
if(text.includes("youtube.com") || text.includes("youtu.be")){

const res = await fetch("https://api.cobalt.tools/api/json",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({url:text})
})

const data = await res.json()

if(data.url){
await bot.sendVideo(chatId,data.url)
return
}

}

bot.sendMessage(chatId,"❌ Не удалось скачать")

}catch(e){

console.log(e)
bot.sendMessage(chatId,"❌ Ошибка")

}

})
