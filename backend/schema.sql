CREATE DATABASE IF NOT EXISTS mini_mall
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mini_mall;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  images JSON NULL,
  category VARCHAR(60) NOT NULL DEFAULT '其他',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_products_price CHECK (price >= 0),
  CONSTRAINT chk_products_stock CHECK (stock >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_user_product (user_id, product_id),
  CONSTRAINT chk_cart_quantity CHECK (quantity > 0),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS addresses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  province VARCHAR(60) NOT NULL,
  city VARCHAR(60) NOT NULL,
  district VARCHAR(60) NOT NULL,
  detail VARCHAR(255) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  address_id BIGINT NULL,
  address_snapshot JSON NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status ENUM('待支付','已支付','已发货','已完成','已取消') NOT NULL DEFAULT '待支付',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_order_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  product_name VARCHAR(120) NOT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_item_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO users (id, username, email)
VALUES (1, 'demo_user', 'demo@example.com');

INSERT INTO products (name, description, price, stock, images, category)
SELECT '无线蓝牙耳机', '轻巧舒适，适合学习、通勤与日常聆听。', 129.00, 30, JSON_ARRAY('headphones'), '数码配件'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='无线蓝牙耳机');
INSERT INTO products (name, description, price, stock, images, category)
SELECT '桌面氛围台灯', '柔和暖光，适合宿舍桌面和夜间阅读。', 89.00, 24, JSON_ARRAY('lamp'), '居家生活'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='桌面氛围台灯');
INSERT INTO products (name, description, price, stock, images, category)
SELECT '帆布托特包', '简洁耐用的日常收纳包，适合上课和出行。', 49.90, 45, JSON_ARRAY('bag'), '生活方式'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='帆布托特包');
INSERT INTO products (name, description, price, stock, images, category)
SELECT '机械键盘', '紧凑布局，适合桌面办公与编程学习。', 259.00, 12, JSON_ARRAY('keyboard'), '数码配件'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='机械键盘');
INSERT INTO products (name, description, price, stock, images, category)
SELECT '随行保温杯', '便携杯身，适合上课、运动和日常饮水。', 39.90, 60, JSON_ARRAY('bottle'), '生活方式'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='随行保温杯');
INSERT INTO products (name, description, price, stock, images, category)
SELECT '极简收纳架', '整理书桌常用物品，让空间更清爽。', 69.00, 18, JSON_ARRAY('shelf'), '居家生活'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name='极简收纳架');
