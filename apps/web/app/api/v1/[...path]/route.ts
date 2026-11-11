import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8088";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = new URL(
    `/api/v1/${(path || []).join("/")}${req.nextUrl.search}`,
    API_ORIGIN,
  );

  const headers = new Headers(req.headers);
  headers.set("host", new URL(API_ORIGIN).host);

  // Remove hop-by-hop headers to prevent connection drops/socket hang-ups
  const hopByHop = ["connection", "keep-alive", "transfer-encoding", "upgrade"];
  hopByHop.forEach((h) => headers.delete(h));

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentLength = req.headers.get("content-length");
    if (contentLength === "0") {
      init.body = undefined;
      headers.delete("content-length");
    } else if (req.body) {
      // Stream request body directly to backend without buffering into memory (O(1) memory footprint)
      init.body = req.body;
      (init as any).duplex = "half";
    }
  }

  try {
    const res = await fetch(targetUrl.toString(), init);

    const responseHeaders = new Headers();
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") {
        responseHeaders.append(key, value);
      }
    });

    const setCookies =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : [];
    if (setCookies.length > 0) {
      responseHeaders.delete("set-cookie");
      for (const cookie of setCookies) {
        responseHeaders.append("set-cookie", cookie);
      }
    }

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        statusCode: 502,
        message: "Failed to connect to backend API server.",
        error: error?.message ?? String(error),
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
