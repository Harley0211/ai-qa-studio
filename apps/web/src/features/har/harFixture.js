// A small HAR like Chrome exports, for tests: a page load, a failing API
// call with a JSON error, a 404, a blocked request and a slow call.
const header = (name, value) => ({ name, value });

function entry({ method = "GET", url, status, statusText = "", mimeType = "application/json", body = "", time = 50, start, request = {}, extra = {} }) {
  return {
    startedDateTime: start,
    time,
    request: {
      method,
      url,
      headers: [header("Accept", "*/*"), ...(request.headers ?? [])],
      queryString: request.queryString ?? [],
      cookies: request.cookies ?? [],
      ...(request.postData ? { postData: request.postData } : {}),
    },
    response: {
      status,
      statusText,
      headers: [header("Content-Type", mimeType), ...(extra.responseHeaders ?? [])],
      cookies: extra.responseCookies ?? [],
      content: { size: body.length, mimeType, text: body },
      redirectURL: "",
    },
    timings: { blocked: 1, dns: 0, connect: 0, send: 1, wait: time - 4, receive: 2 },
    ...(extra.entry ?? {}),
  };
}

export const sampleHar = {
  log: {
    version: "1.2",
    creator: { name: "WebInspector", version: "537.36" },
    pages: [{ title: "https://shop.example/cart", startedDateTime: "2026-11-23T02:00:00.000Z" }],
    entries: [
      entry({
        url: "https://shop.example/cart",
        status: 200,
        statusText: "OK",
        mimeType: "text/html",
        body: "<html></html>",
        time: 120,
        start: "2026-11-23T02:00:00.000Z",
        extra: { entry: { _resourceType: "document" } },
      }),
      entry({
        method: "POST",
        url: "https://shop.example/api/orders?session_token=abc123",
        status: 500,
        statusText: "Internal Server Error",
        body: JSON.stringify({ error: { message: "Payment gateway timeout" } }),
        time: 812,
        start: "2026-11-23T02:00:01.000Z",
        request: {
          headers: [header("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"), header("Cookie", "sid=xyz")],
          cookies: [{ name: "sid", value: "xyz" }],
          postData: { mimeType: "application/json", text: JSON.stringify({ cardNumber: "4111111111111111", amount: 25, password: "hunter2" }) },
        },
        extra: { entry: { _resourceType: "fetch" }, responseHeaders: [header("Set-Cookie", "sid=new")] },
      }),
      entry({
        url: "https://shop.example/api/coupons/SAVE10",
        status: 404,
        statusText: "Not Found",
        body: JSON.stringify({ message: "Coupon not found" }),
        time: 40,
        start: "2026-11-23T02:00:02.000Z",
      }),
      entry({
        url: "https://ads.example/pixel.js",
        status: 0,
        statusText: "",
        mimeType: "",
        time: 0,
        start: "2026-11-23T02:00:02.500Z",
        extra: { entry: { _error: "net::ERR_BLOCKED_BY_CLIENT", _resourceType: "script" } },
      }),
      entry({
        url: "https://shop.example/api/recommendations",
        status: 200,
        statusText: "OK",
        body: "[]",
        time: 2400,
        start: "2026-11-23T02:00:03.000Z",
      }),
    ],
  },
};

export const sampleHarText = () => JSON.stringify(sampleHar);
