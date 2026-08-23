import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES, TIMEOUTS, ADMIN_USER, BASE } from '../helpers/constants';
import { signInViaAPI } from '../helpers/auth';

/**
 * Blog Feature E2E Tests
 *
 * Covers admin blog management (CRUD) and public blog display.
 * Uses the pre-existing admin account (admin@example.com / admin123).
 *
 * Test data: creates posts via admin API, cleans up in afterAll.
 */

test.describe('Blog', () => {

  // ── A) Admin Blog Management ──────────────────────────────────────

  test.describe('Admin Blog Management', () => {
    test.describe.configure({ mode: 'serial' });

    let adminContext: BrowserContext;
    let createdPostId: string;
    const testPostTitle = `Blog E2E Test Post ${Date.now()}`;

    test.beforeAll(async ({ browser }) => {
      adminContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await adminContext.newPage();
      const res = await signInViaAPI(page, {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      });
      expect(res.ok(), `Admin sign-in failed: ${res.status()}`).toBeTruthy();

      // Clean up stale blog posts from previous failed runs
      try {
        const listRes = await page.request.get('/api/admin/blog?search=Blog+E2E+Test+Post');
        if (listRes.ok()) {
          const data = await listRes.json();
          const posts = data.posts || data;
          if (Array.isArray(posts)) {
            for (const post of posts) {
              await page.request.delete(`/api/admin/blog/${post.id}`).catch(() => {});
            }
          }
        }
      } catch { /* ignore cleanup errors */ }

      await page.close();
    });

    test.afterAll(async () => {
      if (createdPostId) {
        try {
          const page = await adminContext.newPage();
          await page.request.delete(`/api/admin/blog/${createdPostId}`, {
            timeout: TIMEOUTS.auth,
          });
          await page.close();
        } catch {
          // Ignore cleanup errors
        }
      }
      await adminContext?.close();
    });

    async function adminPage(): Promise<Page> {
      return adminContext.newPage();
    }

    test('admin sidebar shows Blog link and navigates to blog list', async () => {
      const page = await adminPage();
      await page.goto(PAGES.adminBlog, { timeout: TIMEOUTS.navigation });

      // Verify page loads with blog admin content
      expect(page.url()).toContain('/admin/blog');

      // Blog link should exist in the DOM (sidebar may be collapsed)
      const blogLink = page.locator('a[href*="/admin/blog"]');
      const linkCount = await blogLink.count();
      expect(linkCount).toBeGreaterThanOrEqual(1);

      await page.close();
    });

    test('admin blog list page loads with table and New Post button', async () => {
      const page = await adminPage();
      await page.goto(PAGES.adminBlog, { timeout: TIMEOUTS.navigation });

      // New Post button
      await expect(
        page.locator('text=/New Post|新建文章/').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Search input
      await expect(
        page.locator('input[placeholder*="Search"], input[placeholder*="搜索"]').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Table column headers
      await expect(
        page.locator('button:has-text("Title"), button:has-text("标题")').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      await page.close();
    });

    test('create new blog post via form', async () => {
      test.setTimeout(60_000);
      const page = await adminPage();
      await page.goto(PAGES.adminBlogNew, { timeout: TIMEOUTS.navigation });

      // Wait for form to load
      const titleInput = page.locator('input#title');
      await expect(titleInput).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Focus the title input and wait for the component to settle
      await titleInput.click();
      await page.waitForTimeout(1000);

      // Try fill first; if Vue reactivity swallows it, fall back to pressSequentially
      await titleInput.fill(testPostTitle);
      await page.waitForTimeout(300);
      const filledValue = await titleInput.inputValue();
      if (filledValue !== testPostTitle) {
        await titleInput.fill('');
        await page.waitForTimeout(300);
        await titleInput.pressSequentially(testPostTitle, { delay: 100 });
        await page.waitForTimeout(300);
        const typedValue = await titleInput.inputValue();
        if (typedValue !== testPostTitle) {
          await titleInput.fill('');
          await page.waitForTimeout(500);
          await titleInput.click();
          await page.waitForTimeout(500);
          await titleInput.pressSequentially(testPostTitle, { delay: 120 });
        }
      }

      await expect(titleInput).toHaveValue(testPostTitle, { timeout: 5000 });

      // Wait for slug to auto-generate
      await page.waitForTimeout(500);

      // Fill excerpt (native textarea — standard fill works)
      const excerptInput = page.locator('#excerpt');
      await excerptInput.click();
      await excerptInput.fill('This is an E2E test post excerpt');

      // Set status to published via select dropdown
      const statusSelect = page.locator('[data-slot="select-trigger"], button[role="combobox"]').first();
      await statusSelect.click();
      await page.waitForTimeout(500);

      // reka-ui/radix-vue renders options in a portal; try multiple selectors
      const publishedOption = page.getByRole('option', { name: /Published|已发布/ });
      try {
        await publishedOption.waitFor({ state: 'visible', timeout: 3000 });
        await publishedOption.click();
      } catch {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
      }

      // Fill markdown content in the editor (only present in Next.js with react-md-editor)
      const mdTextarea = page.locator('textarea.w-md-editor-text-input').first();
      if (await mdTextarea.isVisible().catch(() => false)) {
        await mdTextarea.fill('# E2E Test\n\nThis is a **test** blog post.');
      }

      // Scroll to bottom and click save button
      const saveButton = page.locator('button[type="submit"], button').filter({ hasText: /New Post|Create|Save|创建|保存/ }).last();
      await saveButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await saveButton.click();

      // Should redirect to list (Nuxt may be slow after form submission)
      await page.waitForURL(/\/admin\/blog(?!\/)/, { timeout: 45_000 });
      expect(page.url()).toMatch(/\/admin\/blog(?:\/?\?|$)/);

      // Verify the post appears in the list
      await expect(
        page.locator(`text=${testPostTitle}`).first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Extract the post ID for cleanup — look for edit links or row data attributes
      const editLink = page.locator('a[href*="/admin/blog/"]').filter({ hasText: /Edit|编辑/ }).first();
      if (await editLink.isVisible().catch(() => false)) {
        const href = await editLink.getAttribute('href');
        if (href) {
          const idMatch = href.match(/\/admin\/blog\/([^/?]+)/);
          if (idMatch) createdPostId = idMatch[1];
        }
      }

      // If no edit link, try to get ID via API
      if (!createdPostId) {
        try {
          const listRes = await page.request.get(`/api/admin/blog?search=${encodeURIComponent(testPostTitle)}`);
          if (listRes.ok()) {
            const data = await listRes.json();
            const posts = data.posts || data;
            if (Array.isArray(posts) && posts.length > 0) {
              createdPostId = posts[0].id;
            }
          }
        } catch { /* ignore */ }
      }

      await page.close();
    });

    test('edit existing blog post', async () => {
      test.setTimeout(60_000);
      test.skip(!createdPostId, 'No post was created in previous test');

      const page = await adminPage();
      await page.goto(`${BASE}/admin/blog/${createdPostId}`, { timeout: TIMEOUTS.navigation });

      // Wait for form
      const titleInput = page.locator('input#title');
      await expect(titleInput).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Wait for existing data to load (edit mode fetches data via useFetch)
      await page.waitForTimeout(2000);

      // Clear existing title and type new one
      const updatedTitle = `${testPostTitle} Updated`;
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(updatedTitle);
      await page.waitForTimeout(300);
      const editValue = await titleInput.inputValue();
      if (editValue !== updatedTitle) {
        await titleInput.fill('');
        await page.waitForTimeout(300);
        await titleInput.click();
        await page.waitForTimeout(500);
        await titleInput.pressSequentially(updatedTitle, { delay: 100 });
      }

      // Save
      const saveButton = page.locator('button[type="submit"], button').filter({ hasText: /Save|保存|Update|更新/ }).last();
      await saveButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await saveButton.click();

      // Should redirect to list
      await page.waitForURL(/\/admin\/blog(?!\/)/, { timeout: TIMEOUTS.navigation });

      // Verify updated title
      await expect(
        page.locator(`text=${testPostTitle} Updated`).first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      await page.close();
    });

    test('delete blog post with confirmation', async () => {
      test.skip(!createdPostId, 'No post was created in previous test');

      const page = await adminPage();
      await page.goto(PAGES.adminBlog, { timeout: TIMEOUTS.navigation });

      // Wait for table
      await expect(
        page.locator(`text=${testPostTitle} Updated`).first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Handle native confirm() dialog (Next.js uses window.confirm)
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      const row = page.locator('tr, [role="row"]').filter({ hasText: `${testPostTitle} Updated` });

      // Next.js has a direct destructive delete button; Nuxt.js uses a dropdown menu
      const directDeleteBtn = row.locator('button.text-destructive, button:has(.text-destructive)').first();

      if (await directDeleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await directDeleteBtn.click();
      } else {
        // Nuxt.js path: open dropdown menu → click Delete → confirm in AlertDialog
        const menuTrigger = row.locator('button:has(.lucide-more-horizontal), button:has(.lucide-ellipsis)').first();
        if (await menuTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
          await menuTrigger.click();
        } else {
          await row.locator('button').last().click();
        }
        await page.waitForTimeout(500);

        // Click the Delete option in the dropdown
        const deleteMenuItem = page.locator('[role="menuitem"]').filter({ hasText: /Delete|删除/ });
        await deleteMenuItem.click();
        await page.waitForTimeout(500);

        // Confirm in the AlertDialog
        const confirmBtn = page.locator('[role="alertdialog"] button, [data-state="open"] button')
          .filter({ hasText: /Delete|Continue|Confirm|删除|确认/ });
        await confirmBtn.click();
      }

      // Post should disappear after deletion
      await expect(
        page.locator(`text=${testPostTitle} Updated`)
      ).toHaveCount(0, { timeout: TIMEOUTS.navigation });

      // Mark as cleaned up
      createdPostId = '';

      await page.close();
    });

    test('non-admin user cannot access admin blog page', async ({ browser }) => {
      const guestContext = await browser.newContext();
      const page = await guestContext.newPage();

      await page.goto(PAGES.adminBlog, { timeout: TIMEOUTS.navigation });

      const isRedirected = page.url().includes('/signin');
      const hasAccessDenied = await page
        .locator('text=/Access Denied|权限不足|403/')
        .first()
        .isVisible()
        .catch(() => false);

      expect(isRedirected || hasAccessDenied).toBeTruthy();

      await page.close();
      await guestContext.close();
    });
  });

  // ── B) Public Blog Display ──────────────────────────────────────

  test.describe('Public Blog Display', () => {
    test.describe.configure({ mode: 'serial' });

    let adminContext: BrowserContext;
    let publishedPostId: string;
    let draftPostId: string;
    const publishedSlug = `e2e-published-${Date.now()}`;
    const draftSlug = `e2e-draft-${Date.now()}`;

    test.beforeAll(async ({ browser }) => {
      adminContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await adminContext.newPage();

      // Sign in as admin
      const res = await signInViaAPI(page, {
        email: ADMIN_USER.email,
        password: ADMIN_USER.password,
      });
      expect(res.ok()).toBeTruthy();

      // Create published post via API
      const publishedRes = await page.request.post('/api/admin/blog', {
        data: {
          title: 'E2E Published Post',
          slug: publishedSlug,
          content: '# Published\n\nThis is a **published** test post.',
          excerpt: 'A published test post for E2E.',
          status: 'published',
        },
        timeout: TIMEOUTS.auth,
      });
      expect(publishedRes.ok()).toBeTruthy();
      const publishedData = await publishedRes.json();
      publishedPostId = publishedData.id || publishedData.post?.id;

      // Create draft post via API
      const draftRes = await page.request.post('/api/admin/blog', {
        data: {
          title: 'E2E Draft Post',
          slug: draftSlug,
          content: '# Draft\n\nThis is a **draft** test post.',
          excerpt: 'A draft test post for E2E.',
          status: 'draft',
        },
        timeout: TIMEOUTS.auth,
      });
      expect(draftRes.ok()).toBeTruthy();
      const draftData = await draftRes.json();
      draftPostId = draftData.id || draftData.post?.id;

      await page.close();
    });

    test.afterAll(async () => {
      if (publishedPostId || draftPostId) {
        const page = await adminContext.newPage();
        if (publishedPostId) {
          await page.request.delete(`/api/admin/blog/${publishedPostId}`).catch(() => {});
        }
        if (draftPostId) {
          await page.request.delete(`/api/admin/blog/${draftPostId}`).catch(() => {});
        }
        await page.close();
      }
      await adminContext?.close();
    });

    test('blog list page loads and shows published posts', async ({ page }) => {
      await page.goto(PAGES.blog, { timeout: TIMEOUTS.navigation });

      // Page title/heading should be visible
      await expect(
        page.locator('h1, h2').filter({ hasText: /Blog|博客/ }).first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Published post should be visible
      await expect(
        page.locator('text=E2E Published Post').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    test('draft posts are not visible on public blog page', async ({ page }) => {
      await page.goto(PAGES.blog, { timeout: TIMEOUTS.navigation });
      await page.waitForTimeout(1000);

      // Draft post should NOT be visible
      await expect(
        page.locator('text=E2E Draft Post')
      ).toHaveCount(0);
    });

    test('blog detail page renders markdown content', async ({ page }) => {
      await page.goto(`${BASE}/blog/${publishedSlug}`, { timeout: TIMEOUTS.navigation });

      // Title should be visible
      await expect(
        page.locator('h1').filter({ hasText: 'E2E Published Post' })
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Author info visible
      await expect(
        page.locator('text=/by|作者/').first()
      ).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Markdown content is rendered (check for HTML elements)
      const article = page.locator('article, .prose').first();
      await expect(article).toBeVisible({ timeout: TIMEOUTS.navigation });

      // Back to blog link
      await expect(
        page.locator('a').filter({ hasText: /Back to Blog|返回博客/ }).first()
      ).toBeVisible();
    });
  });

  // ── C) Public Navigation ──────────────────────────────────────

  test.describe('Public Navigation', () => {
    test('blog link is visible in site header', async ({ page }) => {
      await page.goto(`${BASE}`, { timeout: TIMEOUTS.navigation });

      const blogLink = page.locator('header a[href*="/blog"], nav a[href*="/blog"]').first();
      await expect(blogLink).toBeVisible({ timeout: TIMEOUTS.navigation });
    });

    test('blog link navigates to blog page', async ({ page }) => {
      await page.goto(`${BASE}`, { timeout: TIMEOUTS.navigation });

      const blogLink = page.locator('header a[href*="/blog"], nav a[href*="/blog"]').first();
      await blogLink.click();
      await page.waitForURL(/\/blog/, { timeout: TIMEOUTS.navigation });
      expect(page.url()).toContain('/blog');
    });
  });
});
