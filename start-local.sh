#!/bin/bash
# Quick setup script for local development

set -e

echo "\nTechnology Wargame - Local Setup"
echo "====================================="
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "WARNING: Node.js version $NODE_VERSION detected"
    echo "   Node.js 20+ is recommended"
    echo ""
fi

echo "Node.js $(node -v) detected"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "No .env file found"
    echo ""
    
    if [ -f ".env.example" ]; then
        echo "Copying .env.example to .env..."
        cp .env.example .env
        echo "Created .env file"
        echo ""
        echo "IMPORTANT: Edit .env and add your Supabase credentials!"
        echo "   Get them from: https://app.supabase.com"
        echo ""
        read -p "Press Enter to continue when you've updated .env..."
    else
        echo "ERROR: .env.example not found"
        exit 1
    fi
else
    echo ".env file found"
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "Dependencies installed"
echo ""

echo "Starting development server..."
echo ""
echo "Quick Guide:"
echo "   - App will be at: http://localhost:5173"
echo "   - Default GM password: admin123"
echo "   - Default team password: password"
echo "   - See LOCAL_DEVELOPMENT.md for full testing guide"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
