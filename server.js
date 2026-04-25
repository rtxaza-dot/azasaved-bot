import TelegramBot from "node-telegram-bot-api"
import axios from "axios"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TOKEN        = process.env.TOKEN
const PORT         = process.env.PORT || 3000
const BOT_USERNAME = "AZASAVED_bot"
const ADMIN_ID     = 5331869155
const CHANNEL      = "https://t.me/AZATECHNOLOGY_FREE"

// 🔐 Security
const EXPECTED_BOT = "AZASAVED_bot"
const REAL_ADMIN   = 5331869155
const SECRET_KEY   = "aza_secure_2026"

if (!TOKEN) { console.error("❌ TOKEN missing"); process.exit(1) }

// ─── SECURITY ────────────────────────────────────────────────────────────────
async function protectBot(bot) {
  try {
    const me = await bot.getMe()
    if (me.username !== EXPECTED_BOT) { console.error("❌ Cloned bot blocked"); process.exit(1) }
  } catch { process.exit(1) }
}
function protectAdmin() {
  if (ADMIN_ID !== REAL_ADMIN) { console.error("❌ Fake admin"); process.exit(1) }
}
function hiddenCheck() {
  if (SECRET_KEY !== "aza_secure_2026") process.exit(1)
}

// ─── EXPRESS ─────────────────────────────────────────────────────────────────
const app = express()
app.get("/", (_req, res) => res.send("✅ Bot is running"))
app.get("/health", (_req, res) => res.json({
  status: "ok",
  users: users.size,
  cacheSize: cache.size,
  ads: { total: ads.length, active: ads.filter(a => a.active).length }
}))
app.listen(PORT, () => console.log(`🌐 Server on port ${PORT}`))

// ─── BOT ─────────────────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true })
console.log("🤖 Bot started");

;(async () => {
  await protectBot(bot)
  protectAdmin()
  hiddenCheck()
})()

// ─── STATE ───────────────────────────────────────────────────────────────────
const users        = new Map()   // userId → { name, username, joinedAt, downloads, lastAdShown }
const cache        = new Map()   // url    → { type, data, ts }
const cooldown     = new Map()   // userId → lastMsgTime
const lastMessages = new Map()   // userId → [msgId, ...]
const userStates   = new Map()   // userId → { state, ...data }
const CACHE_TTL    = 3_600_000   // 1 hour

// ─── 📣 ADS SYSTEM ───────────────────────────────────────────────────────────
// ad: { id, type, text, imageUrl, videoUrl, buttons, active, showEvery, createdAt, views }
// type: "text" | "photo" | "video"
// showEvery: show ad after every N downloads
const ads = []
let adIdCounter = 1

// Watchdog
setInterval(() => {
  if (!users.has(REAL_ADMIN)) { console.error("❌ Admin missing"); process.exit(1) }
}, 60_000)

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function formatNumber(n) {
  if (!n) return "0"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K"
  return String(n)
}

function antiSpam(id, ms = 1500) {
  const now = Date.now()
  if (cooldown.has(id) && now - cooldown.get(id) < ms) return true
  cooldown.set(id, now)
  return false
}

function saveMsg(userId, msgId) {
  if (!lastMessages.has(userId)) lastMessages.set(userId, [])
  lastMessages.get(userId).push(msgId)
}

async function clearChat(chatId, userId) {
  const msgs = lastMessages.get(userId) || []
  await Promise.allSettled(msgs.map(id => bot.deleteMessage(chatId, id)))
  lastMessages.set(userId, [])
}

async function safeDelete(chatId, msgId) {
  try { await bot.deleteMessage(chatId, msgId) } catch {}
}

function extractTikTokLinks(text) {
  return text.match(/https?:\/\/[^\s]*(?:tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)[^\s]*/g) || []
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.ts) < CACHE_TTL
}

