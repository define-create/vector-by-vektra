/**
 * Enter Match — recent-player chips fill slots in reading order.
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import EnterPage from "./page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockRole = "user";
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Me", role: mockRole } },
    status: "authenticated",
  }),
}));

const recent = ["Alice", "Bob", "Carol", "Dave"].map((name, i) => ({
  id: `id-${name}`,
  displayName: name,
  rating: 1000 + i,
  claimed: true,
  matchCount: 20,
}));

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response);
}

beforeAll(() => {
  // jsdom has no layout; the page scrolls the submit button into view.
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  mockRole = "user";
  global.fetch = jest.fn((url: string) => {
    if (url.startsWith("/api/players/recent")) return jsonResponse({ partners: recent, opponents: [] });
    if (url.startsWith("/api/tags")) return jsonResponse({ tags: [] });
    if (url.startsWith("/api/matches")) return jsonResponse({ ok: true, match: { id: "m1" } });
    return jsonResponse({ players: [] }); // name search: no existing players
  }) as jest.Mock;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The team card whose header reads `label` ("Your Partner", "Opponents", "Team 1", "Team 2"). */
function card(label: string): HTMLElement {
  return screen.getByText(label).closest(".rounded-2xl") as HTMLElement;
}

const chip = (name: string) => screen.findByRole("button", { name });
const emptyInputs = () => screen.getAllByPlaceholderText(/search or type a name/i);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Enter Match — chip order", () => {
  it("fills Partner, then Opponent 1, then Opponent 2", async () => {
    render(<EnterPage />);
    fireEvent.click(await chip("Alice"));
    fireEvent.click(await chip("Bob"));
    fireEvent.click(await chip("Carol"));

    expect(within(card("Your Partner")).getByText("Alice")).toBeInTheDocument();
    const opponents = within(card("Opponents"));
    expect(opponents.getByText("Bob")).toBeInTheDocument();
    expect(opponents.getByText("Carol")).toBeInTheDocument();
  });

  it("still fills Partner first after an opponent field was focused and left", async () => {
    // The reported bug: the screen remembered the last focused field and sent
    // the next chip there, putting the user's partner on Team 2.
    render(<EnterPage />);
    const opponent1Input = emptyInputs()[1]!;
    fireEvent.focus(opponent1Input);
    fireEvent.blur(opponent1Input);

    fireEvent.click(await chip("Alice"));

    expect(within(card("Your Partner")).getByText("Alice")).toBeInTheDocument();
    expect(within(card("Opponents")).queryByText("Alice")).not.toBeInTheDocument();
  });

  it("still fills Partner first after 'Enter another match'", async () => {
    // The every-time repro: type an opponent's name, submit, start again.
    render(<EnterPage />);
    const opponent2Input = emptyInputs()[2]!;
    fireEvent.focus(opponent2Input);
    fireEvent.change(opponent2Input, { target: { value: "Zed" } });
    fireEvent.click(await chip("Alice"));
    fireEvent.click(await chip("Bob"));

    fireEvent.click(screen.getAllByRole("button", { name: "WIN?" })[0]!); // Team 1 wins 11–…
    fireEvent.change(screen.getAllByRole("spinbutton")[1]!, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Match" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enter another match" }));

    fireEvent.click(await chip("Carol"));

    expect(within(card("Your Partner")).getByText("Carol")).toBeInTheDocument();
    expect(within(card("Opponents")).queryByText("Carol")).not.toBeInTheDocument();
  });

  it("fills Team 1 before Team 2 when entering on behalf of players", async () => {
    mockRole = "admin";
    render(<EnterPage />);
    fireEvent.click(screen.getAllByRole("switch")[0]!); // "Enter on behalf of players"

    for (const name of ["Alice", "Bob", "Carol", "Dave"]) fireEvent.click(await chip(name));

    const team1 = within(card("Team 1"));
    const team2 = within(card("Team 2"));
    expect(team1.getByText("Alice")).toBeInTheDocument();
    expect(team1.getByText("Bob")).toBeInTheDocument();
    expect(team2.getByText("Carol")).toBeInTheDocument();
    expect(team2.getByText("Dave")).toBeInTheDocument();
  });
});

describe("Enter Match — next-slot highlight", () => {
  it("marks the slot the next chip will fill, and moves as slots fill", async () => {
    render(<EnterPage />);
    await chip("Alice"); // highlight appears once chips have loaded

    const [partnerInput, opponent1Input, opponent2Input] = emptyInputs();
    expect(partnerInput).toHaveClass("border-dashed");
    expect(opponent1Input).not.toHaveClass("border-dashed");
    expect(opponent2Input).not.toHaveClass("border-dashed");

    fireEvent.click(await chip("Alice"));

    const [nextOpponent1, nextOpponent2] = emptyInputs();
    expect(nextOpponent1).toHaveClass("border-dashed");
    expect(nextOpponent2).not.toHaveClass("border-dashed");
  });

  it("shows no highlight once every slot is filled", async () => {
    render(<EnterPage />);
    for (const name of ["Alice", "Bob", "Carol"]) fireEvent.click(await chip(name));

    expect(screen.queryAllByPlaceholderText(/search or type a name/i)).toHaveLength(0);
    expect(document.querySelector(".border-dashed")).toBeNull();
  });
});
