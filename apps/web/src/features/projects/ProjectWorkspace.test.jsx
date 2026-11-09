import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi, project, renderRoute } from "../../test/utils.jsx";

const withUrls = (urls = []) => project({ urls, urlCount: urls.length });
const url = (o = {}) => ({
  id: "u1",
  projectId: "p1",
  label: "Staging",
  url: "https://example.com/",
  ...o,
});

describe("Project workspace", () => {
  it('shows "Project not found" for an unknown project', async () => {
    mockApi({
      "GET /api/projects/missing": apiError(
        404,
        "NOT_FOUND",
        "Project not found",
      ),
    });
    renderRoute("/projects/missing");
    expect(await screen.findByText("Project not found")).toBeInTheDocument();
  });

  it("renders the overview with project details and workspace tabs", async () => {
    mockApi({ "GET /api/projects/p1": withUrls([url()]) });
    renderRoute("/projects/p1");

    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Project sections" });
    for (const name of ["Overview", "URLs", "Evidence", "Test cases"]) {
      expect(
        within(tabs).getByRole("link", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Project details")).toBeInTheDocument();
  });

  it("shows an empty state on the URLs tab", async () => {
    mockApi({ "GET /api/projects/p1": withUrls([]) });
    renderRoute("/projects/p1/urls");
    expect(await screen.findByText("No URLs yet")).toBeInTheDocument();
  });

  it("lists URLs as safe external links", async () => {
    mockApi({ "GET /api/projects/p1": withUrls([url()]) });
    renderRoute("/projects/p1/urls");
    const link = await screen.findByRole("link", { name: /example\.com/ });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("adds a URL and shows a success toast", async () => {
    let urls = [];
    const mock = mockApi({
      "GET /api/projects/p1": () => withUrls(urls),
      "POST /api/projects/p1/urls": (call) => {
        urls = [url({ url: call.body.url })];
        return new Response(JSON.stringify(urls[0]), { status: 201 });
      },
    });
    renderRoute("/projects/p1/urls");
    await screen.findByText("No URLs yet");

    await userEvent.click(screen.getByRole("button", { name: "Add URL" }));
    const dialog = screen.getByRole("dialog", { name: "Add application URL" });
    await userEvent.type(
      within(dialog).getByLabelText("URL"),
      "https://example.com/",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add URL" }),
    );

    expect(await screen.findByText("URL added")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/urls")[0].body).toEqual({
      url: "https://example.com/",
      label: null,
    });
    expect(
      await screen.findByRole("link", { name: /example\.com/ }),
    ).toBeInTheDocument();
  });

  it("rejects an invalid URL client-side", async () => {
    const mock = mockApi({ "GET /api/projects/p1": withUrls([]) });
    renderRoute("/projects/p1/urls");
    await screen.findByText("No URLs yet");

    await userEvent.click(screen.getByRole("button", { name: "Add URL" }));
    const dialog = screen.getByRole("dialog", { name: "Add application URL" });
    await userEvent.type(
      within(dialog).getByLabelText("URL"),
      "javascript:alert(1)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add URL" }),
    );

    expect(within(dialog).getByText(/valid http\(s\) URL/)).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/urls")).toHaveLength(0);
  });

  it("shows the server-side duplicate error on the URL field", async () => {
    mockApi({
      "GET /api/projects/p1": withUrls([url()]),
      "POST /api/projects/p1/urls": apiError(409, "DUPLICATE_URL", "dup", {
        url: "This URL is already registered for the project",
      }),
    });
    renderRoute("/projects/p1/urls");

    await userEvent.click(
      await screen.findByRole("button", { name: "Add URL" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add application URL" });
    await userEvent.type(
      within(dialog).getByLabelText("URL"),
      "https://example.com/",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add URL" }),
    );

    expect(
      await within(dialog).findByText(
        "This URL is already registered for the project",
      ),
    ).toBeInTheDocument();
  });

  it("removes a URL after confirmation", async () => {
    let urls = [url()];
    mockApi({
      "GET /api/projects/p1": () => withUrls(urls),
      "DELETE /api/projects/p1/urls/u1": () => {
        urls = [];
        return new Response(null, { status: 204 });
      },
    });
    renderRoute("/projects/p1/urls");

    await userEvent.click(
      await screen.findByRole("button", {
        name: /Remove https:\/\/example\.com/,
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Remove URL?" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove URL" }),
    );

    expect(await screen.findByText("URL removed")).toBeInTheDocument();
    expect(await screen.findByText("No URLs yet")).toBeInTheDocument();
  });

  it("renders the Evidence tab", async () => {
    mockApi({
      "GET /api/projects/p1": withUrls([]),
      "GET /api/projects/p1/evidence": [],
    });

    renderRoute("/projects/p1/evidence");

    expect(
      await screen.findByRole("heading", { name: "Evidence" }),
    ).toBeInTheDocument();
  });
});
