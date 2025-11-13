require('dotenv').config();
// 🔧 Polyfill for Node.js 16 (безопасно для продакшена)
let fetch;
if (typeof global.fetch === 'function') {
  // Используем встроенный fetch в Node.js 18+
  fetch = global.fetch;
} else {
  // Используем node-fetch для Node.js 16
  fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

console.log('=== BUFASO BOT STARTING ===');
console.log('Node environment:', process.env.NODE_ENV);
console.log('Render check:', process.env.RENDER ? '✅ Running on Render' : '❌ Local');

const { Telegraf, session } = require('telegraf');
const express = require('express');

const { handleStart } = require('./handlers/start');
const { handleMainMenu } = require('./handlers/main-menu');
const { setupOrderHandlers } = require('./utils/order-manager');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// ✅ ДОБАВЛЯЕМ: Синяя кнопка меню
bot.telegram.setMyCommands([
  { command: 'start', description: 'Перезапустить бота' },
  { command: 'admin', description: 'Админ-панель' }
]);

// ✅ ДОБАВЛЯЕМ: Обработчик команды /admin
bot.command('admin', async (ctx) => {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  
  if (ctx.chat.id.toString() === adminChatId) {
    await ctx.reply('⚙️ Админ-панель в разработке...');
  } else {
    await ctx.reply('❌ Доступ запрещен');
  }
});

// 🔧 Keep Render Alive System
app.get('/', (req, res) => {
  res.send('🤖 BuFaso Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BuFaso Bot',
    uptime: process.uptime()
  });
});

// 🔧 УПРОЩАЕМ: Keep Alive только для продакшена
const startKeepAlive = () => {
  if (!process.env.RENDER) return; // Только на Render
  
  const pingInterval = 14 * 60 * 1000; // 14 минут
  const startDelay = 1 * 60 * 1000; // 1 минута
  
  console.log('🔄 Keep-alive system started');

  const pingServer = async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://bufaso-bot.onrender.com';
      await fetch(`${baseUrl}/health`);
      console.log('🔄 Auto-ping:', new Date().toLocaleTimeString());
    } catch (error) {
      console.log('⚠️ Ping failed:', error.message);
    }
  };
  
  setTimeout(pingServer, startDelay);
  setInterval(pingServer, pingInterval);
};

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

// Запуск Express сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
  console.log('🚀 BuFaso_bot запущен в продакшене!');
  
  // 🔧 Запускаем keep-alive только на Render
  if (process.env.RENDER) {
    startKeepAlive();
  }
});

// Элегантное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));