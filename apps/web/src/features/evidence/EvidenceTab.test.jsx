import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

describe("Evidence tab", () => {
  it("displays uploaded evidence", async () => {
    mockApi({
      "GET /api/projects/p1": project({
        urls: [],
        urlCount: 0,
      }),
      "GET /api/projects/p1/evidence": {
        items: [
          {
            id: "e1",
            filename: "login-page.png",
            fileSize: 102400,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
      },
    });

    renderRoute("/projects/p1/evidence");

    expect(await screen.findByText("login-page.png")).toBeInTheDocument();
    expect(screen.getByText(/1 image selected of 1/)).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate from 1 image" }),
    ).toBeInTheDocument();
  });

  it("selects only new images and generates from the selection", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/evidence": {
        items: [
          { id: "e2", filename: "signup.png", fileSize: 10, createdAt: "2026-01-02T00:00:00.000Z", lastUsedAt: null },
          { id: "e1", filename: "login.png", fileSize: 10, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-01T10:00:00.000Z" },
        ],
        total: 2,
      },
      "POST /api/projects/p1/generations": { data: { id: "run1", status: "PENDING" } },
      "GET /api/projects/p1/generations/run1": { data: { id: "run1", status: "PENDING" } },
    });

    renderRoute("/projects/p1/evidence");

    const newImage = await screen.findByRole("checkbox", { name: "Use signup.png for generation" });
    const usedImage = screen.getByRole("checkbox", { name: "Use login.png for generation" });
    expect(newImage).toBeChecked();
    expect(usedImage).not.toBeChecked();
    expect(screen.getByText(/^Used ·/)).toBeInTheDocument();
    expect(screen.getByText(/1 new, 1 used/)).toBeInTheDocument();

    // Nothing selected: Generate is off and says why.
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Generate from 0 images" })).toBeDisabled();
    expect(screen.getByText("Select at least one image to start.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(newImage).toBeChecked();
    expect(usedImage).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Select new only" }));
    expect(usedImage).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Generate from 1 image" }));
    await screen.findByText("Test case generation started.");
    expect(mock.find("POST", "/api/projects/p1/generations")[0].body.evidenceIds).toEqual(["e2"]);
  });

  it("deletes used images after confirming", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/evidence": {
        items: [
          { id: "e1", filename: "login.png", fileSize: 10, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-01T10:00:00.000Z" },
        ],
        total: 1,
      },
      "POST /api/projects/p1/evidence/clear-used": { data: { deletedCount: 1 } },
    });

    renderRoute("/projects/p1/evidence");

    await user.click(await screen.findByRole("button", { name: "Clear used images" }));
    expect(screen.getByText(/1 image already used for test case generation/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete used images" }));

    expect(await screen.findByText("1 used image deleted.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/evidence/clear-used")).toHaveLength(1);
  });

  it("hides Clear used images when no image was used yet", async () => {
    mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/evidence": {
        items: [{ id: "e1", filename: "login.png", fileSize: 10, createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null }],
        total: 1,
      },
    });

    renderRoute("/projects/p1/evidence");

    await screen.findByText("login.png");
    expect(screen.queryByRole("button", { name: "Clear used images" })).not.toBeInTheDocument();
  });

  it("starts generation using uploaded evidence", async () => {
    const mock = mockApi({
      "GET /api/projects/p1": project({
        urls: [],
        urlCount: 0,
      }),
      "GET /api/projects/p1/evidence": {
        items: [
          {
            id: "e1",
            filename: "login-page.png",
            fileSize: 102400,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
      },
      "POST /api/projects/p1/generations": {
        data: {
          id: "run1",
          status: "PENDING",
        },
      },
      "GET /api/projects/p1/generations/run1": {
        data: {
          id: "run1",
          status: "PENDING",
        },
      },
    });

    renderRoute("/projects/p1/evidence");

    await screen.findByText("login-page.png");

    await userEvent.click(
      screen.getByRole("button", { name: "Generate from 1 image" }),
    );

    expect(
      await screen.findByText("Test case generation started."),
    ).toBeInTheDocument();

    const request = mock.find("POST", "/api/projects/p1/generations")[0];

    expect(request.body.evidenceIds).toEqual(["e1"]);
    expect(request.body.message).toContain("functional test cases");
    expect(request.body.generationFormat).toBe("OVERALL");
  });

  it("sends the per-step format when that card is chosen", async () => {
    const mock = mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/evidence": {
        items: [
          {
            id: "e1",
            filename: "login-page.png",
            fileSize: 102400,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
      },
      "POST /api/projects/p1/generations": { data: { id: "run1", status: "PENDING" } },
      "GET /api/projects/p1/generations/run1": { data: { id: "run1", status: "PENDING" } },
    });

    renderRoute("/projects/p1/evidence");
    await screen.findByText("login-page.png");

    const overall = screen.getByRole("radio", { name: /Overall expected result/ });
    const perStep = screen.getByRole("radio", { name: /Expected result per step/ });
    expect(overall).toBeChecked();

    await userEvent.click(perStep);
    expect(perStep).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Generate from 1 image" }));
    await screen.findByText("Test case generation started.");

    expect(
      mock.find("POST", "/api/projects/p1/generations")[0].body.generationFormat,
    ).toBe("PER_STEP");
  });
});