function trackUser(msg) {
  const id = msg.from.id
  if (!users.has(id)) {
    users.set(id, {
      name: msg.from.first_name || "User",
      username: msg.from.username || null,
      joinedAt: Date.now(),
      downloads: 0,
      lastAdShown: 0
    })
  }
  return users.get(id)
}

// ─── AD LOGIC ────────────────────────────────────────────────────────────────
function getActiveAds() {
  return ads.filter(a => a.active)
}

function pickAd() {
  const active = getActiveAds()
  if (!active.length) return null
  return active[Math.floor(Math.random() * active.length)]
}

function shouldShowAd(user, adEvery = 3) {
  return (user.downloads - user.lastAdShown) >= adEvery
}

function buildAdKeyboard(buttons) {
  if (!buttons || !buttons.length) return undefined
  return { inline_keyboard: [buttons.map(b => ({ text: b.text, url: b.url }))] }
}

async function sendAdToUser(chatId, userId, ad) {
  try {
    const keyboard = buildAdKeyboard(ad.buttons)
    const opts = { parse_mode: "Markdown", ...(keyboard ? { reply_markup: keyboard } : {}) }
    let sent

    if (ad.type === "photo" && ad.imageUrl) {
      sent = await bot.sendPhoto(chatId, ad.imageUrl, { caption: ad.text, ...opts })
    } else if (ad.type === "video" && ad.videoUrl) {
      sent = await bot.sendVideo(chatId, ad.videoUrl, { caption: ad.text, ...opts, supports_streaming: true })
    } else {
      sent = await bot.sendMessage(chatId, ad.text, opts)
    }

    ad.views = (ad.views || 0) + 1
    if (sent && userId) saveMsg(userId, sent.message_id)
    return true
  } catch {
    return false
  }
}

async function maybeShowAd(chatId, userId, user) {
  const ad = pickAd()
  if (!ad) return
  if (!shouldShowAd(user, ad.showEvery)) return
  user.lastAdShown = user.downloads
  await sleep(1500)
  await sendAdToUser(chatId, userId, ad)
}

// ─── QUEUE ───────────────────────────────────────────────────────────────────
const queue = []
let queueRunning = false

function addQueue(task) { queue.push(task); runQueue() }

async function runQueue() {
  if (queueRunning) return
  queueRunning = true
  while (queue.length) {
    const job = queue.shift()
    try { await job() } catch (e) { console.error("Queue error:", e.message) }
    await sleep(1000)
  }
  queueRunning = false
}

// ─── API ─────────────────────────────────────────────────────────────────────
const API_ENDPOINTS = [
  url => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
  url => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
]

async function fetchTikTok(url) {
  for (const ep of API_ENDPOINTS) {
    try {
      const { data } = await axios.get(ep(url), { timeout: 15_000 })
      if (data?.data) return data.data
    } catch {}
  }
  throw new Error("All API endpoints failed")
}

// ─── KEYBOARDS ───────────────────────────────────────────────────────────────
const mainKeyboard = (userId) => ({
  inline_keyboard: [
    [{ text: "📢 Канал", url: CHANNEL }, { text: "💖 Поддержать", callback_data: "donate" }],
    [{ text: "ℹ️ Помощь", callback_data: "help" }, { text: "📊 Мои загрузки", callback_data: "mystats" }],
    ...(userId === ADMIN_ID ? [[{ text: "⚙️ Админ панель", callback_data: "admin" }]] : [])
  ]
})

const videoKeyboard = {
  inline_keyboard: [[
    { text: "💖 Поддержать", callback_data: "donate" },
    { text: "📢 Канал", url: CHANNEL }
  ]]
}

const adminKeyboard = () => ({
  inline_keyboard: [
    [{ text: "📢 Рассылка", callback_data: "broadcast" },   { text: "📊 Статистика", callback_data: "adminstats" }],
    [{ text: "📣 Реклама",  callback_data: "ads_menu" },    { text: "🗑 Очистить кэш", callback_data: "clearcache" }],
  ]
})

