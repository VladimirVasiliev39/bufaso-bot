const { getCategories } = require('../config/google-sheets');
const { buildMainMenu } = require('../utils/keyboard-builder');

async function handleStart(bot) {
  bot.start(async (ctx) => {
    try {
      // Получаем категории из Google Sheets
      const categories = await getCategories();
      
      // Отправляем фото витрины
      await ctx.replyWithPhoto({
        source: './assets/vitrina.jpg'
      }, {
        caption: '🍕 Добро пожаловать в BuFaso!\nВыберите категорию:',
        reply_markup: {
          inline_keyboard: buildMainMenu(categories)
        }
      });
      
    } catch (error) {
      console.error('Error in start handler:', error);
      await ctx.reply('⚠️ Произошла ошибка. Попробуйте позже.');
    }
  });
}

module.exports = { handleStart };