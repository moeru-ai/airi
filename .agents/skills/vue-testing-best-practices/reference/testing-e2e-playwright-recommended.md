---
title: Use Playwright for E2E Testing - Cross-Browser Support and Better DX
impact: MEDIUM
impactDescription: Cypress has browser limitations and some features require paid subscriptions
type: best-practice
tags: [vue3, testing, e2e, playwright, cypress, end-to-end]
---

# Use Playwright for E2E Testing - Cross-Browser Support and Better DX

**Impact: MEDIUM** - Playwright offers superior cross-browser testing (Chromium, WebKit, Firefox), excellent debugging tools, and is fully open source. Cypress has limitations with WebKit support and requires paid subscriptions for some features.

Use Playwright for new E2E testing setups. Consider Cypress if team already has expertise or for its visual debugging UI.

## Task Checklist

- [ ] Install Playwright with browsers for your target platforms
- [ ] Configure for Vue dev server integration
- [ ] Set up projects for different browsers
- [ ] Use locator strategies that match component test patterns
- [ ] Configure CI for parallel test execution
- [ ] Use trace and screenshot features for debugging

## Quick Setup

```bash
# Install Playwright
npm init playwright@latest

# This will create:
# - playwright.config.ts
# - tests/ directory
# - tests-examples/ directory
```

**playwright.config.ts:**
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:5173',
    // Capture trace on first retry
    trace: 'on-first-retry',
    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Run local dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

## E2E Test Example

```typescript
// e2e/user-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('User Authentication', () => {
  test('user can log in and see dashboard', async ({ page }) => {
    // Navigate to login
    await page.goto('/login')

    // Fill login form
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign In' }).click()

    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('wrong@example.com')
    await page.getByLabel('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toContainText('Invalid credentials')
    await expect(page).toHaveURL('/login')
  })
})
```

## Playwright vs Cypress Comparison

| Feature | Playwright | Cypress |
|---------|------------|---------|
| Browsers | Chromium, Firefox, WebKit | Chromium, Firefox, Electron (WebKit experimental) |
| Cross-browser | Full support | Limited |
| Parallelization | Built-in | Requires Cypress Cloud |
| Open source | Fully | Core only |
| Mobile testing | Device emulation | Limited |
| Debugging | Inspector, trace viewer | Time-travel UI |
| API testing | Built-in | Plugin required |
| Iframes | Full support | Limited |

## Testing Vue Components with Data-Testid

```typescript
// e2e/product-list.spec.ts
import { test, expect } from '@playwright/test'

test('user can add product to cart', async ({ page }) => {
  await page.goto('/products')

  // Use data-testid for reliable selectors
  await page.getByTestId('product-card').first().click()

  // Verify product detail page
  await expect(page.getByTestId('product-title')).toBeVisible()

  // Add to cart
  await page.getByTestId('add-to-cart-button').click()

  // Verify cart updated
  await expect(page.getByTestId('cart-count')).toHaveText('1')
})
```

## Page Object Pattern for Vue Apps

```typescript
// e2e/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')
    this.submitButton = page.getByRole('button', { name: 'Sign In' })
    this.errorMessage = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}
```

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'
import { LoginPage } from './pages/LoginPage'

test('successful login', async ({ page }) => {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login('user@example.com', 'password123')

  await expect(page).toHaveURL('/dashboard')
})
```

## Visual Regression Testing

```typescript
test('homepage visual regression', async ({ page }) => {
  await page.goto('/')

  // Full page screenshot comparison
  await expect(page).toHaveScreenshot('homepage.png')

  // Element-specific screenshot
  await expect(page.getByTestId('hero-section')).toHaveScreenshot('hero.png')
})
```

## Running Tests

```bash
# Run all tests
npx playwright test

# Run in headed mode (see browser)
npx playwright test --headed

# Run specific file
npx playwright test e2e/auth.spec.ts

# Run in specific browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug

# Generate test from actions
npx playwright codegen localhost:5173
```

## Reference
- [Playwright Documentation](https://playwright.dev/)
- [Vue.js E2E Testing Recommendations](https://vuejs.org/guide/scaling-up/testing#e2e-testing)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
