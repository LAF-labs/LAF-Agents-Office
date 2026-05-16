import { useUiText } from "../../lib/uiText";

interface ArticleTitleProps {
  title: string;
  strapline?: string;
}

export default function ArticleTitle({ title, strapline }: ArticleTitleProps) {
  const { wiki: copy } = useUiText();
  return (
    <>
      <h1 className="wk-article-title">{title}</h1>
      <div className="wk-strapline">{strapline ?? copy.articleStrapline}</div>
      <hr className="wk-title-divider" />
    </>
  );
}
