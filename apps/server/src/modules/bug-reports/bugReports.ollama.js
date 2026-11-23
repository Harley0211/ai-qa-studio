// Talks to the local Ollama model directly (the bug report tool doesn't need
// the n8n workflow: one request, one structured answer).

export function createOllamaClient({ baseUrl, model, timeoutMs = 10 * 60 * 1000, fetchImpl = fetch }) {
  return {
    model,
    async chat({ prompt, images = [], format, numPredict = 1600 }) {
      const numCtx = Math.min(32768, Math.max(8192, 4096 + Math.ceil(prompt.length / 3) + images.length * 1536 + numPredict));
      let res;
      try {
        res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            format,
            messages: [{ role: "user", content: prompt, images }],
            options: { temperature: 0.2, num_predict: numPredict, num_ctx: numCtx },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error?.name === "TimeoutError";
        const wrapped = new Error(
          timedOut
            ? "The AI model took too long to answer"
            : "Cannot reach the AI model (Ollama). Make sure Ollama is running",
        );
        wrapped.code = timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE";
        throw wrapped;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const error = new Error(
          res.status === 404 && /model/i.test(body)
            ? `The AI model "${model}" is not installed in Ollama`
            : `The AI model returned an error (${res.status})`,
        );
        error.code = "AI_ERROR";
        throw error;
      }

      const payload = await res.json();
      return payload?.message?.content ?? "";
    },
  };
}
