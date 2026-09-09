import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadZone from "../components/UploadZone";

describe("UploadZone Component", () => {
  const mockOnUpload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  it("renders upload zone prompt and button", () => {
    render(<UploadZone onUpload={mockOnUpload} />);
    expect(screen.getByText("Drag and drop your video")).toBeDefined();
    expect(screen.getByText(/Supported formats: MP4, WebM/i)).toBeDefined();
    expect(screen.getByText(/Maximum size: 50MB/i)).toBeDefined();
  });

  it("shows error for unsupported file formats (e.g. image/png)", () => {
    render(<UploadZone onUpload={mockOnUpload} />);
    const file = new File(["fake content"], "photo.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("Unsupported file format. Please upload MP4 or WebM.")).toBeDefined();
    expect(mockOnUpload).not.toHaveBeenCalled();
  });

  it("shows error when file size exceeds 50MB", () => {
    render(<UploadZone onUpload={mockOnUpload} />);
    // 51MB file
    const oversizedFile = new File([new Uint8Array(51 * 1024 * 1024)], "large.mp4", {
      type: "video/mp4",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [oversizedFile] } });

    expect(screen.getByText("File is too large. Maximum size is 50MB.")).toBeDefined();
    expect(mockOnUpload).not.toHaveBeenCalled();
  });
});
