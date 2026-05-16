/** Chip-style category tags row above the page footer. */

import { useUiText } from "../../lib/uiText";

interface CategoriesFooterProps {
  tags: string[];
  onSelect?: (tag: string) => void;
}

export default function CategoriesFooter({
  tags,
  onSelect,
}: CategoriesFooterProps) {
  const { wiki: copy } = useUiText();
  if (tags.length === 0) return null;
  return (
    <section className="wk-categories" aria-label={copy.categoriesAria}>
      <span className="wk-label">{copy.categories}</span>
      {tags.map((tag) => (
        <a
          key={tag}
          href={`#/wiki?category=${encodeURIComponent(tag)}`}
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              onSelect(tag);
            }
          }}
        >
          {tag}
        </a>
      ))}
    </section>
  );
}
