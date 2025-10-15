// 🔥 Функция для обрезки длинного текста
function truncateText(text, maxLength = 20) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Построение главного меню (категории)
function buildMainMenu(categories, cartItemsCount = 0) {
  const keyboard = [];
  const cartButtonText = cartItemsCount > 0 ? `🛒 Корзина (${cartItemsCount})` : '🛒 Корзина';

  // Добавляем категории в виде кнопок (2 в ряд)
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    
    // Первая кнопка в ряду
    if (categories[i]) {
      row.push({
        text: truncateText(categories[i][1], 15),
        callback_data: `category_${categories[i][0]}`
      });
    }
    
    // Вторая кнопка в ряду (если есть)
    if (categories[i + 1]) {
      row.push({
        text: truncateText(categories[i + 1][1], 15),
        callback_data: `category_${categories[i + 1][0]}`
      });
    }
    
    keyboard.push(row);
  }

  // Добавляем кнопку корзины
  keyboard.push([{ text: cartButtonText, callback_data: 'cart' }]);

  return keyboard;
}

// 🔥 ОБНОВЛЕННАЯ ФУНКЦИЯ: Клавиатура товаров (2 в ряд с единицами измерения)
function buildProductsKeyboard(products) {
  const keyboard = [];

  // Добавляем товары в виде кнопок (2 в ряд)
  for (let i = 0; i < products.length; i += 2) {
    const row = [];
    
    // Первая кнопка в ряду
    if (products[i]) {
      let price = parseFloat(products[i][3]);
      let priceText = Number.isInteger(price) ? price.toString() : price.toFixed(2);
      let productName = truncateText(products[i][2], 20); // Обрезаем длинные названия до 15
      let edIzm = products[i][6] || 'шт'; // Берем единицу измерения из колонки G
      
      row.push({
        text: `${productName}\n${priceText}р / ${truncateText(edIzm, 8)}`,//обрезаем до 6
        callback_data: `product_${products[i][0]}`
      });
    }
    
    // Вторая кнопка в ряду (если есть)
    if (products[i + 1]) {
      let price = parseFloat(products[i + 1][3]);
      let priceText = Number.isInteger(price) ? price.toString() : price.toFixed(2);
      let productName = truncateText(products[i + 1][2], 15); // Обрезаем длинные названия
      let edIzm = products[i + 1][6] || 'шт'; // Берем единицу измерения из колонки G
      
      row.push({
        text: `${productName}\n${priceText}р / ${truncateText(edIzm, 6)}`,
        callback_data: `product_${products[i + 1][0]}`
      });
    }
    
    keyboard.push(row);
  }

  // Добавляем кнопку возврата в меню
  keyboard.push([{ text: '⬅️ Назад к меню', callback_data: 'back_to_categories' }]);

  return keyboard;
}

// 🔥 ОБНОВЛЕННАЯ ФУНКЦИЯ: Клавиатура для выбора вариантов цен (2 в ряд)
function buildPriceVariantsKeyboard(variants, productId, categoryId) {
  const keyboard = [];
  
  // Добавляем кнопки с вариантами цен (2 в ряд)
  for (let i = 0; i < variants.length; i += 2) {
    const row = [];
    
    // Первая кнопка в ряду
    if (variants[i]) {
      const variant1 = variants[i];
      let priceText1 = Number.isInteger(variant1.price) ? 
        variant1.price.toString() : 
        variant1.price.toFixed(2);
      
      row.push({
        text: `${priceText1}р / ${truncateText(variant1.ed_izm, 8)}`,
        callback_data: `product_variant_${productId}_${categoryId}_${variant1.variantId}`
      });
    }
    
    // Вторая кнопка в ряду (если есть)
    if (variants[i + 1]) {
      const variant2 = variants[i + 1];
      let priceText2 = Number.isInteger(variant2.price) ? 
        variant2.price.toString() : 
        variant2.price.toFixed(2);
      
      row.push({
        text: `${priceText2}р / ${truncateText(variant2.ed_izm, 8)}`,
        callback_data: `product_variant_${productId}_${categoryId}_${variant2.variantId}`
      });
    }
    
    keyboard.push(row);
  }
  
  // Добавляем кнопку "Назад"
  keyboard.push([
    { text: '⬅️ Назад к товарам', callback_data: `back_to_products_${categoryId}` }
  ]);
  
  return keyboard;
}

// 🔥 НОВАЯ ФУНКЦИЯ: Форматирование списка цен для карточки товара
function formatPriceVariants(variants) {
  if (variants.length === 0) return '';
  
  let priceText = '\n\n<b>💰 Доступные варианты цены:\n</b>';
  
  variants.forEach((variant, index) => {
    let price = Number.isInteger(variant.price) ? 
      variant.price.toString() : 
      variant.price.toFixed(2);
    
    priceText += `${index + 1}. ${price} руб / ${variant.ed_izm}\n`;
  });
  
  return priceText;
}

module.exports = { 
  buildMainMenu, 
  buildProductsKeyboard, 
  buildPriceVariantsKeyboard,
  formatPriceVariants  // ← ДОБАВЛЯЕМ НОВУЮ ФУНКЦИЮ В ЭКСПОРТ
};