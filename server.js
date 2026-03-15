import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import fs from "fs"
import dotenv from "dotenv"
import { ChartJSNodeCanvas } from "chartjs-node-canvas"

dotenv.config()

const TOKEN = process.env.TOKEN
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID = 5331869155
const PORT = process.env.PORT || 3000

// express (Railway keep-alive)
const app = express()
app.get("/", (req,res)=>res.send("Bot running"))
app.listen(PORT)

// telegram
const bot = new TelegramBot(TOKEN,{ polling:true })

// графики
const chart = new ChartJSNodeCanvas({ width:800, height:400 })

// база
const DB_FILE = "./users.json"
let users = {}

if(fs.existsSync(DB_FILE)){
users = JSON.parse(fs.readFileSync(DB_FILE))
}

function saveUsers(){
fs.writeFileSync(DB_FILE,JSON.stringify(users,null,2))
}

// формат чисел
function format(n){
if(!n) return "0"
if(n>=1000000) return (n/1000000).toFixed(1)+"M"
if(n>=1000) return (n/1000).toFixed(1)+"K"
return n
}

// учёт скачиваний
function addDownload(user){
const id = user.id
const name = user.username ? "@"+user.username : user.first_name

if(!users[id]){
users[id]={name,downloads:1}
}else{
users[id].downloads++
}

saveUsers()
}

// главное меню
function mainMenu(chatId){
bot.sendMessage(chatId,
`🎬 TikTok HD Downloader

Нажмите кнопку и отправьте ссылку TikTok`,
{
reply_markup:{
inline_keyboard:[
[{text:"📥 Скачать TikTok",callback_data:"download"}],
[
{text:"📊 Статистика",callback_data:"stats"},
{text:"🏆 Топ",callback_data:"top"}
],
[{text:"👥 Пригласить",callback_data:"invite"}]
]
}
})
}

// админ панель
function adminPanel(chatId){
bot.sendMessage(chatId,
"⚙️ Админ панель",
{
reply_markup:{
inline_keyboard:[
[{text:"📊 График скачиваний",callback_data:"admin_graph"}],
[{text:"📢 Рассылка",callback_data:"admin_broadcast"}]
]
}
})
}

// start
bot.onText(/\/start/,msg=>{
mainMenu(msg.chat.id)
})

// кнопки
bot.on("callback_query",async q=>{

const chatId = q.message.chat.id
const data = q.data

if(data==="download"){
bot.sendMessage(chatId,"📥 Отправьте ссылку TikTok")
}

if(data==="stats"){

let total=0
Object.values(users).forEach(u=> total+=u.downloads)

bot.sendMessage(chatId,
`📊 Статистика

👤 Пользователи: ${Object.keys(users).length}
📥 Скачано: ${total}`)
}

if(data==="top"){

const top = Object.values(users)
.sort((a,b)=>b.downloads-a.downloads)
.slice(0,10)

let msg="🏆 Топ скачивателей\n\n"

top.forEach((u,i)=>{
msg+=`${i+1}. ${u.name} — ${u.downloads}\n`
})

bot.sendMessage(chatId,msg)
}

if(data==="invite"){

bot.sendMessage(chatId,
`👥 Пригласи друзей

https://t.me/${BOT_USERNAME}?start=${q.from.id}`)
}

// админ
if(q.from.id===ADMIN_ID && data==="admin_graph"){

let total=0
Object.values(users).forEach(u=> total+=u.downloads)

const config={
type:"bar",
data:{
labels:["Users","Downloads"],
datasets:[{
label:"Bot stats",
data:[Object.keys(users).length,total]
}]
}
}

const image = await chart.renderToBuffer(config)

bot.sendPhoto(chatId,image,{caption:"📊 График бота"})
}

})

// поиск TikTok ссылки
bot.on("message",async msg=>{

const text = msg.text
const chatId = msg.chat.id

if(!text || text.startsWith("/")) return

const link = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/)

if(!link) return

// анимация загрузки
const loading = await bot.sendMessage(chatId,"⏳ Загружаю видео...")

try{

await bot.editMessageText("📥 Скачиваю...",{
chat_id:chatId,
message_id:loading.message_id
})

const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(link[0])}`
const {data} = await axios.get(api)

const video = data.data.hdplay || data.data.play
const author = data.data.author?.unique_id || "unknown"

await bot.editMessageText("✅ Отправляю...",{
chat_id:chatId,
message_id:loading.message_id
})

const caption =
`🎬 TikTok HD | AZA Technology

👤 @${author}
👁 ${format(data.data.play_count)}
❤️ ${format(data.data.digg_count)}`

await bot.sendVideo(chatId,video,{caption})

addDownload(msg.from)

}catch(e){

bot.sendMessage(chatId,"❌ Ошибка загрузки")

}

})

process.on("unhandledRejection",console.error)
process.on("uncaughtException",console.error)
