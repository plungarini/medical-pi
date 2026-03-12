import { NextRequest, NextResponse } from "next/server";

// API runs on PORT + 1000 (default 4003)
const API_BASE = "http://127.0.0.1:4003";

async function handleRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  const pathString = path.join("/");

  // Build the target URL
  const url = new URL(request.url);
  const targetUrl = new URL(pathString + url.search, API_BASE);
  
  console.log(`[PROXY] ${request.method} ${request.url} -> ${targetUrl.toString()}`);

  // Clone headers and add auth if present
  const headers = new Headers(request.headers);
  headers.delete("host"); // Remove host to avoid conflicts

  const authToken = request.cookies.get("auth-token")?.value;
  if (authToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${authToken}`);
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      // @ts-expect-error — Next.js fetch supports duplex for streaming request bodies
      duplex: "half",
    });

    // Create response headers
    const responseHeaders = new Headers(response.headers);

    // Handle 204 No Content
    if (response.status === 204) {
      return new NextResponse(null, {
        status: 204,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // Stream SSE and other streamed responses directly — do NOT buffer with response.text()
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("API proxy error:", error);
    return NextResponse.json(
      { error: "Failed to connect to API server" },
      { status: 503 }
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
