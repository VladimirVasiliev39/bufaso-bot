const { ProductPublisher } = require('../utils/publisher');

// Создаем экземпляр публикатора
const publisher = new ProductPublisher();
//========================================================
function setupPublisherHandlers(bot) {
  console.log('🔧 Настройка обработчиков публикации...');
  
  // Устанавливаем бот для публикатора
  publisher.setBot(bot);
  console.log('✅ Бот установлен для публикатора');

// 🔥 ДИАГНОСТИКА: Обработчик ВСЕХ сообщений для отладки (с next!)
bot.on('message', (ctx, next) => {
  if (ctx.message.text && ctx.message.text.startsWith('/')) {
    console.log(`📨 КОМАНДА: "${ctx.message.text}" от ${ctx.from.id} (username: ${ctx.from.username})`);
  }
  return next(); // 🔥 ВАЖНО: передаем управление дальше
});

  // 🔥 Обработчик команды публикации
  bot.command('publish', async (ctx) => {
    console.log(`🔔 Команда /publish получена от ${ctx.from.id}`);
    
    const adminChatId = process.env.ADMIN_CHAT_ID;
    console.log(`🔍 Проверка прав: ${ctx.chat.id} == ${adminChatId}`);
    
    if (ctx.chat.id.toString() !== adminChatId) {
      console.log('❌ Доступ запрещен - не админ');
      await ctx.reply('❌ Доступ запрещен');
      return;
    }

    console.log('✅ Доступ разрешен - админ');
    
    try {
      await ctx.reply('🔄 Запуск публикации товаров...');
      
      const result = await publisher.publishUnpublishedProducts();
      
      if (result.error) {
        await ctx.reply(`❌ Ошибка: ${result.error}`);
      } else {
        await ctx.reply(`✅ Публикация завершена!\nОпубликовано: ${result.published}/${result.total}`);
      }

    } catch (error) {
      console.error('❌ Ошибка команды публикации:', error);
      await ctx.reply('⚠️ Произошла ошибка при публикации');
    }
  });

  // 🔥 Обработчик предпросмотра
  bot.command('preview', async (ctx) => {
    console.log(`🔔 Команда /preview получена от ${ctx.from.id}`);
    
    const adminChatId = process.env.ADMIN_CHAT_ID;
    
    if (ctx.chat.id.toString() !== adminChatId) {
      await ctx.reply('❌ Доступ запрещен');
      return;
    }

    const args = ctx.message.text.split(' ');
    const productId = args[1];
    
    if (!productId) {
      await ctx.reply('ℹ️ Использование: /preview [ID_товара]');
      return;
    }

    await publisher.previewProduct(productId, ctx);
  });
//=============================================================
  // 🔥 Обработчик публикации через callback
  bot.action(/publish_(.+)/, async (ctx) => {
    console.log(`🔔 Callback publish_ от пользователя ${ctx.from.id}`);
    
    const adminChatId = process.env.ADMIN_CHAT_ID;
    
    if (ctx.chat.id.toString() !== adminChatId) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const productId = ctx.match[1];
    console.log(`🔍 ProductId из callback: ${productId}`);
    
    try {
      await ctx.answerCbQuery('📤 Публикую...');
      
      const products = await publisher.getUnpublishedProducts();
      console.log(`📦 Найдено неопубликованных товаров: ${products.length}`);
      
      const product = products.find(p => p.productId === productId);
      
      if (!product) {
        await ctx.reply('❌ Товар не найден');
        return;
      }

      const result = await publisher.publishProduct(product);
      console.log(`📊 Результат публикации:`, result);
      
      if (result.success) {
        await publisher.markAsPublished(product.rowIndex);
        await ctx.editMessageCaption(
          `✅ <b>ОПУБЛИКОВАНО</b>\n\n${ctx.update.callback_query.message.caption}`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply(`❌ Ошибка публикации: ${result.error}`);
      }

    } catch (error) {
      console.error('❌ Ошибка публикации:', error);
      await ctx.answerCbQuery('⚠️ Ошибка публикации');
    }
  });

  // 🔥 Обработчик отмены
  bot.action('cancel_publish', async (ctx) => {
    console.log(`🔔 Callback cancel_publish от пользователя ${ctx.from.id}`);
    await ctx.answerCbQuery('❌ Отменено');
    await ctx.deleteMessage();
  });

  console.log('✅ Обработчики публикации настроены');
  console.log('📝 Зарегистрированные команды: /publish, /preview');
}

module.exports = { setupPublisherHandlers };