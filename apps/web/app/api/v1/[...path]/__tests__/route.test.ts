import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";

describe("Proxy API Route (apps/web/app/api/v1/[...path]/route.ts)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proxies GET requests without body to backend API", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/v1/health", {
      method: "GET",
    });

    const res = await GET(req, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/health"),
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("streams POST request body directly with duplex: 'half'", async () => {
    let capturedInit: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ uploaded: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("file-chunk-data"));
        controller.close();
      },
    });

    const req = new NextRequest("http://localhost:3000/api/v1/upload", {
      method: "POST",
      body: bodyStream,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "15",
      },
      duplex: "half",
    } as any);

    const res = await POST(req, {
      params: Promise.resolve({ path: ["upload"] }),
    });

    expect(res.status).toBe(201);
    expect(capturedInit).toBeDefined();
    expect(capturedInit.duplex).toBe("half");
    expect(capturedInit.body).toBeDefined();
  });

  it("handles empty POST body without stream error", async () => {
    let capturedInit: any = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ empty: true }), { status: 200 });
    });

    const req = new NextRequest("http://localhost:3000/api/v1/trigger", {
      method: "POST",
      headers: {
        "content-length": "0",
      },
    });

    const res = await POST(req, {
      params: Promise.resolve({ path: ["trigger"] }),
    });

    expect(res.status).toBe(200);
    expect(capturedInit.body).toBeUndefined();
  });

  it("returns 502 when backend fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest("http://localhost:3000/api/v1/error", {
      method: "GET",
    });

    const res = await POST(req, {
      params: Promise.resolve({ path: ["error"] }),
    });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.statusCode).toBe(502);
    expect(json.message).toContain("Failed to connect to backend");
  });
});
