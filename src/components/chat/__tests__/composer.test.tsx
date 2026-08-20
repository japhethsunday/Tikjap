import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "@/components/chat/composer";
import { ToastProvider } from "@/components/providers/toast";

function renderComposer(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  return render(
    <ToastProvider>
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        allowImages
        {...overrides}
      />
    </ToastProvider>
  );
}

describe("Composer", () => {
  it("sends text on Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderComposer({ onSend });

    await user.type(screen.getByLabelText("Message"), "Hello there");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Hello there", []);
  });

  it("does not send while streaming", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const onStop = vi.fn();
    renderComposer({ onSend, onStop, isStreaming: true });

    await user.type(screen.getByLabelText("Message"), "Hello");
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();

    const stop = screen.getByLabelText("Stop generating");
    expect(stop).toBeInTheDocument();
    await user.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps Shift+Enter for newlines", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderComposer({ onSend });

    const textarea = screen.getByLabelText("Message");
    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("line one\nline two", []);
  });

  it("shows the disabled reason as placeholder", () => {
    renderComposer({ disabled: true, disabledReason: "Rate limit reached" });
    expect(screen.getByPlaceholderText("Rate limit reached")).toBeInTheDocument();
  });
});