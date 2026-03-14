import ReactMarkdown from "react-markdown";

type Props = {
  children: string;
};

const components = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mt-3 first:mt-0">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mt-4 text-lg font-semibold text-slate-100">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mt-4 text-base font-semibold text-slate-100">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-3 text-sm font-semibold text-slate-100">{children}</h3>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
};

export function MarkdownProse({ children }: Props) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}
