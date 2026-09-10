import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1180 },
    deviceScaleFactor: 2, // Retina resolution for gorgeous screenshots
  });
  const page = await context.newPage();

  // ── Step 1: Generate a high quality demo video in browser ─────────────────
  console.log("Generating sample video in browser canvas...");
  await page.goto("about:blank");
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();

    const totalFrames = 90; // 3 seconds at 30 fps
    for (let i = 0; i < totalFrames; i++) {
      // Sleek background gradient
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, "#09090b");
      grad.addColorStop(0.5, "#1e1b4b");
      grad.addColorStop(1, "#0f172a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Glowing accent orbs
      ctx.beginPath();
      ctx.arc(640 + Math.sin(i * 0.08) * 220, 360 + Math.cos(i * 0.08) * 80, 110, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(139, 92, 246, 0.45)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(640 - Math.sin(i * 0.08) * 180, 360 - Math.cos(i * 0.08) * 60, 90, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
      ctx.fill();

      // Card overlay
      ctx.fillStyle = "rgba(24, 24, 27, 0.75)";
      ctx.roundRect ? ctx.roundRect(340, 200, 600, 320, 24) : ctx.fillRect(340, 200, 600, 320);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center title text
      ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText("FreeClip Demo Clip", 640, 320);

      ctx.font = "600 24px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#a855f7";
      ctx.fillText("1080p • 60 FPS • Client-Side Processing", 640, 375);

      ctx.font = "20px monospace";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`Timestamp: 00:0${(i / 30).toFixed(2)}s / 00:03.00s`, 640, 430);

      await new Promise((r) => setTimeout(r, 1000 / 30));
    }

    recorder.stop();
    await new Promise((r) => (recorder.onstop = r));
    const blob = new Blob(chunks, { type: "video/webm" });
    const arrayBuffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
  });

  const sampleVideoPath = path.join(OUT_DIR, "demo-sample.webm");
  fs.writeFileSync(sampleVideoPath, Buffer.from(videoBytes));
  console.log(`Saved demo video to ${sampleVideoPath} (${fs.statSync(sampleVideoPath).size} bytes)`);

  // ── Step 2: Capture Landing Page Screenshot ───────────────────────────────
  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  await page.screenshot({
    path: path.join(OUT_DIR, "01-landing-page.png"),
    fullPage: false,
  });
  console.log("Captured 01-landing-page.png");

  // ── Step 3: Upload Demo Video & Capture Video Editor ───────────────────────
  console.log("Uploading demo video...");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(sampleVideoPath);

  await page.waitForSelector('h1:has-text("Edit Video")', { timeout: 15000 });
  // Wait for metadata bar and video element to settle
  await page.waitForTimeout(1500);

  await page.screenshot({
    path: path.join(OUT_DIR, "02-video-editor.png"),
    fullPage: false,
  });
  console.log("Captured 02-video-editor.png");

  // ── Step 4: Open Crop Mode & Capture Cropping Tool ─────────────────────────
  console.log("Activating Crop mode...");
  const cropBtn = page.getByRole("button", { name: "Crop Video" });
  await cropBtn.click();
  await page.waitForTimeout(600);

  // Select 1:1 Square aspect ratio
  const squareRatioBtn = page.getByRole("button", { name: "1:1" });
  if (await squareRatioBtn.isVisible()) {
    await squareRatioBtn.click();
    await page.waitForTimeout(400);
  }

  await page.screenshot({
    path: path.join(OUT_DIR, "03-crop-mode.png"),
    fullPage: false,
  });
  console.log("Captured 03-crop-mode.png");

  // ── Step 5: Save Crop & Capture Real-Time Cropped Preview ─────────────────
  console.log("Saving crop for real-time preview...");
  const saveCropBtn = page.getByRole("button", { name: "Save Crop" });
  await saveCropBtn.click();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(OUT_DIR, "04-cropped-preview.png"),
    fullPage: false,
  });
  console.log("Captured 04-cropped-preview.png");

  await browser.close();
  console.log("All screenshots captured successfully!");
}

run().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
