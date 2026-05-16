import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "unified";

import type { EntityKind } from "../../api/entity";
import { detectPlaybook } from "../../api/playbook";
import {
  fetchArticle,
  fetchHistory,
  fetchHumans,
  type HumanIdentity,
  subscribeEditLog,
  type WikiArticle as WikiArticleT,
  type WikiCatalogEntry,
  type WikiHistoryCommit,
} from "../../api/wiki";
import { formatAgentName } from "../../lib/agentName";
import {
  buildMarkdownComponents,
  buildRehypePlugins,
  buildRemarkPlugins,
} from "../../lib/wikiMarkdownConfig";
import { useUiText } from "../../lib/uiText";
import ArticleStatusBanner from "./ArticleStatusBanner";
import ArticleTitle from "./ArticleTitle";
import Byline from "./Byline";
import CategoriesFooter from "./CategoriesFooter";
import CiteThisPagePanel from "./CiteThisPagePanel";
import EntityBriefBar from "./EntityBriefBar";
import EntityRelatedPanel from "./EntityRelatedPanel";
import FactsOnFile from "./FactsOnFile";
import HatBar, { type HatBarTab } from "./HatBar";
import Hatnote from "./Hatnote";
import PageFooter from "./PageFooter";
import PageStatsPanel from "./PageStatsPanel";
import PlaybookExecutionLog from "./PlaybookExecutionLog";
import PlaybookSkillBadge from "./PlaybookSkillBadge";
import ReferencedBy from "./ReferencedBy";
import SeeAlso from "./SeeAlso";
import type { SourceItem } from "./Sources";
import Sources from "./Sources";
import TocBox, { type TocEntry } from "./TocBox";
import WikiEditor from "./WikiEditor";

// Real backend paths look like `team/people/nazz.md`. Mock/dev paths may
// drop the `team/` prefix or the `.md` suffix. Accept both so the entity
// surface lights up in demos without forcing every caller to normalize.
const ENTITY_PATH_RE =
  /^(?:team\/)?(people|companies|customers)\/([a-z0-9][a-z0-9-]*)(?:\.md)?$/;

function detectEntity(path: string): { kind: EntityKind; slug: string } | null {
  const m = path.match(ENTITY_PATH_RE);
  if (!m) return null;
  return { kind: m[1] as EntityKind, slug: m[2] };
}

interface ArticleState {
  article: WikiArticleT | null;
  loading: boolean;
  error: string | null;
}

