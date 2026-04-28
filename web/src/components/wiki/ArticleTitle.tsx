interface ArticleTitleProps {
  title: string;
  strapline?: string;
}

const DEFAULT_STRAPLINE =
  "Project memory for decisions, constraints, and delivery notes.";

export default function ArticleTitle({
  title,
  strapline = DEFAULT_STRAPLINE,
}: ArticleTitleProps) {
  return (
    <>
      <h1 className="wk-article-title">{title}</h1>
      <div className="wk-strapline">{strapline}</div>
      <hr className="wk-title-divider" />
    </>
  );
}
