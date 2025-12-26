#!/bin/bash

# =========================================================================
# Expense Tracker & Budget Planner - RDS Auto Deployment Script
# =========================================================================

set -e

# Get parameters
BRANCH_NAME="${1:-main}"
ENV_PATH="$2"
REPO_URL="https://github.com/bot28-b/rds-db-node.git"
DEPLOY_DIR="/home/ubuntu/rds-app"
CONTAINER_NAME="expense-tracker-app"

echo "=========================================="
echo "Expense Tracker (RDS) - Auto Deployment"
echo "=========================================="
echo "Branch:   $BRANCH_NAME"

# Step 1: Handle .env file
if [ -z "$ENV_PATH" ]; then
    echo ""
    echo "❓ No .env path provided as second argument."
    read -p "Please enter the full path to your .env file: " ENV_PATH
fi

if [ ! -f "$ENV_PATH" ]; then
    echo "❌ Error: File '$ENV_PATH' not found."
    exit 1
fi

echo "✓ Using .env from: $ENV_PATH"
echo "=========================================="
echo ""

# Step 2: Install Docker if not already installed
echo "[1/6] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y docker.io
    sudo usermod -aG docker ubuntu
else
    echo "✓ Docker is already installed"
fi
echo ""

# Step 3: Clone repository and checkout branch
echo "[2/6] Cloning repository from branch: $BRANCH_NAME..."
if [ -d "$DEPLOY_DIR" ]; then
    echo "Removing existing deployment directory..."
    rm -rf "$DEPLOY_DIR"
fi
mkdir -p "$DEPLOY_DIR"
git clone -b "$BRANCH_NAME" "$REPO_URL" "$DEPLOY_DIR"
echo "✓ Repository cloned"
echo ""

# Step 4: Setup environment
echo "[3/6] Configuring environment..."
cp "$ENV_PATH" "$DEPLOY_DIR/.env"
echo "✓ .env file copied to deployment directory"
echo ""

# Step 4: Stop existing container
echo "[4/6] Stopping existing containers..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo "✓ Old container removed"
echo ""

# Step 5: Build Docker image
echo "[5/6] Building Docker image..."
docker build -t "$CONTAINER_NAME:latest" .
echo "✓ Image built successfully"
echo ""

# Step 6: Run container
echo "[6/6] Starting application container..."
# Passing --env-file so it picks up RDS credentials
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 5000:5000 \
  --env-file .env \
  --restart unless-stopped \
  "$CONTAINER_NAME:latest"

sleep 3
echo "✓ Container started"
echo ""

# Verification
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Deployment Details:"
echo "  Branch:       $BRANCH_NAME"
echo "  Repository:   $REPO_URL"
echo "  Deploy Dir:   $DEPLOY_DIR"
echo "  Port:         5000"
echo ""
echo "Running Containers Chart:"
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Access Points:"
echo "  Application UI:  http://$(hostname -I | awk '{print $1}'):5000"
echo "  Health Check:    http://$(hostname -I | awk '{print $1}'):5000/api/health"
echo ""
echo "Important Notes:"
echo "  1. Ensure your RDS instance Security Group allows traffic from this server on port 5432."
echo "  2. The application will automatically initialize the database schema on first connection."
echo ""
echo "Container Management:"
echo "  View logs:     docker logs -f $CONTAINER_NAME"
echo "  Restart:       docker restart $CONTAINER_NAME"
echo "  Stop:          docker stop $CONTAINER_NAME"
echo ""
echo "To redeploy:"
echo "  ./deploy.sh $BRANCH_NAME"
echo ""
