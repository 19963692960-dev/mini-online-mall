# 拾光集 Mini 在线商城（PDF 电商实例）

本项目按《Vibe Coding 全栈应用开发》PDF 第四部分“项目实战 - 在线商城”制作。技术栈按讲义采用 React + TypeScript + Vite、Node.js + Express、MySQL。项目只实现待支付订单，不接入真实支付。

## 功能对应表

- 商品展示、商品详情信息、按分类过滤、关键词搜索
- 购物车：添加商品、合并重复商品、更新数量、删除商品、库存校验
- 订单：从所选购物车商品创建订单、订单列表、订单详情信息、取消待支付订单
- 地址：添加、查询、编辑、删除、设置默认地址
- 下单事务：锁定并检查库存、按下单时价格保存订单商品快照、扣减库存、清理已下单购物车项
- 取消订单事务：恢复库存并更新状态
- API：Express REST API + MySQL 数据持久化

## 教学演示账户说明

为了让课程重点集中在电商业务，当前版本将 `DEMO_USER_ID = 1` 作为固定演示用户，未实现注册/登录界面。数据库有 users 表，初始化脚本会创建 demo_user。**这是课堂演示设置，不适合直接用于真实公开商城。** 正式项目应加入身份认证、用户权限和管理后台。

## 一、环境要求

- Node.js 20 或更高版本
- npm
- MySQL 8.x（或兼容版本）

先确保 MySQL 服务已经启动。

## 二、初始化 MySQL

以有权限创建数据库的 MySQL 用户登录：

```bash
mysql -u root -p < backend/schema.sql
```

如果系统需要通过 `sudo mysql` 登录，可以执行：

```bash
sudo mysql < backend/schema.sql
```

创建项目专用数据库账号（仅需首次执行；请替换密码）：

```sql
CREATE USER IF NOT EXISTS 'mall_user'@'localhost' IDENTIFIED BY 'change_this_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON mini_mall.* TO 'mall_user'@'localhost';
FLUSH PRIVILEGES;
```

若通过 root 或其他账号导入了 schema.sql，确认 `mini_mall` 数据库和六张业务表已建立，并写入示例商品。

## 三、启动后端

```bash
cd backend
cp .env.example .env
```

根据本机 MySQL 的实际用户名和密码修改 `backend/.env`。安装依赖并启动：

```bash
npm install
npm start
```

测试后端数据库连接：

打开 http://localhost:4000/api/health ，预期会看到：

```json
{"ok":true,"service":"mini-online-mall-api","database":"connected"}
```

## 四、启动前端

另开一个终端窗口：

```bash
cd frontend
npm install
npm run dev
```

打开终端显示的本地地址，通常是 http://localhost:5173 。

## 五、完整功能测试顺序

1. 商城页：检查是否出现 6 件示例商品；搜索商品名，使用分类筛选。
2. 购物车：点击“加入购物车”，打开购物车，更改数量并测试删除。
3. 地址：打开“收货地址”，添加一条测试地址，勾选默认地址后保存；测试编辑及删除。
4. 下单：在购物车选中商品，选择地址，点击“提交订单（待支付）”。
5. 订单：打开“我的订单”，检查订单编号、商品、数量、下单时单价、地址快照和订单金额。
6. 取消订单：取消待支付订单，返回商城检查库存是否恢复。
7. 持久化：刷新网页或停止、重启后端，再查看购物车、地址和订单是否仍在数据库中。

## 六、数据库核验 SQL

```sql
USE mini_mall;
SELECT * FROM products;
SELECT * FROM cart_items;
SELECT * FROM addresses;
SELECT * FROM orders ORDER BY id DESC;
SELECT * FROM order_items ORDER BY id DESC;
```

下单后，应能看到 orders 和 order_items 表中的订单记录；选中并下单的购物车项目会被删除，相关库存会减少。取消待支付订单后，库存恢复、订单状态更新为“已取消”。

## 七、建议提交的实验截图

### 任务 2：电商示例项目
- 商城首页，展示商品列表、分类与搜索。
- 购物车，展示商品、数量修改和结算金额。
- 收货地址管理页，展示新增地址和默认地址。
- 订单列表，展示订单号、商品明细、金额与待支付状态。
- MySQL 查询结果，展示 products、orders、order_items 等表的真实记录。
- 取消订单后，展示“已取消”状态或库存恢复结果。

### 任务 4：Git / GitHub / IDE 版本管理
- VS Code 打开项目文件夹与源代码管理面板。
- `git status` 与 `git log --oneline` 的实际终端输出。
- 两次或以上有效提交记录。
- 新建功能分支、切换分支并合并的操作记录。
- （若要求远程托管）GitHub 仓库文件页和提交历史页。

## 八、Git 练习命令

在项目根目录执行：

```bash
git init
git add .
git commit -m "feat: build mini online mall"
git status
```

更改前端文字或样式后：

```bash
git diff
git add frontend/src
git commit -m "style: customize mall page"
git log --oneline
```

分支操作：

```bash
git switch -c feature/cart-ui
# 修改文件后
git add frontend/src
git commit -m "feat: improve cart experience"
git switch main
git merge feature/cart-ui
git log --oneline --graph
```

如果默认分支不是 `main`，先执行 `git branch` 查看实际分支名。

推送 GitHub 时，先在 GitHub 上创建空仓库，再按仓库页面提供的 URL 执行：

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

不要提交真实密码、访问令牌或其他秘密信息。

## 九、部署注意事项

不要把本地 `.env` 提交到 GitHub。Netlify 可用于部署前端静态站点，但 Express API 和 MySQL 还需要可运行的后端托管环境及可访问的 MySQL 服务。不要只上传前端构建目录就认为整套电商应用已上线。该项目是课程演示样例，公开部署前还需要认证、权限校验、限流、安全配置及数据库备份。
