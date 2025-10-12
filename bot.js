require('dotenv').config();
console.log('=== BUFASO BOT STARTING ===');
console.log('Node environment:', process.env.NODE_ENV);
console.log('Render check:', process.env.RENDER ? '✅ Running on Render' : '❌ Local');

const { Telegraf, session } = require('telegraf');
const express = require('express'); // ← ДОБАВИЛИ EXPRESS

const { handleStart } = require('./handlers/start');
const { handleMainMenu } = require('./handlers/main-menu');
const { setupOrderHandlers } = require('./utils/order-manager');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express(); // ← СОЗДАЛИ EXPRESS APP

// Инициализация сессии с корзиной
bot.use(session({
  defaultSession: () => ({
    cart: []
  })
}));

// Регистрация обработчиков
handleStart(bot);
handleMainMenu(bot);
setupOrderHandlers(bot);

// Запуск бота
bot.launch().then(() => {
  console.log('🚀 BuFaso_bot запущен в продакшене!');
});

// Express сервер для Railway (ВАЖНО ДЛЯ ХОСТИНГА)
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('🤖 BuFaso Bot is running!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Элегантное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));