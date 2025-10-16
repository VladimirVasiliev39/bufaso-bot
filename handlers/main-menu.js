const { getCategories, getProductsByCategory, getProductById, getProductWithVariant, getCategoryName } = require('../config/google-sheets');
const { buildMainMenu, buildProductsKeyboard, buildPriceVariantsKeyboard, formatPriceVariants } = require('../utils/keyboard-builder');
const { addToCart, formatCartMessage, getCartItemsCount, getCartTotal, formatMiniCart } = require('../utils/cart-manager');
const { getProductImage } = require('../utils/image-handler');
const { createOrder, notifyAdmin } = require('../utils/order-manager');

// 🔥 Отслеживаем первый запуск для каждого пользователя
const userFirstLaunch = new Set();

function handleMainMenu(bot) {
  // ========== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ==========
  bot.on('text', async (ctx) => {
    try {
      if (!ctx.session.checkoutStep) return;

      const text = ctx.message.text.trim();
      
      switch (ctx.session.checkoutStep) {
        case 'waiting_name':
          ctx.session.checkoutData = {
            name: text,
            items: ctx.session.cart ? [...ctx.session.cart] : [],
            total: getCartTotal(ctx.session.cart || [])
          };
          
          ctx.session.checkoutStep = 'waiting_phone';
          await ctx.reply(`📞 Отлично, ${text}! Теперь укажите ваш телефон для связи:`);
          break;
          
        case 'waiting_phone':
          ctx.session.checkoutData.phone = text;
          ctx.session.checkoutStep = 'waiting_address';
          await ctx.reply('🏠 Теперь укажите адрес доставки:');
          break;
          
        case 'waiting_address':
          ctx.session.checkoutData.address = text;
          
          ctx.session.checkoutData.telegramUsername = ctx.from.username ? 
            `@${ctx.from.username}` : `ID: ${ctx.from.id}`;
          ctx.session.checkoutData.userId = ctx.from.id;
          
          const userChatId = ctx.from.id;
          console.log('🔍 Сохраняем userChatId:', userChatId, 'тип:', typeof userChatId);
          ctx.session.checkoutData.userChatId = userChatId;
          
          const orderId = await createOrder(ctx.session.checkoutData);
          await notifyAdmin(orderId, ctx.session.checkoutData, bot);
          
          ctx.session.cart = [];
          delete ctx.session.checkoutStep;
          delete ctx.session.checkoutData;
          
          await ctx.reply(`🎉 Заказ #${orderId} успешно оформлен!\n\nОжидайте звонка для подтверждения. Спасибо за заказ!`);
          
          const categories = await getCategories();
          const keyboard = buildMainMenu(categories, 0);
          
          await ctx.replyWithPhoto(
            { source: './assets/vitrina.jpg' },
            {
              caption: '🍕 Меню',
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard }
            }
          );
          break;
      }
      
    } catch (error) {
      console.error('❌ Ошибка обработки текста:', error);
      await ctx.reply('⚠️ Произошла ошибка при оформлении заказа. Попробуйте позже.');
      delete ctx.session.checkoutStep;
      delete ctx.session.checkoutData;
    }
  });

  // ========== ОБРАБОТЧИКИ ==========
  
  // 🔥 1. САМЫЕ КОНКРЕТНЫЕ ОБРАБОТЧИКИ
  
  // Обработчик выбора варианта цены
  bot.action(/product_variant_(\d+)_(\d+)_(.+)/, async (ctx) => {
    try {
      console.log(`🎯 СРАБОТАЛ ОБРАБОТЧИК product_variant_!`);
      const productId = ctx.match[1];
      const categoryId = ctx.match[2];
      const variantId = ctx.match[3];
      
      console.log(`🔍 Выбран вариант: product=${productId}, category=${categoryId}, variant=${variantId}`);
      
      const product = await getProductWithVariant(productId, variantId);
      
      if (!product) {
        await ctx.answerCbQuery('❌ Вариант товара не найден');
        return;
      }
      
      const quantity = 1;
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}_${variantId}` },
          { text: ` ${quantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}_${variantId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${quantity}_${variantId}` }
        ],
        [
          { text: '⬅️ Назад к вариантам', callback_data: `product_${productId}` }
        ]
      ];
      
      const priceText = `💰 Цена: <b>${product.selectedPrice}р</b> Ед.изм.: <b>${product.selectedEdIzm}</b>`;
      
      let imagePath;
      try {
        imagePath = getProductImage(product.id, product.image);
      } catch (error) {
        console.log('⚠️ Не удалось загрузить фото, используем заглушку');
        imagePath = './assets/product_default.jpg';
      }
      
      // ✅ ПРАВИЛЬНОЕ ИСПОЛЬЗОВАНИЕ parse_mode для editMessageMedia
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: imagePath },
          caption: `<b>${product.name}</b>\n ${product.description}\n\n${priceText}\n\n🛒 Количество: <b>${quantity}</b>`,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Ошибка в product_variant_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка выбора варианта');
    }
  });

  // Обработчики количества и корзины
  bot.action(/increase_(\d+)_(\d+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const categoryId = ctx.match[2];
      const variantId = ctx.match[3];
      
      console.log(`🔍 Увеличение: product=${productId}, category=${categoryId}, variant=${variantId}`);
      
      const messageText = ctx.update.callback_query.message.caption;
      const currentMatch = messageText.match(/Количество:.*?<b>(\d+)<\/b>/);
      let quantity = currentMatch ? parseInt(currentMatch[1]) : 1;
      
      const newQuantity = Math.min(quantity + 1, 10);
      
      if (newQuantity === quantity) {
        await ctx.answerCbQuery('❌ Максимальное количество: 10');
        return;
      }
      
      const product = await getProductWithVariant(productId, variantId);
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}_${variantId}` },
          { text: ` ${newQuantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}_${variantId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${newQuantity}_${variantId}` }
        ],
        [
          { text: '⬅️ Назад к вариантам', callback_data: `product_${productId}` }
        ]
      ];
      
      const priceText = `💰 Цена: <b>${product.selectedPrice}р</b> Ед.изм.: <b>${product.selectedEdIzm}</b>`;
      
      await ctx.editMessageCaption(
        `🍕 <b>${product.name}</b>\n ${product.description}\n\n${priceText}\n\n🛒 Количество: <b>${newQuantity}</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Ошибка в increase_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action(/decrease_(\d+)_(\d+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const categoryId = ctx.match[2];
      const variantId = ctx.match[3];
      
      console.log(`🔍 Уменьшение: product=${productId}, category=${categoryId}, variant=${variantId}`);
      
      const messageText = ctx.update.callback_query.message.caption;
      const currentMatch = messageText.match(/Количество:.*?<b>(\d+)<\/b>/);
      let quantity = currentMatch ? parseInt(currentMatch[1]) : 1;
      
      const newQuantity = Math.max(quantity - 1, 1);
      
      if (newQuantity === quantity) {
        await ctx.answerCbQuery('❌ Минимальное количество: 1');
        return;
      }
      
      const product = await getProductWithVariant(productId, variantId);
      
      const quantityKeyboard = [
        [
          { text: '➖', callback_data: `decrease_${productId}_${categoryId}_${variantId}` },
          { text: ` ${newQuantity} `, callback_data: `display_quantity_${productId}` },
          { text: '➕', callback_data: `increase_${productId}_${categoryId}_${variantId}` }
        ],
        [
          { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${newQuantity}_${variantId}` }
        ],
        [
          { text: '⬅️ Назад к вариантам', callback_data: `product_${productId}` }
        ]
      ];
      
      const priceText = `💰 Цена: <b>${product.selectedPrice}р</b> Ед.изм.: <b>${product.selectedEdIzm}</b>`;
      
      await ctx.editMessageCaption(
        `🍕 <b>${product.name}</b>\n\n\n${priceText}\n\n🛒 Количество: <b>${newQuantity}</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: quantityKeyboard }
        }
      );
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Ошибка в decrease_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action(/add_to_cart_(\d+)_(\d+)_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      const quantity = parseInt(ctx.match[2]);
      const variantId = ctx.match[3];
      
      console.log(`🔍 Добавление в корзину: product=${productId}, quantity=${quantity}, variant=${variantId}`);
      
      const product = await getProductWithVariant(productId, variantId);
      
      if (!product) {
        await ctx.answerCbQuery('❌ Товар не найден');
        return;
      }
      
      ctx.session.cart = addToCart(
        ctx.session.cart || [],
        product.id, 
        product.name, 
        product.selectedPrice,
        quantity,
        product.selectedEdIzm,
        variantId
      );
      
      await ctx.answerCbQuery(`✅ ${product.name} (${product.selectedEdIzm}) × ${quantity} шт. добавлено в корзину!`);
      
      const products = await getProductsByCategory(product.categoryId);
      const categoryName = await getCategoryName(product.categoryId);
      const miniCart = formatMiniCart(ctx.session.cart || []);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}${miniCart}`,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка в add_to_cart_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка добавления в корзину');
    }
  });

  // 🔥 2. ОБРАБОТЧИКИ КАРТОЧЕК ТОВАРОВ
  
  bot.action(/product_(.+)/, async (ctx) => {
    try {
      const productId = ctx.match[1];
      console.log(`🔍 Обработчик product_: ID=${productId}`);
      
      const product = await getProductById(productId);
      
      if (!product) {
        await ctx.answerCbQuery('❌ Товар не найден');
        return;
      }
      
      const priceVariantsText = formatPriceVariants(product.variants);
      
      let imagePath;
      try {
        imagePath = getProductImage(product.id, product.image);
      } catch (error) {
        console.log('⚠️ Не удалось загрузить фото, используем заглушку');
        imagePath = './assets/product_default.jpg';
      }
      
      if (product.hasMultipleVariants) {
        console.log(`🔧 Товар ${productId} имеет ${product.variants.length} вариантов, показываем выбор`);
        
        const variantKeyboard = buildPriceVariantsKeyboard(product.variants, productId, product.categoryId);
        
        await ctx.editMessageMedia(
          {
            type: 'photo',
            media: { source: imagePath },
            caption: `<b>${product.name}</b>\n ${product.description}${priceVariantsText}\n\n💰 Выберите вариант:`,
            parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
          },
          {
            reply_markup: { inline_keyboard: variantKeyboard }
          }
        );
      } else {
        console.log(`🔧 Товар ${productId} имеет 1 вариант, сразу показываем количество`);
        const quantity = 1;
        const variantId = product.variants[0].variantId;
        
        const quantityKeyboard = [
          [
            { text: '➖', callback_data: `decrease_${productId}_${product.categoryId}_${variantId}` },
            { text: ` ${quantity} `, callback_data: `display_quantity_${productId}` },
            { text: '➕', callback_data: `increase_${productId}_${product.categoryId}_${variantId}` }
          ],
          [
            { text: '🛒 Добавить в корзину', callback_data: `add_to_cart_${productId}_${quantity}_${variantId}` }
          ],
          [
            { text: '⬅️ Назад к товарам', callback_data: `back_to_products_${product.categoryId}` }
          ]
        ];
        
        await ctx.editMessageMedia(
          {
            type: 'photo', 
            media: { source: imagePath },
            caption: `<b>${product.name}</b>\n ${product.description}${priceVariantsText}\n\n🛒 Количество: <b>${quantity}</b>`,
            parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
          },
          {
            reply_markup: { inline_keyboard: quantityKeyboard }
          }
        );
      }
      
      await ctx.answerCbQuery();
      
    } catch (error) {
      console.error('❌ Ошибка в product_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка загрузки товара');
    }
  });

  // 🔥 3. ОБЩИЕ ОБРАБОТЧИКИ
  
  bot.action(/back_to_products_(.+)/, async (ctx) => {
    try {
      const categoryId = ctx.match[1];
      const products = await getProductsByCategory(categoryId);
      const categoryName = await getCategoryName(categoryId);
      const miniCart = formatMiniCart(ctx.session.cart || []);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}${miniCart}`,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('❌ Ошибка в back_to_products_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action('back_to_categories', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const categories = await getCategories();
      const cartCount = getCartItemsCount(ctx.session.cart || []);
      const keyboard = buildMainMenu(categories, cartCount);
      
      const userId = ctx.from.id;
      let caption = 'Меню';
      
      if (!userFirstLaunch.has(userId)) {
        caption = 'Добро пожаловать в каталог!\nВыберите категорию:';
        userFirstLaunch.add(userId);
      }
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: caption,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка в back_to_categories:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action(/category_(.+)/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const categoryId = ctx.match[1];
      const products = await getProductsByCategory(categoryId);
      
      if (products.length === 0) {
        await ctx.answerCbQuery('😔 Нет товаров');
        return;
      }
      
      const categoryName = await getCategoryName(categoryId);
      const keyboard = buildProductsKeyboard(products);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: `🍕 ${categoryName}`,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка в category_:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action('cart', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      
      const cart = ctx.session.cart || [];
      const cartMessage = formatCartMessage(cart);
      const cartKeyboard = [];
      
      if (cart.length > 0) {
        cartKeyboard.push([
          { text: '🧹 Очистить корзину', callback_data: 'clear_cart' }
        ]);
        cartKeyboard.push([
          { text: '📦 Оформить заказ', callback_data: 'start_checkout' }
        ]);
      }
      
      cartKeyboard.push([
        { text: '⬅️ Вернуться к меню', callback_data: 'back_to_categories' }
      ]);
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: cartMessage,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: cartKeyboard }
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка в cart:', error);
      await ctx.answerCbQuery('⚠️ Ошибка загрузки корзины');
    }
  });

  bot.action('clear_cart', async (ctx) => {
    try {
      ctx.session.cart = [];
      await ctx.answerCbQuery('✅ Корзина очищена');
      
      const cartMessage = formatCartMessage([]);
      const cartKeyboard = [
        [{ text: '⬅️ Вернуться к меню', callback_data: 'back_to_categories' }]
      ];
      
      await ctx.editMessageMedia(
        {
          type: 'photo',
          media: { source: './assets/vitrina.jpg' },
          caption: cartMessage,
          parse_mode: 'HTML' // ✅ ДОБАВЛЕНО СЮДА
        },
        {
          reply_markup: { inline_keyboard: cartKeyboard }
        }
      );
      
    } catch (error) {
      console.error('❌ Ошибка в clear_cart:', error);
      await ctx.answerCbQuery('⚠️ Ошибка очистки корзины');
    }
  });

  bot.action('start_checkout', async (ctx) => {
    try {
      const cart = ctx.session.cart || [];
      
      if (cart.length === 0) {
        await ctx.answerCbQuery('🛒 Корзина пуста!');
        return;
      }
      
      await ctx.answerCbQuery();
      await ctx.reply('📋 Оформление заказа\n\nКак к вам обращаться?');
      
      ctx.session.checkoutStep = 'waiting_name';
      
    } catch (error) {
      console.error('❌ Ошибка в start_checkout:', error);
      await ctx.answerCbQuery('⚠️ Ошибка');
    }
  });

  bot.action(/display_quantity_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
  });
}

module.exports = { handleMainMenu };