// ─── /start ──────────────────────────────────────────────────────────────────
bot.onText(/\/start/, async msg => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  trackUser(msg)
  safeDelete(chatId, msg.message_id)

  const sent = await bot.sendMessage(chatId,
`🎬 *AZASAVED Bot*

Скачиваю видео и фото с TikTok без водяного знака.

📌 *Как использовать:*
• Отправь ссылку на TikTok видео или фото
• Получи контент без водяного знака ⚡

✅ Поддерживаю:
• Видео (HD качество)
• Слайд-шоу / фото-посты

👇 *Просто отправь ссылку!*`,
    { parse_mode: "Markdown", reply_markup: mainKeyboard(userId) }
  )
  saveMsg(userId, sent.message_id)
  setTimeout(() => safeDelete(chatId, sent.message_id), 120_000)
})

// ─── /stats ──────────────────────────────────────────────────────────────────
bot.onText(/\/stats/, async msg => {
  if (msg.from.id !== ADMIN_ID) return
  const topUsers = [...users.entries()]
    .sort((a, b) => b[1].downloads - a[1].downloads)
    .slice(0, 5)
    .map(([, u], i) => `${i + 1}. ${u.name} — ${u.downloads} загрузок`)
    .join("\n")
  const totalDownloads = [...users.values()].reduce((s, u) => s + u.downloads, 0)

  bot.sendMessage(msg.chat.id,
`📊 *Статистика*

👥 Пользователей: *${users.size}*
📥 Всего загрузок: *${totalDownloads}*
🗃 Кэш: *${cache.size}* ссылок
📣 Рекламы: *${ads.length}* (активных: *${getActiveAds().length}*)

🏆 Топ:
${topUsers || "нет данных"}`,
    { parse_mode: "Markdown" }
  )
})

