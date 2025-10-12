const fs = require('fs');
const path = require('path');

// Функция для получения пути к фото товара
function getProductImage(productId, imageFileName) {
  // Если имя файла не указано - используем заглушку
  if (!imageFileName || imageFileName.trim() === '') {
    console.log(`⚠️ Для товара ${productId} не указано имя файла`);
    return './assets/product_default.jpg';
  }
  
  const imagePath = `./assets/imageproduct/${imageFileName}`;
  const defaultImage = './assets/product_default.jpg';
  
  // Проверяем существует ли файл
  if (fs.existsSync(imagePath)) {
    console.log(`✅ Фото для товара ${productId} найдено: ${imageFileName}`);
    return imagePath;
  } else {
    console.log(`⚠️ Фото для товара ${productId} не найдено: ${imageFileName}`);
    return defaultImage;
  }
}

module.exports = { getProductImage };