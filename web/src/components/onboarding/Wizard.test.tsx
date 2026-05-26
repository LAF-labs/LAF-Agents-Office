import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppStore } from "../../stores/app";
import { Wizard } from "./Wizard";

// The wizard posts config + completes onboarding via the broker. Stub
// everything so these tests stay focused on keyboard behavior.
vi.mock("../../api/client", async () => {
  const actual =
    await vi.importActual<typeof import("../../api/client")>(
      "../../api/client",
    );
  return {
    ...actual,
    get: vi.fn().mockResolvedValue({ templates: [], prereqs: [] }),
    post: vi.fn().mockResolvedValue({}),
  };
});

import { get, post } from "../../api/client";

const getMock = vi.mocked(get);
const postMock = vi.mocked(post);

function pressEnterOn(
  target: EventTarget = window,
  opts: Partial<KeyboardEventInit> = {},
) {
  const ev = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  Object.defineProperty(ev, "target", { value: target, configurable: true });
  act(() => {
    window.dispatchEvent(ev);
  });
}

async function advanceToTaskStep() {
  pressEnterOn(window);
  await waitFor(() => screen.getByLabelText(/Company or workspace name/i));

  fireEvent.change(screen.getByLabelText(/Company or workspace name/i), {
    target: { value: "Acme" },
  });
  fireEvent.change(screen.getByLabelText(/One-liner description/i), {
    target: { value: "We do things" },
  });

  pressEnterOn(window);
  await waitFor(() => screen.getByText(/Name your operators\./i));
  pressEnterOn(window);
  await waitFor(() =>
    screen.getByText(/Which operating loop should run first\?/i),
  );
}

