# E2E Test Fixtures

## Required: `test-clip.mp4`

The E2E tests require a short test video at `apps/web/e2e/fixtures/test-clip.mp4`.

Requirements:
- Format: MP4 container, H.264 video, AAC audio
- Duration: 5–30 seconds (well within the 60s limit)
- Size: Under 10 MB (well within the 50 MB limit)
- Resolution: 720p or 1080p

### Creating a test fixture with FFmpeg

If you have FFmpeg installed locally, you can generate a synthetic test video:

```bash
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
       -f lavfi -i sine=frequency=440:duration=10 \
       -c:v libx264 -preset fast -crf 23 \
       -c:a aac -b:a 128k \
       -t 10 \
       apps/web/e2e/fixtures/test-clip.mp4
```

This creates a 10-second synthetic test clip that satisfies all FreeClip validation constraints.

### Why this file is not committed

Test video files are large binary assets that should not be committed to version control.
In CI, generate the fixture in a setup step using the FFmpeg command above.
