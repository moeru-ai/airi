#!/bin/bash

# 🧪 Korean translation TDD automated test script

set -e  # Exit immediately on error

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Log helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_header() {
    echo -e "${CYAN}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧪 $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
}

# Start message
log_header "Korean Translation TDD Test Start"

# Step 1: Syntax validation
log_info "1️⃣ TypeScript type checking..."
if pnpm typecheck; then
    log_success "Type check passed"
else
    log_error "Type check failed - syntax errors in translation files"
    exit 1
fi

log_info "1️⃣ ESLint checking..."
if pnpm lint; then
    log_success "ESLint check passed"
else
    log_warning "ESLint warnings found - try auto-fix (pnpm lint:fix)"
fi

# Step 2: Translation key validation
log_info "2️⃣ Translation key completeness validation..."
if tsx scripts/check-i18n-keys.ts; then
    log_success "Translation key validation passed"
else
    log_warning "Translation not complete (normal development process)"
fi

# Step 3: Build test
log_info "3️⃣ Production build testing..."
if pnpm build:web; then
    log_success "Web build successful"
else
    log_error "Web build failed"
    exit 1
fi

# Step 4: Development server start options
log_info "4️⃣ Development server start options"
echo "Choose one of the following:"
echo "1) Automatically start dev server and open browser"
echo "2) Show manual testing guide only"
echo "3) Exit test"

read -p "Choice (1-3): " choice

case $choice in
    1)
        log_info "Starting development server..."
        
        # Start dev server in background
        pnpm dev &
        SERVER_PID=$!
        
        # Wait for server to start
        log_info "Waiting for server to start... (10 seconds)"
        sleep 10
        
        # Open browser (OS-specific handling)
        if command -v xdg-open > /dev/null; then
            # Linux
            xdg-open http://localhost:5174
        elif command -v open > /dev/null; then
            # macOS  
            open http://localhost:5174
        elif command -v start > /dev/null; then
            # Windows
            start http://localhost:5174
        else
            log_warning "Cannot open browser automatically. Please open http://localhost:5174 manually"
        fi
        
        log_success "Development server started!"
        echo ""
        echo "🌐 Web URL: http://localhost:5174"
        echo "📋 Manual test guide:"
        echo "   1. Settings → Language → Select Korean"
        echo "   2. Verify UI displays in Korean"
        echo "   3. Verify settings menus display in Korean"
        echo "   4. Verify layout is not broken"
        echo ""
        echo "⏹️  Press Ctrl+C to stop server after testing"
        
        # Wait for server process
        wait $SERVER_PID
        ;;
        
    2)
        log_info "Manual testing guide"
        echo ""
        echo "🚀 Start dev server: pnpm dev"
        echo "🌐 Web URL: http://localhost:5174"
        echo ""
        echo "📋 Checklist (15 minutes):"
        echo "   ✓ Korean selectable in language settings"
        echo "   ✓ Main UI displays in Korean"  
        echo "   ✓ Settings menus display in Korean"
        echo "   ✓ Chat placeholder in Korean"
        echo "   ✓ Model loading messages in Korean"
        echo "   ✓ Onboarding dialogs in Korean"
        echo "   ✓ Layout not broken"
        echo "   ✓ Displays correctly on mobile"
        echo ""
        echo "🖥️  Desktop app test: pnpm dev:tamagotchi"
        ;;
        
    3)
        log_info "Exiting test"
        exit 0
        ;;
        
    *)
        log_error "Invalid selection"
        exit 1
        ;;
esac

log_success "Korean Translation TDD Test Complete!"