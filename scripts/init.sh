#!/bin/bash
set -e

echo "Initializing AI Comic Builder..."

# Create necessary directories
mkdir -p data uploads

# Install dependencies if not installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Run database migration
echo "Running database migration..."
pnpm db:migrate

echo ""
echo "Initialization complete!"
echo "Run 'pnpm dev' to start the development server."
