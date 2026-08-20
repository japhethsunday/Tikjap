import { CopyButton } from "./copy-button";

function extractLanguage(className?: string): string {
  if (!className) return "";
  const match = /language-([\w-]+)/.exec(className);
  return match?.[1] ?? "";
}

export function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const language = extractLanguage(className);
  const code = extractText(children);
  return (
    <div className="group/code relative">
      <div className="flex items-center justify-between rounded-t-[10px] border-b border-white/10 bg-[#15171f] px-3 py-1.5">
        <span className="text-xs font-medium text-zinc-400">{language || "text"}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre className="!mt-0 !rounded-t-none">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as { props: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}