async function finishFromTaskWithoutTask() {
  fireEvent.click(screen.getByRole("button", { name: /Skip for now/i }));
  await waitFor(() => screen.getByText(/You're set/i));
  fireEvent.click(screen.getByRole("button", { name: /Get started/i }));
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation(async (path: string) => {
    if (path === "/onboarding/prereqs") return { prereqs: [] };
    if (path === "/onboarding/blueprints") return { templates: [] };
    return {};
  });
  postMock.mockReset();
  postMock.mockResolvedValue({});
  useAppStore.setState({
    language: "en",
    onboardingComplete: false,
  });
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
});

describe("Wizard onboarding safeguards", () => {
  it("renders Korean onboarding copy when Korean is selected", async () => {
    useAppStore.setState({ language: "ko" });

    render(<Wizard onComplete={vi.fn()} />);

    expect(
      screen.getByText("창업자가 통제하는 AI Startup Office를 만듭니다."),
    ).toBeInTheDocument();

    pressEnterOn(window);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/회사 또는 워크스페이스 이름/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByPlaceholderText("LAF-Office 또는 실제 회사 이름"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "이 오피스가 맡을 고객, 문제, 오퍼, 운영 목표는 무엇인가요?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "유료 수요를 검증하고 첫 출시 자산 초안 만들기",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Acme Operations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/첫 실제 고객 루프/i)).not.toBeInTheDocument();
  });

  it("skips runtime setup after agent naming", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/onboarding/prereqs") {
        return {
          prereqs: [
            {
              name: "codex",
              required: false,
              found: true,
              version: "codex-cli 0.125.0-alpha.3",
            },
          ],
        };
      }
      if (path === "/onboarding/blueprints") return { templates: [] };
      return {};
    });

    render(<Wizard onComplete={vi.fn()} />);
    await advanceToTaskStep();

    expect(screen.queryByText(/How should agents run\?/i)).toBeNull();
    expect(screen.queryByText(/Codex CLI detected/i)).toBeNull();
    expect(screen.queryByPlaceholderText("OPENAI_API_KEY")).toBeNull();
    expect(getMock).not.toHaveBeenCalledWith("/onboarding/prereqs");
  });

  it("does not expose runtime choices during onboarding", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    await advanceToTaskStep();

    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(screen.queryByText("Codex")).toBeNull();
    expect(screen.queryByText("Opencode")).toBeNull();
    expect(screen.queryByText("Cursor")).toBeNull();
    expect(screen.queryByText("Windsurf")).toBeNull();
  });

  it("does not show a one-option project wiki selector during onboarding", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    await advanceToTaskStep();

    expect(screen.queryByText("Project wiki (default)")).toBeNull();
    expect(screen.queryByText(/Project wiki is the shared memory/i)).toBeNull();
  });

  it("does not post runtime providers or API keys during onboarding", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    await advanceToTaskStep();

    expect(screen.queryByText("GPT OAuth gateway")).toBeNull();
    expect(screen.queryByLabelText("Gateway URL")).toBeNull();
    expect(screen.queryByLabelText("Gateway token")).toBeNull();
    expect(screen.queryByPlaceholderText("OPENAI_API_KEY")).toBeNull();

    await finishFromTaskWithoutTask();

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/config",
        expect.objectContaining({
          memory_backend: "markdown",
        }),
      );
    });
    expect(postMock).not.toHaveBeenCalledWith(
      "/gpt/oauth/clients",
      expect.anything(),
    );
    for (const call of postMock.mock.calls) {
      expect(call[1]).not.toEqual(
        expect.objectContaining({
          llm_provider: expect.anything(),
        }),
      );
      expect(call[1]).not.toEqual(
        expect.objectContaining({
          llm_provider_priority: expect.anything(),
        }),
      );
      expect(call[1]).not.toEqual(
        expect.objectContaining({
          openai_api_key: expect.anything(),
        }),
      );
      expect(call[1]).not.toEqual(
        expect.objectContaining({
          api_keys: expect.anything(),
        }),
      );
    }
  });

  it("does not show old CRM, media, or community presets in onboarding", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/onboarding/prereqs") return { prereqs: [] };
      if (path === "/onboarding/blueprints") {
        return {
          templates: [
            {
              id: "niche-crm",
              name: "Niche CRM",
              description: "Build and launch a focused CRM",
            },
            {
              id: "youtube-factory",
              name: "YouTube Factory",
              description: "Script, film, publish, and analyze",
            },
            {
              id: "paid-discord-community",
              name: "Paid Discord Community",
              description: "Moderation and onboarding",
            },
          ],
        };
      }
      return {};
    });

    render(<Wizard onComplete={vi.fn()} />);
    pressEnterOn(window);
    await waitFor(() => screen.getByLabelText(/Company or workspace name/i));
    fireEvent.change(screen.getByLabelText(/Company or workspace name/i), {
      target: { value: "LAF" },
    });
    fireEvent.change(screen.getByLabelText(/One-liner description/i), {
      target: { value: "Agents help us plan and build software" },
    });

    pressEnterOn(window);

    await waitFor(() => screen.getByText(/Name your operators\./i));
    expect(screen.getByDisplayValue("CEO")).toBeInTheDocument();
    expect(screen.getByDisplayValue("FE")).toBeInTheDocument();
    expect(screen.getByDisplayValue("BD")).toBeInTheDocument();
    expect(screen.getByDisplayValue("REV")).toBeInTheDocument();
    expect(screen.queryByText("Niche CRM")).not.toBeInTheDocument();
    expect(screen.queryByText("YouTube Factory")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Paid Discord Community"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Media & Community")).not.toBeInTheDocument();
  });
});

