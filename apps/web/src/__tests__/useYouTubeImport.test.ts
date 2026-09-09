import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useYouTubeImport } from "../hooks/useYouTubeImport";

describe("useYouTubeImport hook", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(() => "blob:mock-video-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("initializes with IDLE phase", () => {
    const { result } = renderHook(() => useYouTubeImport());
    expect(result.current.importState.phase).toBe("IDLE");
  });

  it("handles empty URL error", async () => {
    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      const res = await result.current.startImport("   ");
      expect(res).toBeNull();
    });

    expect(result.current.importState.phase).toBe("ERROR");
    if (result.current.importState.phase === "ERROR") {
      expect(result.current.importState.errorCode).toBe("INVALID_URL");
      expect(result.current.importState.errorMessage).toContain("Please enter a YouTube URL");
    }
  });

  it("rejects non-YouTube URL client-side without network request", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      const res = await result.current.startImport("https://vimeo.com/12345");
      expect(res).toBeNull();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.importState.phase).toBe("ERROR");
    if (result.current.importState.phase === "ERROR") {
      expect(result.current.importState.errorCode).toBe("UNSUPPORTED_DOMAIN");
    }
  });

  it("transitions to metadata preview on successful /api/extract", async () => {
    const mockMetadata = {
      success: true,
      id: "dQw4w9WgXcQ",
      title: "Sample Video",
      duration: 45,
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    };

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockMetadata,
    } as Response);

    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      await result.current.startImport("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    expect(result.current.importState.phase).toBe("FETCHING_METADATA");
    expect(result.current.importState.metadata).toEqual({
      id: "dQw4w9WgXcQ",
      title: "Sample Video",
      duration: 45,
      thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("maps API error codes properly (e.g. VIDEO_TOO_LONG)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: "VIDEO_TOO_LONG", message: "Video duration exceeds limit" },
      }),
    } as Response);

    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      await result.current.startImport("https://www.youtube.com/watch?v=toolongvideo");
    });

    expect(result.current.importState.phase).toBe("ERROR");
    if (result.current.importState.phase === "ERROR") {
      expect(result.current.importState.errorCode).toBe("VIDEO_TOO_LONG");
      expect(result.current.importState.errorMessage).toContain("60 seconds or shorter");
    }
  });

  it("resets state back to IDLE when reset is called", async () => {
    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      await result.current.startImport("");
    });
    expect(result.current.importState.phase).toBe("ERROR");

    act(() => {
      result.current.reset();
    });
    expect(result.current.importState.phase).toBe("IDLE");
  });

  it("downloads video blob and returns VideoSource on confirmImport", async () => {
    const mockMetadata = {
      success: true,
      id: "test1234",
      title: "Short Clip",
      duration: 15,
      thumbnail: "https://i.ytimg.com/vi/test/hqdefault.jpg",
    };

    // First call: extract metadata
    // Second call: download media blob
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => new Blob(["fake video binary"], { type: "video/mp4" }),
      } as Response);

    const { result } = renderHook(() => useYouTubeImport());

    await act(async () => {
      await result.current.startImport("https://www.youtube.com/watch?v=test1234");
    });

    let source: any = null;
    await act(async () => {
      source = await result.current.confirmImport("https://www.youtube.com/watch?v=test1234");
    });

    expect(result.current.importState.phase).toBe("EDITOR_READY");
    expect(source).not.toBeNull();
    expect(source.type).toBe("youtube");
    expect(source.name).toBe("Short Clip");
    expect(source.duration).toBe(15);
    expect(source.url).toBe("blob:mock-video-url");
  });
});
