#!/bin/bash
# 阿里云 ECS 一键部署脚本
# 使用方法：ssh root@your-server-ip 'bash -s' < deploy.sh

set -e

echo "=== 开始部署能源数据监控系统 ==="

# 1. 更新系统
echo "[1/6] 更新系统..."
apt update && apt upgrade -y

# 2. 安装 Docker
echo "[2/6] 安装 Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# 3. 安装 Node.js (用于构建)
echo "[3/6] 安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 4. 克隆代码
echo "[4/6] 克隆代码..."
cd /opt
git clone https://github.com/mashouer/energy-dashboard-.git energy-dashboard
cd energy-dashboard

# 5. 构建 Docker 镜像
echo "[5/6] 构建 Docker 镜像..."
docker build -t energy-dashboard .

# 6. 运行容器
echo "[6/6] 启动服务..."
docker run -d \
  --name energy-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  energy-dashboard

# 配置 Nginx 反向代理（可选）
echo "配置 Nginx 反向代理..."
apt install -y nginx
cat > /etc/nginx/sites-available/energy-dashboard << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/energy-dashboard /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

echo ""
echo "=== 部署完成！==="
echo "访问地址：http://$(curl -s ifconfig.me)"
echo "如需绑定域名，请配置 Nginx server_name"
