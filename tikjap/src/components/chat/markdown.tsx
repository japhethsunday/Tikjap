import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isValidHttpUrl } from "@/lib/utils";
import { CodeBlock } from "./code-block";

function SafeLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href || !isValidHttpUrl(href)) {
    return <span className="text-fg">{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

/**
 * Renders markdown (with GFM: tables, strikethrough, task lists) and
 * syntax-highlighted code. Raw HTML is never rendered (no rehype-raw), so
 * model output cannot inject scripts or markup.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: false }]]}
        components={{
          a: SafeLink,
          pre: ({ children }) => <>{children}</>,
          code: (props) => {
            const { className, children, ...rest } = props;
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <CodeBlock className={className} {...rest}>
                  {children}
                </CodeBlock>
              );
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}