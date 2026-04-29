import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { WikiCatalogEntry } from "../../api/wiki";
import WikiCatalog from "./WikiCatalog";

const CATALOG: WikiCatalogEntry[] = [
  {
    path: "people/nazz",
    title: "Nazz",
    author_slug: "pm",
    last_edited_ts: new Date().toISOString(),
    group: "people",
  },
  {
    path: "people/sarah",
    title: "Sarah",
    author_slug: "ceo",
    last_edited_ts: new Date().toISOString(),
    group: "people",
  },
  {
    path: "playbooks/churn",
    title: "Churn",
    author_slug: "cmo",
    last_edited_ts: new Date().toISOString(),
    group: "playbooks",
  },
];

describe("<WikiCatalog>", () => {
  it("renders thematic groups with article counts", () => {
    render(<WikiCatalog catalog={CATALOG} onNavigate={() => {}} />);
    expect(
      screen.getByRole("heading", { name: "Project memory" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/project goals, decisions, task history/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/git clone/)).not.toBeInTheDocument();
    expect(screen.getByText("people")).toBeInTheDocument();
    expect(screen.getByText("playbooks")).toBeInTheDocument();
    expect(screen.getAllByText("Nazz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Churn").length).toBeGreaterThan(0);
  });

  it("invokes onNavigate when an article title is clicked", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<WikiCatalog catalog={CATALOG} onNavigate={onNavigate} />);
    await user.click(screen.getAllByRole("button", { name: "Nazz" })[0]);
    expect(onNavigate).toHaveBeenCalledWith("people/nazz");
  });

  it("uses provided stats in the header", () => {
    render(
      <WikiCatalog
        catalog={CATALOG}
        onNavigate={() => {}}
        articlesCount={32}
        commitsCount={128}
        agentsCount={6}
      />,
    );
    expect(screen.getByText(/32 articles/)).toBeInTheDocument();
    expect(screen.queryByText(/128 commits/)).not.toBeInTheDocument();
    expect(screen.getByText(/6 agent updates/)).toBeInTheDocument();
  });
});
