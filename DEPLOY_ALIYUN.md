# 阿里云 ECS 部署教程

## 目录
1. [创建阿里云账号](#步骤 1 创建阿里云账号)
2. [购买 ECS 服务器](#步骤 2 购买 ecs 服务器)
3. [配置安全组](#步骤 3 配置安全组)
4. [连接服务器](#步骤 4 连接服务器)
5. [一键部署应用](#步骤 5 一键部署应用)
6. [访问服务](#步骤 6 访问服务)
7. [绑定域名（可选）](#步骤 7 绑定域名可选)

---

## 步骤 1：创建阿里云账号

1. 访问 [阿里云官网](https://www.aliyun.com/)
2. 点击右上角 **免费注册**
3. 使用手机号或邮箱注册
4. 完成实名认证（需要身份证）

> **提示**：新用户有免费试用额度，可申请免费 ECS 实例

---

## 步骤 2：购买 ECS 服务器

### 2.1 进入 ECS 购买页

1. 登录后访问 [ECS 控制台](https://ecs.console.aliyun.com/)
2. 点击 **创建实例**

### 2.2 选择基础配置

| 配置项 | 选择 | 说明 |
|--------|------|------|
| 付费模式 | 按量付费 / 包年包月 | 测试选按量，生产选包年 |
| 地域 | 就近选择 | 如华北 2（北京）、华东 1（杭州） |
| 可用区 | 随机分配 | 单实例无需选择 |

### 2.3 选择实例规格

推荐配置：
```
规格族：经济型 e 系列
CPU：2 核
内存：2GB
```
价格参考：约 ¥99/月 或 ¥0.15/小时（按量）

### 2.4 选择镜像

```
镜像市场 → 公共镜像 → Ubuntu 22.04 64 位
```

### 2.5 配置存储

```
系统盘：40GB ESSD Entry
```

### 2.6 配置网络

```
网络：默认 VPC
公网 IP：分配公网 IPv4 地址
带宽：1-5 Mbps（推荐 3 Mbps 起）
计费方式：按固定带宽
```

### 2.7 系统配置

```
登录凭证：自定义密码
用户名：root
密码：设置一个强密码（请牢记！）
```

### 2.8 确认订单

1. 勾选服务协议
2. 点击 **立即开通**
3. 等待实例创建完成（约 1-2 分钟）

---

## 步骤 3：配置安全组

### 3.1 进入安全组配置

1. 在 ECS 控制台，点击刚创建的实例 ID
2. 点击 **安全组** 标签
3. 点击安全组 ID

### 3.2 添加入方向规则

点击 **管理规则** → **入方向** → **手动添加**：

| 优先级 | 协议 | 端口范围 | 授权对象 | 描述 |
|--------|------|----------|----------|------|
| 1 | TCP | 22/22 | 0.0.0.0/0 | SSH 连接 |
| 1 | TCP | 80/80 | 0.0.0.0/0 | HTTP 访问 |
| 1 | TCP | 443/443 | 0.0.0.0/0 | HTTPS 访问 |
| 1 | TCP | 3000/3000 | 0.0.0.0/0 | 应用端口 |

添加完成后点击 **保存**。

---

## 步骤 4：连接服务器

### 方式一：使用 Workbench（推荐新手）

1. 在 ECS 控制台，找到您的实例
2. 点击 **远程连接** 按钮
3. 点击 **Workbench 远程连接**
4. 输入 root 密码
5. 连接成功后会看到命令行界面

### 方式二：使用本地 SSH 客户端

**Windows（PowerShell）：**
```powershell
ssh root@你的服务器 IP
# 输入密码（不显示），按 Enter
```

**Mac / Linux：**
```bash
ssh root@你的服务器 IP
# 输入密码
```

**首次连接提示：**
```
The authenticity of host 'x.x.x.x' can't be established.
Are you sure you want to continue connecting (yes/no)?
# 输入 yes
```

---

## 步骤 5：一键部署应用

### 5.1 下载部署脚本

在服务器命令行中执行：

```bash
# 切换到临时目录
cd /tmp

# 下载部署脚本
wget https://raw.githubusercontent.com/mashouer/energy-dashboard-/main/deploy-aliyun.sh

# 如果 wget 失败，使用 curl：
# curl -O https://raw.githubusercontent.com/mashouer/energy-dashboard-/main/deploy-aliyun.sh
```

### 5.2 执行部署脚本

```bash
# 添加执行权限
chmod +x deploy-aliyun.sh

# 执行部署
./deploy-aliyun.sh
```

### 5.3 等待部署完成

脚本会自动执行以下步骤（约 5-10 分钟）：

```
=== 开始部署能源数据监控系统 ===
[1/6] 更新系统...
[2/6] 安装 Docker...
[3/6] 安装 Node.js...
[4/6] 克隆代码...
[5/6] 构建 Docker 镜像...
[6/6] 启动服务...
配置 Nginx 反向代理...
=== 部署完成！===
```

### 5.4 验证部署

```bash
# 检查 Docker 容器是否运行
docker ps

# 应该看到：
# CONTAINER ID   IMAGE              STATUS          PORTS
# xxxxxxx        energy-dashboard   Up 2 minutes    0.0.0.0:3000->3000/tcp

# 检查 Nginx 状态
systemctl status nginx

# 查看应用日志
docker logs energy-dashboard
```

---

## 步骤 6：访问服务

### 6.1 获取访问地址

在浏览器中访问：

```
http://你的服务器 IP
或
http://你的服务器 IP:3000
```

### 6.2 测试功能

1. 选择市州 → 查看功率曲线
2. 点击「全省汇总」→ 查看全省总功率
3. 检查数据是否正常加载

---

## 步骤 7：绑定域名（可选）

### 7.1 购买域名

1. 访问 [阿里云域名注册](https://wanwang.aliyun.com/domain/)
2. 搜索想要的域名
3. 加入购物车并结算（.com 约 ¥55/年）

### 7.2 配置域名解析

1. 进入 [云解析 DNS 控制台](https://dns.console.aliyun.com/)
2. 点击 **添加记录**
3. 配置解析：
   ```
   记录类型：A
   主机记录：@（或 www）
   记录值：你的服务器 IP
   TTL：10 分钟
   ```

### 7.3 配置 Nginx

```bash
# 编辑 Nginx 配置
nano /etc/nginx/sites-available/energy-dashboard

# 修改 server_name 为你的域名
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    # ... 其他配置不变
}

# 测试并重启 Nginx
nginx -t
systemctl restart nginx
```

### 7.4 配置 HTTPS（推荐）

```bash
# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com -d www.your-domain.com

# 按提示输入邮箱，同意条款
```

---

## 常见问题

### Q1: 部署脚本报错 "wget: command not found"

```bash
# 安装 wget
apt update && apt install -y wget
```

### Q2: Docker 镜像构建失败

```bash
# 检查内存是否足够
free -h

# 如果内存小于 2GB，需要增加 Swap
dd if=/dev/zero of=/swapfile bs=1M count=2048
mkswap /swapfile
swapon /swapfile
```

### Q3: 访问超时或无法连接

1. 检查安全组端口是否开放
2. 检查服务器防火墙：
   ```bash
   ufw status
   ufw allow 80/tcp
   ufw allow 3000/tcp
   ```
3. 检查服务是否运行：
   ```bash
   docker ps
   systemctl status nginx
   ```

### Q4: 页面显示但数据加载失败

这是正常的，因为应用需要调用 Open-Meteo API。请检查：
1. 服务器是否能访问外网
2. API 是否有限制（免费版每分钟 10 次）

### Q5: 如何查看应用日志

```bash
# 查看实时日志
docker logs -f energy-dashboard

# 查看最近 100 行
docker logs --tail 100 energy-dashboard
```

### Q6: 如何重启服务

```bash
docker restart energy-dashboard
```

### Q7: 如何更新代码

```bash
cd /opt/energy-dashboard

# 拉取最新代码
git pull origin main

# 重新构建镜像
docker build -t energy-dashboard .

# 重启容器
docker restart energy-dashboard
```

---

## 费用参考

| 项目 | 配置 | 价格 |
|------|------|------|
| ECS 实例 | 2 核 2G 3Mbps | ¥99/月 |
| 域名 | .com | ¥55/年 |
| SSL 证书 | Let's Encrypt | 免费 |
| **合计** | | **约 ¥105/月** |

---

## 技术支持

- 阿里云工单：https://workorder.console.aliyun.com/
- 本项目 GitHub：https://github.com/mashouer/energy-dashboard-
