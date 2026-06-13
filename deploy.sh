#!/bin/bash
# ================================================================
#  LENS — 一键部署脚本
#  用法: bash deploy.sh <你的Qwen_API_Key>
# ================================================================
set -e

API_KEY="${1:-your-api-key-here}"
REPO="https://github.com/ddf-gif/Xenginner-6.12.git"
BRANCH="pr/floating-camera-layout"
DIR="/opt/lens"

echo "=== LENS 一键部署 ==="

# Fix TLS if needed
git config --global http.sslVerify false 2>/dev/null || true
git config --global http.postBuffer 524288000

# Clone or pull
if [ -d "$DIR/.git" ]; then
    echo ">>> Updating existing repo..."
    cd "$DIR"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH" 2>/dev/null || git reset --hard "origin/$BRANCH"
else
    echo ">>> Cloning repo..."
    mkdir -p /opt
    git clone -b "$BRANCH" "$REPO" "$DIR" || {
        echo ">>> Git clone failed, trying with depth=1..."
        git clone -b "$BRANCH" --depth 1 "$REPO" "$DIR"
    }
    cd "$DIR"
fi

# Set API key
echo "QWEN_API_KEY=$API_KEY" > "$DIR/backend/.env"

# Check Docker
if command -v docker &>/dev/null && command -v docker-compose &>/dev/null; then
    echo ">>> Docker Compose 部署..."
    cd "$DIR"
    QWEN_API_KEY="$API_KEY" docker-compose up -d --build
    echo ""
    echo "=== 部署完成 ==="
    echo "访问: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):3000"
    echo "日志: docker-compose logs -f"
else
    echo ">>> 直接部署 (无Docker)..."
    cd "$DIR/backend"
    pip install -r requirements.txt -q
    echo ""
    echo "=== 启动服务 ==="
    echo "访问: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP'):3000"
    python -c "import uvicorn; from main import app; uvicorn.run(app, host='0.0.0.0', port=3000)"
fi
