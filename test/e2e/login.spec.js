import { test, expect } from "@playwright/test";

const KID_PIN = "1234";
const PARENT_PIN = "9999";

async function enterPin(page, pin) {
  for (const d of pin) await page.locator(`#pad button[data-k="${d}"]`).click();
  await page.locator('#pad button[data-k="Go"]').click();
}

async function openLogin(page, path) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "The Brickfield Cup" })).toBeVisible();
}

test.beforeEach(async ({ page, baseURL }) => {
  // Block external requests (Google Fonts) so tests are fast and offline-safe.
  await page.route((url) => url.origin !== new URL(baseURL).origin, (route) => route.abort());
  await openLogin(page, "/");
});

test("player and parent have separate login pages", async ({ page }) => {
  await expect(page.locator("#pad button")).toHaveCount(12);
  await expect(page.getByText("Player PIN")).toBeVisible();
  await expect(page.getByText("Parent PIN")).toHaveCount(0);
  await page.getByRole("link", { name: "Parent? Sign in here" }).click();
  await expect(page).toHaveURL(/\/parent-login$/);
  await expect(page.getByText("Parent PIN")).toBeVisible();
  await page.getByRole("link", { name: "Back to the player login" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("student logs in with PIN and logs out", async ({ page }) => {
  await enterPin(page, KID_PIN);
  await expect(page).toHaveURL(/\/kid$/);
  await expect(page.locator("#bar")).toContainText("Log out");
  await page.locator("#logout").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#pad")).toBeVisible();
});

test("parent logs in with PIN and logs out", async ({ page }) => {
  await openLogin(page, "/parent-login");
  await enterPin(page, PARENT_PIN);
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.locator("#who")).toHaveText("Parent dashboard");
  await page.locator("#logout").click();
  await expect(page).toHaveURL(/\/parent-login$/);
  await expect(page.locator("#pad")).toBeVisible();
});

test("student can type PIN on keyboard", async ({ page }) => {
  await page.keyboard.type(KID_PIN);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/kid$/);
});

test("wrong PIN shows error and stays on login", async ({ page }) => {
  await enterPin(page, "0000");
  await expect(page.locator("#err")).not.toBeEmpty();
  await expect(page).toHaveURL(/\/$/);
});

test("kid PIN is rejected on the parent login", async ({ page }) => {
  await openLogin(page, "/parent-login");
  await enterPin(page, KID_PIN);
  await expect(page.locator("#err")).not.toBeEmpty();
  await expect(page).toHaveURL(/\/parent-login$/);
});

test("parent PIN is rejected on the player login", async ({ page }) => {
  await enterPin(page, PARENT_PIN);
  await expect(page.locator("#err")).not.toBeEmpty();
  await expect(page).toHaveURL(/\/$/);
});

test("logged-in session redirects from login page", async ({ page }) => {
  await enterPin(page, KID_PIN);
  await expect(page).toHaveURL(/\/kid$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/kid$/);
});

test("unauthenticated /kid and /parent bounce to login", async ({ page }) => {
  await page.goto("/kid");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/parent-login$/);
});
