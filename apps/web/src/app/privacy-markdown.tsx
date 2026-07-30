import type { Components } from 'react-markdown';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import './privacy.scss';

interface PrivacyMarkdownProps {
  source: string;
}

export function PrivacyMarkdown({ source }: PrivacyMarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => <h1 className="privacy-h1">{children}</h1>,
      h2: ({ children }) => <h2 className="privacy-h2">{children}</h2>,
      h3: ({ children }) => <h3 className="privacy-h3">{children}</h3>,
      h4: ({ children }) => <h4 className="privacy-h4">{children}</h4>,
      p: ({ children }) => <p className="privacy-p">{children}</p>,
      hr: () => <hr className="privacy-hr" />,
      ul: ({ children }) => <ul className="privacy-ul">{children}</ul>,
      ol: ({ children }) => <ol className="privacy-ol">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      table: ({ children }) => (
        <div className="privacy-table-wrap">
          <table className="privacy-table">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => <th>{children}</th>,
      td: ({ children }) => <td>{children}</td>,
      strong: ({ children }) => <strong>{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      a: ({ href, children }) => {
        if (href?.startsWith('/')) {
          return (
            <Link to={href} className="privacy-link">
              {children}
            </Link>
          );
        }
        return (
          <a
            href={href}
            className="privacy-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        );
      },
    }),
    [],
  );

  return (
    <article className="privacy-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </article>
  );
}
