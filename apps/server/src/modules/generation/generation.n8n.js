const REQUEST_TIMEOUT_MS = 15_000;

export function createN8nClient({
  webhookUrl,
  requestSecret,
  fetchImpl = fetch,
}) {
  async function triggerGeneration(payload) {
    if (!webhookUrl || !requestSecret) {
      const error = new Error("n8n integration is not configured");
      error.code = "N8N_NOT_CONFIGURED";
      error.status = 503;
      throw error;
    }

    let response;

    try {
      response = await fetchImpl(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AQS-Request-Secret": requestSecret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      const error = new Error(
        cause?.name === "TimeoutError" || cause?.name === "AbortError"
          ? "n8n request timed out"
          : "Unable to connect to n8n",
      );

      error.code =
        cause?.name === "TimeoutError" || cause?.name === "AbortError"
          ? "N8N_TIMEOUT"
          : "N8N_CONNECTION_ERROR";

      error.status = 502;
      throw error;
    }

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("[n8n] Webhook request failed:", {
        status: response.status,
        body: responseBody,
      });

      const error = new Error(
        `n8n rejected the generation request (${response.status})`,
      );
      error.code = "N8N_REQUEST_FAILED";
      error.status = 502;
      throw error;
    }

    return {
      accepted: true,
      status: response.status,
    };
  }

  return { triggerGeneration };
}
