import { describe, it, expect, vi } from "vitest";
import { createN8nClient } from "../src/modules/generation/generation.n8n.js";

const config = {
  webhookUrl: "http://127.0.0.1:5678/webhook-test/qa-generate",
  requestSecret: "test-secret-for-unit-tests-only",
};

describe("n8n client", () => {
  it("sends an authenticated POST request to n8n", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const client = createN8nClient({ ...config, fetchImpl });

    const result = await client.triggerGeneration({
      runId: "run-1",
      projectId: "project-1",
      message: "Generate login test cases",
    });

    expect(result).toEqual({ accepted: true, status: 200 });

    expect(fetchImpl).toHaveBeenCalledWith(
      config.webhookUrl,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AQS-Request-Secret": config.requestSecret,
        },
      }),
    );

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(requestBody.runId).toBe("run-1");
  });

  it("rejects when n8n is not configured", async () => {
    const client = createN8nClient({
      webhookUrl: undefined,
      requestSecret: undefined,
    });

    await expect(
      client.triggerGeneration({ runId: "run-1" }),
    ).rejects.toMatchObject({
      code: "N8N_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("handles connection errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("Connection refused"));
    const client = createN8nClient({ ...config, fetchImpl });

    await expect(
      client.triggerGeneration({ runId: "run-1" }),
    ).rejects.toMatchObject({
      code: "N8N_CONNECTION_ERROR",
      status: 502,
    });
  });

  it("handles request timeouts", async () => {
    const timeoutError = new Error("Request timed out");
    timeoutError.name = "TimeoutError";

    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);
    const client = createN8nClient({ ...config, fetchImpl });

    await expect(
      client.triggerGeneration({ runId: "run-1" }),
    ).rejects.toMatchObject({
      code: "N8N_TIMEOUT",
      status: 502,
    });
  });

  it("handles unsuccessful n8n responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const client = createN8nClient({ ...config, fetchImpl });

    await expect(
      client.triggerGeneration({ runId: "run-1" }),
    ).rejects.toMatchObject({
      code: "N8N_REQUEST_FAILED",
      status: 502,
    });
  });
});