// ─── CALLBACKS ───────────────────────────────────────────────────────────────
bot.on("callback_query", async q => {
  const chatId = q.message.chat.id
  const userId = q.from.id
  const data   = q.data

  await bot.answerCallbackQuery(q.id)

  // ── Public ──
  if (data === "donate") {
    const m = await bot.sendMessage(chatId, "💖 Поддержать: *@AZAkzn1*\nСпасибо!", { parse_mode: "Markdown" })
    saveMsg(userId, m.message_id)
    setTimeout(() => safeDelete(chatId, m.message_id), 10_000)
  }

  if (data === "help") {
    const m = await bot.sendMessage(chatId,
`ℹ️ *Как пользоваться*

1. Скопируй ссылку из TikTok
2. Вставь сюда
3. Получи видео или фото

⚡ Форматы ссылок:
• tiktok.com/@user/video/...
• vm.tiktok.com/...
• vt.tiktok.com/...

❓ Проблемы? @AZAkzn1`,
      { parse_mode: "Markdown" }
    )
    saveMsg(userId, m.message_id)
    setTimeout(() => safeDelete(chatId, m.message_id), 20_000)
  }

  if (data === "mystats") {
    const u = users.get(userId)
    const m = await bot.sendMessage(chatId,
      u ? `📊 Твоя статистика:\n\n📥 Загрузок: *${u.downloads}*` : "У тебя пока нет загрузок.",
      { parse_mode: "Markdown" }
    )
    saveMsg(userId, m.message_id)
    setTimeout(() => safeDelete(chatId, m.message_id), 10_000)
  }

  // ── Admin: main ──
  if (data === "admin" && userId === ADMIN_ID) {
    const m = await bot.sendMessage(chatId,
`⚙️ *Админ панель*

👥 Пользователей: *${users.size}*
🗃 Кэш: *${cache.size}*
📣 Рекламы: *${ads.length}* (активных: *${getActiveAds().length}*)`,
      { parse_mode: "Markdown", reply_markup: adminKeyboard() }
    )
    saveMsg(userId, m.message_id)
  }

  if (data === "adminstats" && userId === ADMIN_ID) {
    const totalDownloads = [...users.values()].reduce((s, u) => s + u.downloads, 0)
    const adStats = ads.map(a =>
      `${a.active ? "✅" : "⏸"} #${a.id} [${a.type}] — 👁 ${a.views || 0} показов`
    ).join("\n") || "нет рекламы"

    const m = await bot.sendMessage(chatId,
`📊 *Подробная статистика*

👥 Пользователей: *${users.size}*
📥 Всего загрузок: *${totalDownloads}*
🗃 Кэш: *${cache.size}*
📋 Очередь: *${queue.length}*

📣 *Реклама:*
${adStats}`,
      { parse_mode: "Markdown" }
    )
    saveMsg(userId, m.message_id)
  }

  if (data === "clearcache" && userId === ADMIN_ID) {
    cache.clear()
    const m = await bot.sendMessage(chatId, "✅ Кэш очищен!")
    saveMsg(userId, m.message_id)
    setTimeout(() => safeDelete(chatId, m.message_id), 4_000)
  }

  if (data === "broadcast" && userId === ADMIN_ID) {
    userStates.set(userId, { state: "broadcast" })
    const m = await bot.sendMessage(chatId,
`📢 *Рассылка*

Отправь сообщение — разошлю всем.
Поддерживаются текст, фото, видео с Markdown.

/cancel — отмена`,
      { parse_mode: "Markdown" }
    )
    saveMsg(userId, m.message_id)
  }

  // ── Ads menu ──
  if (data === "ads_menu" && userId === ADMIN_ID) {
    await showAdsMenu(chatId, userId)
  }

  if (data === "ad_create" && userId === ADMIN_ID) {
    userStates.set(userId, { state: "ad_create_step1" })
    const m = await bot.sendMessage(chatId,
`📣 *Создание рекламы — Шаг 1/3*

Выбери тип объявления:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ Текст",          callback_data: "ad_type_text"  }],
            [{ text: "🖼 Фото + текст",   callback_data: "ad_type_photo" }],
            [{ text: "🎬 Видео + текст",  callback_data: "ad_type_video" }],
            [{ text: "❌ Отмена",          callback_data: "ads_menu"      }]
          ]
        }
      }
    )
    saveMsg(userId, m.message_id)
  }

  if (["ad_type_text","ad_type_photo","ad_type_video"].includes(data) && userId === ADMIN_ID) {
    const type = data.replace("ad_type_", "")
    userStates.set(userId, { state: "ad_awaiting_content", adType: type, adData: {} })

    const prompt = {
      text:  "✏️ Напиши текст объявления (поддерживается Markdown):",
      photo: "🖼 Отправь фото с подписью (или только фото):",
      video: "🎬 Отправь видео с подписью (или только видео):"
    }[type]

    const m = await bot.sendMessage(chatId,
      `📣 *Создание рекламы — Шаг 2/3*\n\n${prompt}\n\n/cancel — отмена`,
      { parse_mode: "Markdown" }
    )
    saveMsg(userId, m.message_id)
  }

  if (data === "ad_add_buttons" && userId === ADMIN_ID) {
    const st = userStates.get(userId)
    if (!st) return
    userStates.set(userId, { ...st, state: "ad_awaiting_buttons" })
    const m = await bot.sendMessage(chatId,
`📣 *Кнопки — Шаг 2б*

Формат (каждая кнопка с новой строки):
\`Текст кнопки | https://ссылка\`

Пример:
\`Открыть канал | https://t.me/example\`
\`Подписаться | https://t.me/example2\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "➡️ Без кнопок", callback_data: "ad_no_buttons" }]]
        }
      }
    )
    saveMsg(userId, m.message_id)
  }

  if (data === "ad_no_buttons" && userId === ADMIN_ID) {
    const st = userStates.get(userId)
    if (!st) return
    userStates.set(userId, { ...st, state: "ad_awaiting_frequency" })
    await askAdFrequency(chatId, userId)
  }

  if (data.startsWith("ad_freq_") && userId === ADMIN_ID) {
    const freq = parseInt(data.replace("ad_freq_", ""))
    const st = userStates.get(userId)
    if (!st) return
    st.adFrequency = freq
    userStates.delete(userId)
    await finalizeAd(chatId, userId, st)
  }

  // ── Ad management ──
  if (data.startsWith("ad_toggle_") && userId === ADMIN_ID) {
    const id = parseInt(data.replace("ad_toggle_", ""))
    const ad = ads.find(a => a.id === id)
    if (ad) {
      ad.active = !ad.active
      await bot.answerCallbackQuery(q.id, { text: ad.active ? "✅ Включена" : "⏸ Выключена" })
    }
    await showAdsMenu(chatId, userId)
  }

  if (data.startsWith("ad_delete_") && userId === ADMIN_ID) {
    const id  = parseInt(data.replace("ad_delete_", ""))
    const idx = ads.findIndex(a => a.id === id)
    if (idx !== -1) ads.splice(idx, 1)
    await bot.answerCallbackQuery(q.id, { text: "🗑 Удалено" })
    await showAdsMenu(chatId, userId)
  }

  if (data.startsWith("ad_preview_") && userId === ADMIN_ID) {
    const id = parseInt(data.replace("ad_preview_", ""))
    const ad = ads.find(a => a.id === id)
    if (ad) await sendAdToUser(chatId, userId, ad)
  }

  if (data.startsWith("ad_info_") && userId === ADMIN_ID) {
    const id = parseInt(data.replace("ad_info_", ""))
    const ad = ads.find(a => a.id === id)
    if (!ad) return
    const m = await bot.sendMessage(chatId,
`📣 *Реклама #${ad.id}*

Тип: *${ad.type}*
Статус: ${ad.active ? "✅ Активна" : "⏸ Выключена"}
Показывать каждые: *${ad.showEvery}* загрузок
👁 Показов: *${ad.views || 0}*
📅 Создана: ${new Date(ad.createdAt).toLocaleDateString("ru")}
🔗 Кнопок: ${ad.buttons?.length || 0}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: ad.active ? "⏸ Выключить" : "▶️ Включить", callback_data: `ad_toggle_${ad.id}` },
              { text: "👁 Превью", callback_data: `ad_preview_${ad.id}` }
            ],
            [{ text: "🗑 Удалить", callback_data: `ad_delete_${ad.id}` }],
            [{ text: "◀️ Назад", callback_data: "ads_menu" }]
          ]
        }
      }
    )
    saveMsg(userId, m.message_id)
  }

  // ── Ad broadcast to all users ──
  if (data === "ad_broadcast_choose" && userId === ADMIN_ID) {
    if (!ads.length) {
      const m = await bot.sendMessage(chatId, "❌ Нет объявлений.")
      saveMsg(userId, m.message_id)
      return
    }
    const m = await bot.sendMessage(chatId,
      "📣 Выбери объявление для рассылки:",
      {
        reply_markup: {
          inline_keyboard: [
            ...ads.map(a => ([{
              text: `${a.active ? "✅" : "⏸"} #${a.id} [${a.type}]`,
              callback_data: `ad_send_all_${a.id}`
            }])),
            [{ text: "◀️ Назад", callback_data: "ads_menu" }]
          ]
        }
      }
    )
    saveMsg(userId, m.message_id)
  }

  if (data.startsWith("ad_send_all_") && userId === ADMIN_ID) {
    const id = parseInt(data.replace("ad_send_all_", ""))
    const ad = ads.find(a => a.id === id)
    if (!ad) return

    let sent = 0, failed = 0
    const progress = await bot.sendMessage(chatId, `📣 Рассылаю рекламу #${ad.id}...`)

    for (const [uid] of users) {
      const ok = await sendAdToUser(uid, uid, ad)
      ok ? sent++ : failed++
      await sleep(60)
    }

    bot.editMessageText(
      `✅ Рекламная рассылка завершена!\n\n✔️ Отправлено: *${sent}*\n❌ Не доставлено: *${failed}*`,
      { chat_id: chatId, message_id: progress.message_id, parse_mode: "Markdown" }
    )
  }
})

