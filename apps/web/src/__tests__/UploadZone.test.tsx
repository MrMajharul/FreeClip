import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UploadZone from "../components/UploadZone";

describe("UploadZone Component — Sprint 6 Unlimited Input", () => {
  const mockOnUpload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  it("renders upload zone prompt and updated unlimited input copy", () => {
    render(<UploadZone onUpload={mockOnUpload} />);
    expect(screen.getByText("Drag and drop your video")).toBeDefined();
    expect(screen.getByText(/Supported formats: MP4, WebM/i)).toBeDefined();
    expect(screen.getByText(/No artificial file-size limit/i)).toBeDefined();
    expect(screen.getByText(/Processing depends on browser and device memory/i)).toBeDefined();
  });

  it("shows error for unsupported file formats (e.g. image/png)", () => {
    render(<UploadZone onUpload={mockOnUpload} />);
    const file = new File(["fake content"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      screen.getByText("This video format is not supported by your browser.")
    ).toBeDefined();
    expect(mockOnUpload).not.toHaveBeenCalled();
  });

  it("accepts videos larger than 50MB and extracts metadata", () => {
    // Mock HTMLVideoElement metadata event
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === "video") {
        const videoEl = el as HTMLVideoElement;
        Object.defineProperty(videoEl, "duration", { value: 180, configurable: true });
        Object.defineProperty(videoEl, "videoWidth", { value: 1920, configurable: true });
        Object.defineProperty(videoEl, "videoHeight", { value: 1080, configurable: true });
        
        // Auto-fire loadedmetadata after setting src
        const originalSetSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src")?.set;
        Object.defineProperty(videoEl, "src", {
          set(val) {
            originalSetSrc?.call(this, val);
            setTimeout(() => {
              videoEl.dispatchEvent(new Event("loadedmetadata"));
            }, 0);
          },
        });
      }
      return el;
    });

    render(<UploadZone onUpload={mockOnUpload} />);

    // 150MB file
    const largeFile = new File([new Uint8Array(100)], "large-podcast.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(largeFile, "size", { value: 150 * 1024 * 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [largeFile] } });

    // Ensure no error is shown for large files
    expect(screen.queryByTestId("upload-error")).toBeNull();
  });
});