function useHumanIdentities(): HumanIdentity[] {
  const [humans, setHumans] = useState<HumanIdentity[]>([]);

  // Fetch the human registry once per mount. The list is small (a handful
  // of team members) and changes rarely, so we skip refetching on every
  // path change. Failure falls through to an empty list — Byline gracefully
  // shows the agent path when no human identity matches.
  useEffect(() => {
    let cancelled = false;
    fetchHumans()
      .then((list) => {
        if (!cancelled) setHumans(list);
      })
      .catch(() => {
        if (!cancelled) setHumans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return humans;
}

function useArticleData(
  path: string,
  refreshNonce: number,
  externalRefreshNonce: number,
): ArticleState {
  const [article, setArticle] = useState<WikiArticleT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Nonces intentionally retrigger the fetch even though the request URL is path-only.
    void refreshNonce;
    void externalRefreshNonce;
    setLoading(true);
    setError(null);
    fetchArticle(path)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load article");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, refreshNonce, externalRefreshNonce]);

  return { article, loading, error };
}

function useArticleHistory(
  path: string,
  refreshNonce: number,
  externalRefreshNonce: number,
) {
  const [historyCommits, setHistoryCommits] = useState<
    WikiHistoryCommit[] | null
  >(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Nonces intentionally retrigger the fetch even though the request URL is path-only.
    void refreshNonce;
    void externalRefreshNonce;
    setHistoryCommits(null);
    setHistoryLoading(true);
    setHistoryError(false);
    fetchHistory(path)
      .then((res) => {
        if (cancelled) return;
        setHistoryCommits(res.commits ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        // Graceful degradation: missing history should not block the article read.
        setHistoryError(true);
        setHistoryCommits([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, refreshNonce, externalRefreshNonce]);

  return { historyCommits, historyLoading, historyError };
}

function useLiveArticleAgent(path: string): string | null {
  const [liveAgent, setLiveAgent] = useState<string | null>(null);

  useEffect(() => {
    setLiveAgent(null);
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeEditLog((entry) => {
      if (entry.article_path !== path) return;
      setLiveAgent(entry.who);
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setLiveAgent(null), 10_000);
    });
    return () => {
      if (clearTimer) clearTimeout(clearTimer);
      unsubscribe();
    };
  }, [path]);

  return liveAgent;
}

interface WikiArticleProps {
  path: string;
  catalog: WikiCatalogEntry[];
  onNavigate: (path: string) => void;
  /**
   * Bumped by Pam (now hoisted to the Wiki shell) when an action completes,
   * so the article + history refetch without a navigation. Treated as an
   * additive trigger on top of the local refreshNonce used by inline edits.
   */
  externalRefreshNonce?: number;
}

export default function WikiArticle({
  path,
  catalog,
  onNavigate,
  externalRefreshNonce = 0,
}: WikiArticleProps) {
  const { wiki: copy } = useUiText();
  const [tab, setTab] = useState<HatBarTab>("article");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const humans = useHumanIdentities();
  const { article, loading, error } = useArticleData(
    path,
    refreshNonce,
    externalRefreshNonce,
  );
  const { historyCommits, historyLoading, historyError } = useArticleHistory(
    path,
    refreshNonce,
    externalRefreshNonce,
  );
  const liveAgent = useLiveArticleAgent(path);

  const sourceItems = useMemo<SourceItem[]>(() => {
    if (!historyCommits) return [];
    return historyCommits.map((c) => ({
      commitSha: c.sha,
      authorSlug: c.author_slug,
      authorName: formatAgentName(c.author_slug),
      msg: c.msg,
      date: c.date,
    }));
  }, [historyCommits]);

  const catalogSlugs = useMemo(
    () => new Set(catalog.map((c) => c.path)),
    [catalog],
  );
  const resolver = useMemo(
    () => (slug: string) => catalogSlugs.has(slug),
    [catalogSlugs],
  );

  const remarkPlugins: PluggableList = useMemo(
    () => buildRemarkPlugins(resolver),
    [resolver],
  );
  const rehypePlugins: PluggableList = useMemo(() => buildRehypePlugins(), []);
  const markdownComponents = useMemo(
    () => buildMarkdownComponents({ resolver, onNavigate }),
    [resolver, onNavigate],
  );

  if (loading) return <div className="wk-loading">{copy.articleLoading}</div>;
  if (error) return <div className="wk-error">{copy.articleError(error)}</div>;
  if (!article) return <div className="wk-error">{copy.articleNotFound}</div>;

  const toc = buildTocFromMarkdown(article.content);
  const entity = detectEntity(article.path);
  const playbook = detectPlaybook(article.path);
  const breadcrumbSegments = article.path.split("/").filter(Boolean);
  const context = breadcrumbSegments[0] || "";
  const byline = (
    <Byline
      authorSlug={article.last_edited_by}
      authorName={formatAgentName(article.last_edited_by)}
      lastEditedTs={article.last_edited_ts}
      revisions={article.revisions}
      humans={humans}
    />
  );

  return (
    <>
      <main className="wk-article-col">
        <LiveArticleStatus
          liveAgent={liveAgent}
          article={article}
          copy={copy}
        />
        <ArticleIdentityPanels
          entity={entity}
          playbook={playbook}
          onRefresh={() => setRefreshNonce((n) => n + 1)}
        />
        <HatBar
          active={tab}
          onChange={setTab}
          rightRail={context ? [context] : undefined}
        />
        <ArticleBreadcrumb
          article={article}
          onNavigate={onNavigate}
          rootLabel={copy.breadcrumbRoot}
        />
        <ArticleTitle title={article.title} strapline={copy.articleStrapline} />
        {byline}
        <Hatnote>{copy.articleHatnote}</Hatnote>
        {tab === "article" && (
          <div className="wk-article-body" data-testid="wk-article-body">
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={markdownComponents}
            >
              {article.content}
            </ReactMarkdown>
          </div>
        )}
        {tab === "edit" && (
          <WikiEditor
            path={article.path}
            initialContent={article.content}
            expectedSha={article.commit_sha ?? ""}
            serverLastEditedTs={article.last_edited_ts}
            catalog={catalog}
            onSaved={(newSha) => {
              // Refetch after every save — covers both happy path and
              // the conflict-then-reload path (which passes the server's
              // current_sha back as newSha).
              void newSha;
              setRefreshNonce((n) => n + 1);
              setTab("article");
            }}
            onCancel={() => setTab("article")}
          />
        )}
        {tab === "raw" && (
          <pre
            style={{
              fontFamily: "var(--wk-mono)",
              background: "var(--wk-code-bg)",
              padding: 16,
              border: "1px solid var(--wk-border)",
              overflowX: "auto",
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {article.content}
          </pre>
        )}
        {tab === "history" && (
          <div className="wk-loading">{copy.articleHistoryPreparing}</div>
        )}
        <ArticleSupplementPanels
          entity={entity}
          playbook={playbook}
          activeTab={tab}
        />
        <SeeAlso
          items={article.backlinks.map((b) => ({
            slug: b.path,
            display: b.title,
          }))}
          onNavigate={onNavigate}
        />
        {historyError ? null : (
          <Sources items={sourceItems} loading={historyLoading} />
        )}
        <CategoriesFooter tags={article.categories} />
        <PageFooter
          lastEditedBy={formatArticleAuthor(
            article.last_edited_by,
            humans,
            copy,
          )}
          lastEditedTs={article.last_edited_ts}
          articlePath={article.path}
        />
      </main>
      <aside className="wk-right-sidebar">
        <TocBox entries={toc} />
        <PageStatsPanel
          revisions={article.revisions}
          contributors={article.contributors.length}
          wordCount={article.word_count}
          created={article.last_edited_ts}
          lastEdit={article.last_edited_ts}
        />
        <CiteThisPagePanel slug={article.path} />
        <ReferencedBy backlinks={article.backlinks} onNavigate={onNavigate} />
      </aside>
    </>
  );
}

interface BreadcrumbItem {
  segment: string;
  path: string;
}

type DetectedEntity = { kind: EntityKind; slug: string };
type DetectedPlaybook = ReturnType<typeof detectPlaybook>;

interface LiveArticleStatusProps {
  liveAgent: string | null;
  article: WikiArticleT;
  copy: ReturnType<typeof useUiText>["wiki"];
}

function LiveArticleStatus({
  liveAgent,
  article,
  copy,
}: LiveArticleStatusProps) {
  if (!liveAgent) return null;

  return (
    <ArticleStatusBanner
      message={copy.liveEditing(formatAgentName(liveAgent))}
      liveAgent={liveAgent}
      revisions={article.revisions}
      contributors={article.contributors.length}
      wordCount={article.word_count}
    />
  );
}

interface ArticleIdentityPanelsProps {
  entity: DetectedEntity | null;
  playbook: DetectedPlaybook;
  onRefresh: () => void;
}

function ArticleIdentityPanels({
  entity,
  playbook,
  onRefresh,
}: ArticleIdentityPanelsProps) {
  return (
    <>
      {entity ? (
        <EntityBriefBar
          kind={entity.kind}
          slug={entity.slug}
          onSynthesized={onRefresh}
        />
      ) : null}
      {playbook ? <PlaybookSkillBadge slug={playbook.slug} /> : null}
    </>
  );
}

interface ArticleSupplementPanelsProps {
  entity: DetectedEntity | null;
  playbook: DetectedPlaybook;
  activeTab: HatBarTab;
}

function ArticleSupplementPanels({
  entity,
  playbook,
  activeTab,
}: ArticleSupplementPanelsProps) {
  if (activeTab !== "article") return null;

  return (
    <>
      {entity ? <FactsOnFile kind={entity.kind} slug={entity.slug} /> : null}
      {entity ? (
        <EntityRelatedPanel kind={entity.kind} slug={entity.slug} />
      ) : null}
      {playbook ? <PlaybookExecutionLog slug={playbook.slug} /> : null}
    </>
  );
}

function buildBreadcrumbItems(articlePath: string): BreadcrumbItem[] {
  let currentPath = "";
  return articlePath
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      return { segment, path: currentPath };
    });
}

function formatArticleAuthor(
  authorSlug: string,
  humans: HumanIdentity[],
  copy: ReturnType<typeof useUiText>["wiki"],
): string {
  const registeredHuman = humans.find((human) => human.slug === authorSlug);
  if (registeredHuman) return registeredHuman.name;
  if (authorSlug.toLowerCase() === "human") return copy.human;
  return formatAgentName(authorSlug);
}

interface ArticleBreadcrumbProps {
  article: WikiArticleT;
  onNavigate: (path: string) => void;
  rootLabel: string;
}

function ArticleBreadcrumb({
  article,
  onNavigate,
  rootLabel,
}: ArticleBreadcrumbProps) {
  const breadcrumbItems = buildBreadcrumbItems(article.path);
  const lastBreadcrumbPath = breadcrumbItems[breadcrumbItems.length - 1]?.path;

  return (
    <div className="wk-breadcrumb">
      <button type="button" onClick={() => onNavigate("")}>
        {rootLabel}
      </button>
      {breadcrumbItems.map(({ segment, path: itemPath }) => (
        <span key={itemPath} style={{ display: "contents" }}>
          <span className="sep">›</span>
          {itemPath !== lastBreadcrumbPath ? (
            <button type="button" onClick={() => onNavigate(itemPath)}>
              {segment}
            </button>
          ) : (
            <span>{article.title}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function buildTocFromMarkdown(md: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = md.split("\n");
  let h2Count = 0;
  let h3Count = 0;
  const h2Re = /^##\s+(.+)$/;
  const h3Re = /^###\s+(.+)$/;
  for (const line of lines) {
    const h3 = line.match(h3Re);
    if (h3) {
      h3Count += 1;
      const title = h3[1].trim();
      out.push({
        level: 2,
        num: `${h2Count}.${h3Count}`,
        anchor: slugify(title),
        title,
      });
      continue;
    }
    const h2 = line.match(h2Re);
    if (h2) {
      h2Count += 1;
      h3Count = 0;
      const title = h2[1].trim();
      out.push({
        level: 1,
        num: String(h2Count),
        anchor: slugify(title),
        title,
      });
    }
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