// ─── ADS MENU ────────────────────────────────────────────────────────────────
async function showAdsMenu(chatId, userId) {
  const active = getActiveAds()
  const adList = ads.length
    ? "\n\n📋 *Объявления:*\n" + ads.map(a =>
        `${a.active ? "✅" : "⏸"} #${a.id} [${a.type}] — 👁 ${a.views || 0} показов`
      ).join("\n")
    : ""

  const adButtons = ads.map(a => ([{
    text: `${a.active ? "✅" : "⏸"} #${a.id} ${a.type}`,
    callback_data: `ad_info_${a.id}`
  }]))

  const m = await bot.sendMessage(chatId,
`📣 *Управление рекламой*

Активных: *${active.length}* / Всего: *${ads.length}*${adList}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Создать объявление",       callback_data: "ad_create"           }],
          [{ text: "📢 Разослать всем пользователям", callback_data: "ad_broadcast_choose" }],
          ...adButtons,
          [{ text: "◀️ Назад в панель",            callback_data: "admin"               }]
        ]
      }
    }
  )
  saveMsg(userId, m.message_id)
}

// ─── ASK FREQUENCY ───────────────────────────────────────────────────────────
async function askAdFrequency(chatId, userId) {
  const m = await bot.sendMessage(chatId,
`📣 *Создание рекламы — Шаг 3/3*

Как часто показывать рекламу?
_(после каждых N загрузок пользователя)_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Каждые 2",  callback_data: "ad_freq_2"  },
            { text: "Каждые 3",  callback_data: "ad_freq_3"  },
            { text: "Каждые 5",  callback_data: "ad_freq_5"  },
          ],
          [
            { text: "Каждые 7",  callback_data: "ad_freq_7"  },
            { text: "Каждые 10", callback_data: "ad_freq_10" },
          ]
        ]
      }
    }
  )
  saveMsg(userId, m.message_id)
}

