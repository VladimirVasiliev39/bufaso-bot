// 🔥 ОБНОВЛЕННАЯ ФУНКЦИЯ: Добавление в корзину с поддержкой единиц измерения
function addToCart(sessionCart, productId, productName, price, quantity, edIzm = 'шт', variantId = 'main') {
  const cart = sessionCart || [];
  const existingItem = cart.find(item => 
    item.productId === productId && item.variantId === variantId
  );
  
  if (existingItem) {
    existingItem.quantity += parseInt(quantity);
    existingItem.totalPrice = existingItem.quantity * existingItem.price;
  } else {
    cart.push({
      productId,
      productName,
      price: parseInt(price),
      quantity: parseInt(quantity),
      totalPrice: parseInt(price) * parseInt(quantity),
      edIzm: edIzm || 'шт', // 🔥 НОВОЕ: единица измерения
      variantId: variantId   // 🔥 НОВОЕ: ID варианта цены
    });
  }
  
  return cart;
}

function getCartTotal(sessionCart) {
  const cart = sessionCart || [];
  return cart.reduce((total, item) => total + (item.totalPrice || 0), 0);
}

function getCartItemsCount(sessionCart) {
  const cart = sessionCart || [];
  return cart.reduce((count, item) => count + (item.quantity || 0), 0);
}

function removeFromCart(sessionCart, productId) {
  const cart = sessionCart || [];
  return cart.filter(item => item.productId !== productId);
}

function updateCartItem(sessionCart, productId, newQuantity) {
  const cart = sessionCart || [];
  
  if (newQuantity <= 0) {
    return removeFromCart(cart, productId);
  }
  
  return cart.map(item => {
    if (item.productId === productId) {
      return {
        ...item,
        quantity: newQuantity,
        totalPrice: newQuantity * item.price
      };
    }
    return item;
  });
}

// 🔥 ОБНОВЛЕННАЯ ФУНКЦИЯ: Форматирование корзины с единицами измерения
function formatCartMessage(sessionCart) {
  const cart = sessionCart || [];
  
  if (cart.length === 0) {
    return '🛒 Корзина пуста\n\nВыберите товары из меню :)';
  }
  
  let message = '🛒 Ваша корзина:\n\n';
  
  cart.forEach((item, index) => {
    message += `${index + 1}. ${item.productName}`;
    
    // 🔥 ДОБАВЛЯЕМ: единицу измерения если не "шт"
    if (item.edIzm && item.edIzm !== 'шт') {
      message += ` (${item.edIzm})`;
    }
    
    message += `\n   ${item.quantity} × ${item.price}р = ${item.totalPrice}р\n\n`;
  });
  
  const total = getCartTotal(cart);
  const itemsCount = getCartItemsCount(cart);
  
  message += `📦 Итого: ${itemsCount} шт.\n`;
  message += `💰 Сумма: ${total}р`;
  
  return message;
}

// 🔥 ОБНОВЛЕННАЯ ФУНКЦИЯ: Мини-корзина с единицами измерения
function formatMiniCart(sessionCart) {
  const cart = sessionCart || [];
  
  if (cart.length === 0) {
    return '';
  }
  
  let miniCart = '\n\n📦 Ваш заказ:\n';
  
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    miniCart += `• ${item.productName}`;
    
    // 🔥 ДОБАВЛЯЕМ: единицу измерения если не "шт"
    if (item.edIzm && item.edIzm !== 'шт') {
      miniCart += ` (${item.edIzm})`;
    }
    
    miniCart += ` - ${item.quantity} × ${item.price}р = ${itemTotal}р\n`;
  });
  
  const total = getCartTotal(cart);
  
  miniCart += `\n💵 Итого: ${total}р`;
  
  return miniCart;
}

module.exports = {
  addToCart,
  getCartTotal,
  getCartItemsCount,
  removeFromCart,
  updateCartItem,
  formatCartMessage,
  formatMiniCart
};