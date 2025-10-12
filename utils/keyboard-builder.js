// Утилиты для построения клавиатур
function buildMainMenu(categories, cartCount = 0) {
  const keyboard = [];
  
  // Группируем категории по 2 в ряд
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    
    if (categories[i]) {
      row.push({
        text: categories[i][1],
        callback_data: `category_${categories[i][0]}`
      });
    }
    
    if (categories[i + 1]) {
      row.push({
        text: categories[i + 1][1],
        callback_data: `category_${categories[i + 1][0]}`
      });
    }
    
    keyboard.push(row);
  }
  
  // 🔥 Кнопка корзины ВСЕГДА внизу
  keyboard.push([
    { text: `🛒 Корзина (${cartCount} шт)`, callback_data: 'cart' }
  ]);
  
  return keyboard;
}

function buildProductsKeyboard(products) {
  const keyboard = [];
  
  // Группируем товары по 2 в ряд
  for (let i = 0; i < products.length; i += 2) {
    const row = [];
    
    if (products[i]) {
      row.push({
        text: products[i][2],
        callback_data: `product_${products[i][0]}`
      });
    }
    
    if (products[i + 1]) {
      row.push({
        text: products[i + 1][2],
        callback_data: `product_${products[i + 1][0]}`
      });
    }
    
    keyboard.push(row);
  }
  
  // 🔥 Кнопки ВСЕГДА внизу
  keyboard.push([
    { text: '🛒 Корзина', callback_data: 'cart' },
    { text: '⬅️ Категории', callback_data: 'back_to_categories' }
  ]);
  
  return keyboard;
}

module.exports = { buildMainMenu, buildProductsKeyboard };