import { Sparkles, FileText, Code2, Globe2, Lightbulb } from "lucide-react";

const SUGGESTIONS = [
  { icon: <Lightbulb className="h-4 w-4" aria-hidden />, text: "Brainstorm ideas for my next product launch" },
  { icon: <Code2 className="h-4 w-4" aria-hidden />, text: "Write a TypeScript function that debounces user input" },
  { icon: <FileText className="h-4 w-4" aria-hidden />, text: "Summarize the key points of this research paper" },
  { icon: <Globe2 className="h-4 w-4" aria-hidden />, text: "Explain quantum computing in simple terms" },
];

export function ChatEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Sparkles className="h-7 w-7" aria-hidden />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-fg">How can I help today?</h2>
      <p className="mt-2 text-sm text-muted">Ask me anything, upload a document to analyze, or pick a suggestion to get started.</p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.text}
            type="button"
            onClick={() => onPick(suggestion.text)}
            className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-4 py-3.5 text-left text-sm text-fg transition-colors hover:border-accent/50 hover:bg-surface"
          >
            <span className="shrink-0 text-accent">{suggestion.icon}</span>
            <span className="line-clamp-2">{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}