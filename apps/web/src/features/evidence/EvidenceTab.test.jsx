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
    expect(screen.getByText("1 image")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate Test Cases" }),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Generate Test Cases" }),
    );

    expect(
      await screen.findByText("Test case generation started."),
    ).toBeInTheDocument();

    const request = mock.find("POST", "/api/projects/p1/generations")[0];

    expect(request.body.evidenceIds).toEqual(["e1"]);
    expect(request.body.message).toContain("functional test cases");
  });
});
