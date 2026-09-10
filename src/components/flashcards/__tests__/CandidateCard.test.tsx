// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CandidateCard } from "@/components/flashcards/CandidateCard";
import type { FlashcardCandidate } from "@/types";

// Risk #1 (context/foundation/test-plan.md §2, research.md "Risk #1" verdict):
// every assertion below reads the actually-dispatched `fetch` call (URL, method,
// body) or its call count — never CandidateCard's internal `question`/`answer`
// state — to avoid the oracle-problem trap research.md flagged.

function makeCandidate(): FlashcardCandidate {
  return { question: "What is Vitest?", answer: "A Vite-native test runner." };
}

function okResponse(): Response {
  return { ok: true } as Response;
}

describe("CandidateCard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the candidate as-is: POST body matches exactly what was shown", async () => {
    const user = userEvent.setup();
    const candidate = makeCandidate();
    const onAccepted = vi.fn();
    fetchMock.mockResolvedValueOnce(okResponse());

    render(<CandidateCard candidate={candidate} onAccepted={onAccepted} onRejected={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/flashcards");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      question: candidate.question,
      answer: candidate.answer,
    });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it("accepts after editing: POST body reflects the edited text, not the original candidate", async () => {
    const user = userEvent.setup();
    const candidate = makeCandidate();
    fetchMock.mockResolvedValueOnce(okResponse());

    render(<CandidateCard candidate={candidate} onAccepted={vi.fn()} onRejected={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const [questionBox, answerBox] = screen.getAllByRole("textbox");
    await user.clear(questionBox);
    await user.type(questionBox, "Edited question");
    await user.clear(answerBox);
    await user.type(answerBox, "Edited answer");

    await user.click(screen.getByRole("button", { name: "Accept" }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      question: "Edited question",
      answer: "Edited answer",
    });
  });

  it("rejects without ever calling the network", async () => {
    const user = userEvent.setup();
    const onRejected = vi.fn();

    render(<CandidateCard candidate={makeCandidate()} onAccepted={vi.fn()} onRejected={onRejected} />);
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it("blocks a second Accept click while the first request is still in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    render(<CandidateCard candidate={makeCandidate()} onAccepted={vi.fn()} onRejected={vi.fn()} />);
    const acceptButton = screen.getByRole("button", { name: "Accept" });

    await user.click(acceptButton);
    expect(acceptButton).toBeDisabled();
    await user.click(acceptButton);

    resolveFetch(okResponse());
    await vi.waitFor(() => expect(acceptButton).not.toBeDisabled());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
