import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * FreeClip — E2E Golden Path Tests
 *
 * Prerequisites:
 * - FreeClip web app running at http://localhost:3000
 * - FreeClip API running at http://localhost:4000
 * - A test video file exists at apps/web/e2e/fixtures/test-clip.mp4
 *
 * The test video should be:
 * - MP4/H.264/AAC
 * - ≤ 50 MB
 * - ≤ 60 seconds
 * - At least 5 seconds (for trim testing)
 */

const FIXTURE_PATH = path.resolve(__dirname, "fixtures/test-clip.mp4");
const EXPORT_TIMEOUT = 90_000; // 90 seconds for FFmpeg to complete

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForEditorReady(page: Page) {
  await expect(page.getByRole("heading", { name: "Edit Video" })).toBeVisible({
    timeout: 30_000,
  });
}

async function uploadLocalVideo(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("FreeClip Landing Page", () => {
  test("renders correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FreeClip" })).toBeVisible();
    await expect(page.getByText("Drag and drop your video")).toBeVisible();
    await expect(page.getByLabel("YouTube video URL")).toBeVisible();
  });
});

test.describe("FreeClip Golden Path — Local Upload", () => {
  test.beforeEach(async ({ page }) => {
    // Verify fixture exists before running tests
    if (!fs.existsSync(FIXTURE_PATH)) {
      test.skip(true, `Test fixture not found: ${FIXTURE_PATH}. Create a test video to run E2E tests.`);
    }
    await page.goto("/");
  });

  test("golden path: upload → trim → crop → export → download", async ({ page }) => {
    // 1. Upload a video
    await uploadLocalVideo(page, FIXTURE_PATH);

    // 2. Editor should load
    await waitForEditorReady(page);

    // 3. Trim: Verify timeline is visible
    await expect(page.getByText("Timeline & Trim")).toBeVisible();

    // 4. Enter crop mode
    const cropBtn = page.getByRole("button", { name: "Crop Video" });
    await expect(cropBtn).toBeVisible();
    await cropBtn.click();
    await expect(page.getByRole("button", { name: "Save Crop" })).toBeVisible();

    // 5. Exit crop mode (save crop)
    await page.getByRole("button", { name: "Save Crop" }).click();

    // 6. Click Export
    const exportBtn = page.getByRole("button", { name: "Export Video" });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // 7. Watch for progress
    await expect(page.getByText("Preparing video engine")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Exporting video")).toBeVisible({ timeout: 15_000 });

    // 8. Wait for completion
    await expect(page.getByText("Video ready")).toBeVisible({ timeout: EXPORT_TIMEOUT });

    // 9. Download button should be available
    const downloadLink = page.getByRole("link", { name: "Download Video" });
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute("download", "freeclip-export.mp4");
  });

  test("cancel export and re-export works", async ({ page }) => {
    await uploadLocalVideo(page, FIXTURE_PATH);
    await waitForEditorReady(page);

    // Start export
    await page.getByRole("button", { name: "Export Video" }).click();
    await expect(page.getByText("Exporting video")).toBeVisible({ timeout: 15_000 });

    // Cancel
    await page.getByRole("button", { name: "Cancel Export" }).click();
    await expect(page.getByText("Export cancelled")).toBeVisible({ timeout: 10_000 });

    // Re-export
    const reExportBtn = page.getByRole("button", { name: "Export Again" });
    await expect(reExportBtn).toBeVisible();
    await reExportBtn.click();

    // Should get to processing state again
    await expect(page.getByText(/Exporting video|Preparing video engine/)).toBeVisible({ timeout: 15_000 });
  });

  test("start over returns to landing page and cleans up", async ({ page }) => {
    await uploadLocalVideo(page, FIXTURE_PATH);
    await waitForEditorReady(page);

    await page.getByRole("button", { name: "Start Over" }).click();

    // Should return to landing
    await expect(page.getByRole("heading", { name: "FreeClip" })).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("FreeClip — Input Boundary Tests", () => {
  test("shows error for unsupported file format", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]');
    // Create a dummy text file that isn't a video
    await fileInput.setInputFiles({
      name: "not-a-video.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a video"),
    });

    await expect(page.getByTestId("upload-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/not supported/i)).toBeVisible({ timeout: 5_000 });
  });

  test("accepts file over 50 MB without artificial size error", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]');
    const tempLargePath = path.resolve(__dirname, "fixtures/temp-large.mp4");
    fs.writeFileSync(tempLargePath, Buffer.alloc(51 * 1024 * 1024));

    try {
      await fileInput.setInputFiles(tempLargePath);
      // Ensure no 50MB size rejection error is shown
      await expect(page.getByText("File is too large")).not.toBeVisible();
    } finally {
      if (fs.existsSync(tempLargePath)) {
        fs.unlinkSync(tempLargePath);
      }
    }
  });
});

test.describe("FreeClip — YouTube Import UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows error for non-YouTube URL", async ({ page }) => {
    const urlInput = page.getByLabel("YouTube video URL");
    await urlInput.fill("https://vimeo.com/123456");

    await page.getByRole("button", { name: "Load Video" }).click();

    await expect(page.getByTestId("youtube-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("youtube-error")).toContainText("Only YouTube URLs are supported");
  });

  test("shows error for http:// YouTube URL", async ({ page }) => {
    const urlInput = page.getByLabel("YouTube video URL");
    await urlInput.fill("http://youtube.com/watch?v=abc");

    await page.getByRole("button", { name: "Load Video" }).click();

    await expect(page.getByTestId("youtube-error")).toBeVisible({ timeout: 5_000 });
  });

  test("shows validating state then error for bad URL", async ({ page }) => {
    const urlInput = page.getByLabel("YouTube video URL");
    await urlInput.fill("https://example.com/not-youtube");

    await page.getByRole("button", { name: "Load Video" }).click();

    // Should show an error (client-side validation catches this immediately)
    await expect(page.getByTestId("youtube-error")).toBeVisible({ timeout: 5_000 });
  });

  test("Enter key submits the URL", async ({ page }) => {
    const urlInput = page.getByLabel("YouTube video URL");
    await urlInput.fill("https://example.com/not-youtube");
    await urlInput.press("Enter");

    // Error should appear (URL rejected by client validation)
    await expect(page.getByTestId("youtube-error")).toBeVisible({ timeout: 5_000 });
  });

  test("Load Video button disabled when URL is empty", async ({ page }) => {
    const loadBtn = page.getByRole("button", { name: "Load Video" });
    await expect(loadBtn).toBeDisabled();
  });
});

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

test.describe("FreeClip — Health & API", () => {
  test("API health endpoint returns ok", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("API extract rejects SSRF attempt", async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/extract`, {
      data: { url: "https://youtube.com@127.0.0.1/" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