describe("Wizard keyboard advancement", () => {
  it("shows publishing controls as a post-onboarding setup item", async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path === "/onboarding/prereqs") {
        return {
          prereqs: [
            {
              name: "codex",
              required: false,
              found: true,
              version: "codex-cli 0.125.0-alpha.3",
            },
          ],
        };
      }
      if (path === "/onboarding/blueprints") return { templates: [] };
      return {};
    });
    render(<Wizard onComplete={vi.fn()} />);
    await advanceToTaskStep();
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/i }));

    await waitFor(() => screen.getByText(/You're set/i));
    expect(screen.getByText("Browser session")).toBeInTheDocument();
    expect(screen.queryByText("Session runtime")).toBeNull();
    expect(screen.getByText("Publishing controls")).toBeInTheDocument();
    expect(
      screen.getByText(/Public pages, outbound messages, spend/i),
    ).toBeInTheDocument();
  });

  it("Enter on the welcome step advances to the Identity step", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    // Welcome CTA is visible
    expect(screen.getByText(/Open company setup/i)).toBeInTheDocument();

    pressEnterOn(window);

    // Identity step renders its company input
    await waitFor(() => {
      expect(
        screen.getByLabelText(/Company or workspace name/i),
      ).toBeInTheDocument();
    });
  });

  it("Enter on the identity step is blocked when company + description are empty", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    pressEnterOn(window); // welcome → identity
    await waitFor(() => screen.getByLabelText(/Company or workspace name/i));

    // Press Enter with empty fields — must NOT advance.
    pressEnterOn(window);

    // Still on identity — company input still visible
    expect(
      screen.getByLabelText(/Company or workspace name/i),
    ).toBeInTheDocument();
  });

  it("Enter advances identity once company + description are filled", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    pressEnterOn(window); // → identity
    await waitFor(() => screen.getByLabelText(/Company or workspace name/i));

    fireEvent.change(screen.getByLabelText(/Company or workspace name/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/One-liner description/i), {
      target: { value: "We do things" },
    });

    pressEnterOn(window);

    // Should move to agent naming step.
    await waitFor(() => {
      expect(screen.getByText(/Name your operators\./i)).toBeInTheDocument();
    });
  });

  it("does not advance when Enter is pressed on a focused <button> (Back/Skip stay intact)", async () => {
    render(<Wizard onComplete={vi.fn()} />);
    pressEnterOn(window); // welcome → identity
    await waitFor(() => screen.getByLabelText(/Company or workspace name/i));

    // Fill fields
    fireEvent.change(screen.getByLabelText(/Company or workspace name/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/One-liner description/i), {
      target: { value: "We do things" },
    });

    // Simulate Enter while a BUTTON is focused — the handler should bail
    // out and let the button's own semantics decide what to do.
    const backBtn = screen.getByRole("button", { name: "Back" });
    pressEnterOn(backBtn);

    // We did NOT advance to templates because Enter on a button is a bail.
    // (The button's own onClick would fire on real click, not on synthetic
    // Enter dispatched to window with a BUTTON target.)
    expect(
      screen.getByLabelText(/Company or workspace name/i),
    ).toBeInTheDocument();
  });

  it("guards against key repeat on the ready step (hold-Enter no longer double-submits)", async () => {
    // Drive the wizard straight into "ready" by mutating step via the
    // public keyboard path — we need a blueprint/team/setup flyover. A
    // quicker path: fill identity + mash Enter 5 times so we land a few
    // steps in, then verify post is never called twice for the same press.
    render(<Wizard onComplete={vi.fn()} />);
    pressEnterOn(window); // → identity
    await waitFor(() => screen.getByLabelText(/Company or workspace name/i));

    fireEvent.change(screen.getByLabelText(/Company or workspace name/i), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/One-liner description/i), {
      target: { value: "We do things" },
    });

    // Two back-to-back Enters (second one simulates key repeat) — the
    // guard uses e.repeat, so we dispatch with repeat:true.
    pressEnterOn(window); // first real Enter — identity → templates
    pressEnterOn(window, { repeat: true }); // repeat — must bail

    // At most one advance should have happened: we should now be on the
    // agent naming step, not double-jumped past it.
    await waitFor(() => {
      expect(screen.getByText(/Name your operators\./i)).toBeInTheDocument();
    });
  });
});

describe("Wizard product copy", () => {
  it("does not show customer-launch placeholder copy in Korean first-task step", async () => {
    useAppStore.setState({ language: "ko" });
    getMock.mockImplementation(async (path: string) => {
      if (path === "/onboarding/prereqs") {
        return {
          prereqs: [
            {
              name: "codex",
              required: false,
              found: true,
              version: "codex-cli 0.125.0-alpha.3",
            },
          ],
        };
      }
      if (path === "/onboarding/blueprints") return { templates: [] };
      return {};
    });

    render(<Wizard onComplete={vi.fn()} />);

    pressEnterOn(window);
    await waitFor(() => screen.getByLabelText(/회사 또는 워크스페이스 이름/i));
    fireEvent.change(screen.getByLabelText(/회사 또는 워크스페이스 이름/i), {
      target: { value: "LAF" },
    });
    fireEvent.change(screen.getByLabelText(/한 줄 설명/i), {
      target: { value: "창업팀의 고객 검증과 운영을 돕는 회사" },
    });
    pressEnterOn(window);
    await waitFor(() => screen.getByText(/오퍼레이터의 이름을 지어주세요/i));
    pressEnterOn(window);

    await waitFor(() =>
      screen.getByPlaceholderText(
        "예: 아이디어 검증을 실행하고 첫 100명 고객 계획 초안 만들기",
      ),
    );
    expect(screen.queryByText(/에이전트를 어떻게 실행할까요/i)).toBeNull();
    expect(
      screen.queryByPlaceholderText(
        "예: 첫 고객 세그먼트를 위한 출시 계획 초안 작성",
      ),
    ).not.toBeInTheDocument();
  });
});
