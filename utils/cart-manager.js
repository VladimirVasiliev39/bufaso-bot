// Утилиты для работы с корзиной
function addToCart(sessionCart, productId, productName, price, quantity) {
  const cart = sessionCart || [];
  const existingItem = cart.find(item => item.productId === productId);
  
  if (existingItem) {
    existingItem.quantity += parseInt(quantity);
    existingItem.totalPrice = existingItem.quantity * existingItem.price;
  } else {
    cart.push({
      productId,
      productName,
      price: parseInt(price),
      quantity: parseInt(quantity),
      totalPrice: parseInt(price) * parseInt(quantity)
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

function formatCartMessage(sessionCart) {
  const cart = sessionCart || [];
  
  if (cart.length === 0) {
    return '🛒 Корзина пуста\n\nВыберите товары из меню :)';
  }
  
  let message = '🛒 Ваша корзина:\n\n';
  
  cart.forEach((item, index) => {
    message += `${index + 1}. ${item.productName}\n`;
    message += `   ${item.quantity} × ${item.price}р = ${item.totalPrice}р\n\n`;
  });
  
  const total = getCartTotal(cart);
  const itemsCount = getCartItemsCount(cart);
  
  message += `📦 Итого: ${itemsCount} шт.\n`;
  message += `💰 Сумма: ${total}р`;
  
  return message;
}

// 🔥 Функция для мини-корзины с правильным форматом
function formatMiniCart(sessionCart) {
  const cart = sessionCart || [];
  
  if (cart.length === 0) {
    return '';
  }
  
  let miniCart = '\n\n📦 Ваш заказ:\n';
  
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    miniCart += `• ${item.productName} - ${item.quantity} × ${item.price}р = ${itemTotal}р\n`;
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