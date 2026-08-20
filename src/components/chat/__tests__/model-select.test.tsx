import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelect } from "@/components/chat/model-select";
import type { AIModel } from "@/lib/types";

const models: AIModel[] = [
  { id: "tikja-mini", name: "Tikja Mini", description: "Fast", provider: "demo", contextWindow: 8192, maxOutputTokens: 4096, capabilities: { vision: false, files: false, streaming: true, toolUse: false }, isDefault: false },
  { id: "tikja-1", name: "Tikja 1", description: "Balanced", provider: "demo", contextWindow: 16384, maxOutputTokens: 8192, capabilities: { vision: false, files: true, streaming: true, toolUse: true }, isDefault: true },
  { id: "tikja-vision", name: "Tikja Vision", description: "Sees images", provider: "demo", contextWindow: 32768, maxOutputTokens: 16384, capabilities: { vision: true, files: true, streaming: true, toolUse: true }, isDefault: false },
];

describe("ModelSelect", () => {
  it("shows the selected model name", () => {
    render(<ModelSelect models={models} value="tikja-1" onChange={() => undefined} />);
    expect(screen.getByText("Tikja 1")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<ModelSelect models={[]} value="" onChange={() => undefined} loading />);
    expect(screen.getByText(/loading models/i)).toBeInTheDocument();
  });

  it("opens the list and lets the user choose a model", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModelSelect models={models} value="tikja-1" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Tikja 1/i }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    await user.click(screen.getByRole("option", { name: /Tikja Vision/i }));
    expect(onChange).toHaveBeenCalledWith("tikja-vision");
  });

  it("marks the default model", async () => {
    const user = userEvent.setup();
    render(<ModelSelect models={models} value="" onChange={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /select model/i }));
    expect(screen.getByText("Default")).toBeInTheDocument();
  });
});