// ─── FINALIZE AD ─────────────────────────────────────────────────────────────
async function finalizeAd(chatId, userId, st) {
  const ad = {
    id: adIdCounter++,
    type: st.adType,
    text: st.adData.text || "",
    imageUrl: st.adData.imageUrl || null,
    videoUrl: st.adData.videoUrl || null,
    buttons: st.adData.buttons || [],
    active: true,
    showEvery: st.adFrequency || 3,
    createdAt: Date.now(),
    views: 0,
  }
  ads.push(ad)

  const m = await bot.sendMessage(chatId,
`✅ *Реклама #${ad.id} создана!*

Тип: *${ad.type}*
Показывать каждые: *${ad.showEvery}* загрузок
Кнопок: *${ad.buttons.length}*
Статус: ✅ Активна`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👁 Превью",              callback_data: `ad_preview_${ad.id}` }],
          [{ text: "📣 Управление рекламой", callback_data: "ads_menu"            }]
        ]
      }
    }
  )
  saveMsg(userId, m.message_id)
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────
bot.on("message", async msg => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  trackUser(msg)

  // /cancel
  if (msg.text === "/cancel") {
    userStates.delete(userId)
    safeDelete(chatId, msg.message_id)
    const m = await bot.sendMessage(chatId, "❌ Отменено.")
    setTimeout(() => safeDelete(chatId, m.message_id), 3_000)
    return
  }

  const st = userStates.get(userId)

  // ── Broadcast ──
  if (st?.state === "broadcast" && userId === ADMIN_ID) {
    userStates.delete(userId)
    safeDelete(chatId, msg.message_id)

    let sent = 0, failed = 0
    const progress = await bot.sendMessage(chatId, "🚀 Рассылка началась...")

    for (const [id] of users) {
      try {
        if (msg.photo) {
          const fileId = msg.photo[msg.photo.length - 1].file_id
          await bot.sendPhoto(id, fileId, { caption: msg.caption, parse_mode: "Markdown" })
        } else if (msg.video) {
          await bot.sendVideo(id, msg.video.file_id, { caption: msg.caption, parse_mode: "Markdown" })
        } else if (msg.text) {
          await bot.sendMessage(id, msg.text, { parse_mode: "Markdown" })
        }
        sent++
        await sleep(60)
      } catch { failed++ }
    }

    bot.editMessageText(
      `✅ Рассылка завершена!\n\n✔️ Отправлено: *${sent}*\n❌ Не доставлено: *${failed}*`,
      { chat_id: chatId, message_id: progress.message_id, parse_mode: "Markdown" }
    )
    return
  }

  // ── Ad creation: awaiting content ──
  if (st?.state === "ad_awaiting_content" && userId === ADMIN_ID) {
    const adData = {}

    if (st.adType === "text") {
      if (!msg.text) { bot.sendMessage(chatId, "❌ Нужен текст."); return }
      adData.text = msg.text
    } else if (st.adType === "photo") {
      if (msg.photo) {
        adData.imageUrl = msg.photo[msg.photo.length - 1].file_id
        adData.text = msg.caption || ""
      } else if (msg.text) {
        adData.text = msg.text
      } else {
        bot.sendMessage(chatId, "❌ Нужно фото или текст."); return
      }
    } else if (st.adType === "video") {
      if (msg.video) {
        adData.videoUrl = msg.video.file_id
        adData.text = msg.caption || ""
      } else if (msg.text) {
        adData.text = msg.text
      } else {
        bot.sendMessage(chatId, "❌ Нужно видео или текст."); return
      }
    }

    safeDelete(chatId, msg.message_id)
    userStates.set(userId, { ...st, state: "ad_awaiting_buttons_ask", adData })

    const m = await bot.sendMessage(chatId,
      "✅ Контент получен!\n\nДобавить кнопки-ссылки к объявлению?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить кнопки", callback_data: "ad_add_buttons" }],
            [{ text: "➡️ Без кнопок",      callback_data: "ad_no_buttons"  }]
          ]
        }
      }
    )
    saveMsg(userId, m.message_id)
    return
  }

  // ── Ad creation: awaiting buttons ──
  if (st?.state === "ad_awaiting_buttons" && userId === ADMIN_ID) {
    if (!msg.text) { bot.sendMessage(chatId, "❌ Нужен текст кнопок."); return }

    const buttons = msg.text.split("\n")
      .map(line => {
        const parts = line.split("|").map(p => p.trim())
        return (parts.length >= 2 && parts[1].startsWith("http"))
          ? { text: parts[0], url: parts[1] }
          : null
      })
      .filter(Boolean)

    if (!buttons.length) {
      bot.sendMessage(chatId,
        "❌ Неверный формат. Пример:\n`Открыть канал | https://t.me/example`",
        { parse_mode: "Markdown" }
      )
      return
    }

    safeDelete(chatId, msg.message_id)
    userStates.set(userId, { ...st, state: "ad_awaiting_frequency", adData: { ...st.adData, buttons } })
    await askAdFrequency(chatId, userId)
    return
  }

  // ── TikTok links ──
  if (!msg.text) return
  const links = extractTikTokLinks(msg.text)
  if (!links.length) return

  if (antiSpam(userId)) {
    const m = await bot.sendMessage(chatId, "⏳ Подожди секунду...")
    setTimeout(() => safeDelete(chatId, m.message_id), 2_000)
    return
  }

  safeDelete(chatId, msg.message_id)

  for (const link of links) {
    addQueue(async () => {
      const waitMsg = await bot.sendMessage(chatId, "⏳ Загружаю...")
      saveMsg(userId, waitMsg.message_id)

      try {
        // ── Cache hit ──
        const cached = cache.get(link)
        if (isCacheValid(cached)) {
          await clearChat(chatId, userId)

          if (cached.type === "video") {
            const sent = await bot.sendVideo(chatId, cached.data.file_id, cached.data.options)
            saveMsg(userId, sent.message_id)
          } else if (cached.type === "photo") {
            const sent = await bot.sendMediaGroup(chatId, cached.data)
            sent.forEach(m => saveMsg(userId, m.message_id))
          }

          const u = users.get(userId)
          if (u) { u.downloads++; await maybeShowAd(chatId, userId, u) }
          return
        }

        // ── Fetch ──
        const item = await fetchTikTok(link)

        const author    = item.author?.nickname  || "Unknown"
        const authorTag = item.author?.unique_id ? `@${item.author.unique_id}` : ""
        const views     = formatNumber(item.play_count)
        const likes     = formatNumber(item.digg_count)
        const comments  = formatNumber(item.comment_count)
        const shares    = formatNumber(item.share_count)
        const desc      = item.title ? `\n📝 ${item.title.slice(0, 100)}` : ""
        const caption   = `📥 @${BOT_USERNAME}\n\n👤 ${author} ${authorTag}${desc}\n\n👁 ${views}  ❤️ ${likes}  💬 ${comments}  🔄 ${shares}`

        await clearChat(chatId, userId)

        // ── Photos ──
        if (item.images && item.images.length) {
          const photoUrls = item.images.slice(0, 10)
          const media = photoUrls.map((img, i) => ({
            type: "photo",
            media: typeof img === "object" ? (img.url || img) : img,
            ...(i === 0 ? { caption, parse_mode: "Markdown" } : {})
          }))

          try {
            const sentMedia = await bot.sendMediaGroup(chatId, media)
            sentMedia.forEach(m => saveMsg(userId, m.message_id))
            cache.set(link, { type: "photo", data: media, ts: Date.now() })
          } catch {
            for (let i = 0; i < photoUrls.length; i++) {
              const url = typeof photoUrls[i] === "object" ? photoUrls[i].url : photoUrls[i]
              try {
                const s = await bot.sendPhoto(chatId, url, {
                  caption: i === 0 ? caption : undefined,
                  parse_mode: "Markdown"
                })
                saveMsg(userId, s.message_id)
              } catch {}
            }
          }

          const u = users.get(userId)
          if (u) { u.downloads++; await maybeShowAd(chatId, userId, u) }
          return
        }

        // ── Video ──
        const videoUrl = item.hdplay || item.play
        if (!videoUrl) throw new Error("No video URL")

        const sent = await bot.sendVideo(chatId, videoUrl, {
          caption,
          parse_mode: "Markdown",
          supports_streaming: true,
          reply_markup: videoKeyboard
        })
        saveMsg(userId, sent.message_id)

        cache.set(link, {
          type: "video",
          data: {
            file_id: sent.video.file_id,
            options: { caption, parse_mode: "Markdown", reply_markup: videoKeyboard }
          },
          ts: Date.now()
        })

        const u = users.get(userId)
        if (u) { u.downloads++; await maybeShowAd(chatId, userId, u) }

      } catch (e) {
        console.error("Download error:", e.message)
        await clearChat(chatId, userId)
        const err = await bot.sendMessage(chatId,
          "❌ Не удалось загрузить.\n\n• Видео приватное\n• Ссылка недействительна\n• Сбой API\n\nПопробуй позже."
        )
        saveMsg(userId, err.message_id)
        setTimeout(() => safeDelete(chatId, err.message_id), 15_000)
      }
    })
  }
})

// ─── ERROR HANDLING ──────────────────────────────────────────────────────────
process.on("unhandledRejection", err => console.error("Unhandled:", err))
process.on("uncaughtException",  err => console.error("Exception:", err))
bot.on("polling_error", err => console.error("Polling:", err.message))
