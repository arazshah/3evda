import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlogArticle, BlogArticleDetail } from "@/lib/site/types";
import { ArticleCard } from "./ArticleCard";
import { ArticleView } from "./ArticleView";
import { Pagination } from "./Pagination";

const article = (extra: Partial<BlogArticle> = {}): BlogArticle => ({
  language: "fa",
  slug: "طعم-قهوه",
  title: "طعم قهوه",
  summary: "خلاصه‌ی مقاله",
  cover: null,
  category: { slug: "food", title_fa: "غذا", title_en: "Food" },
  tags: [],
  reading_minutes: 3,
  published_at: "2026-10-03T08:00:00Z",
  ...extra,
});

const labels = { readingTime: "{minutes} دقیقه مطالعه" };

describe("ArticleCard", () => {
  it("links the title and category with locale-aware, encoded paths", () => {
    render(<ArticleCard article={article()} locale="fa" labels={labels} />);
    expect(screen.getByRole("link", { name: "طعم قهوه" })).toHaveAttribute(
      "href",
      `/blog/${encodeURIComponent("طعم-قهوه")}`,
    );
    expect(screen.getByRole("link", { name: "غذا" })).toHaveAttribute("href", "/blog/category/food");
    expect(screen.getByText(/دقیقه مطالعه/)).toHaveTextContent("۳ دقیقه مطالعه");
    expect(screen.getByText("خلاصه‌ی مقاله")).toBeInTheDocument();
  });

  it("uses the English prefix, title and number format in English", () => {
    render(
      <ArticleCard
        article={article({ language: "en", slug: "coffee", title: "Coffee" })}
        locale="en"
        labels={{ readingTime: "{minutes} min read" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Coffee" })).toHaveAttribute("href", "/en/blog/coffee");
    expect(screen.getByRole("link", { name: "Food" })).toHaveAttribute("href", "/en/blog/category/food");
    expect(screen.getByText(/min read/)).toHaveTextContent("3 min read");
  });

  it("copes with an article that has no category, cover or summary", () => {
    render(<ArticleCard article={article({ category: null, summary: "" })} locale="fa" labels={labels} />);
    expect(screen.queryByRole("link", { name: "غذا" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("Pagination", () => {
  const paginationLabels = {
    navigation: "صفحه‌بندی",
    previous: "قبلی",
    next: "بعدی",
    pageOf: "صفحه {page} از {pages}",
  };

  it("renders nothing for a single page", () => {
    const { container } = render(
      <Pagination page={1} pages={1} base="/blog" locale="fa" labels={paginationLabels} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the neighbouring pages and keeps filters in the base path", () => {
    render(<Pagination page={2} pages={3} base="/blog/tag/coffee" locale="en" labels={paginationLabels} />);
    const nav = screen.getByRole("navigation", { name: "صفحه‌بندی" });
    expect(within(nav).getByRole("link", { name: "قبلی" })).toHaveAttribute("href", "/en/blog/tag/coffee");
    expect(within(nav).getByRole("link", { name: "بعدی" })).toHaveAttribute(
      "href",
      "/en/blog/tag/coffee?page=3",
    );
    expect(within(nav).getByText("صفحه 2 از 3")).toBeInTheDocument();
  });

  it("has no previous link on the first page and no next link on the last", () => {
    const { rerender } = render(
      <Pagination page={1} pages={2} base="/blog" locale="fa" labels={paginationLabels} />,
    );
    expect(screen.queryByRole("link", { name: "قبلی" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "بعدی" })).toHaveAttribute("href", "/blog?page=2");
    rerender(<Pagination page={2} pages={2} base="/blog" locale="fa" labels={paginationLabels} />);
    expect(screen.queryByRole("link", { name: "بعدی" })).not.toBeInTheDocument();
  });
});

describe("ArticleView", () => {
  const detail = (extra: Partial<BlogArticleDetail> = {}): BlogArticleDetail => ({
    ...article(),
    body_html: "<h2>تیتر</h2><p>متن <strong>پررنگ</strong></p>",
    seo_title: "عنوان گوگل",
    seo_description: "",
    og_image: null,
    alternates: [],
    related_articles: [],
    related_projects: [],
    previous: null,
    next: null,
    ...extra,
  });
  const viewLabels = {
    ...labels,
    previous: "قبلی",
    next: "بعدی",
    relatedArticles: "مقاله‌های مرتبط",
    relatedProjects: "نمونه‌کارهای مرتبط",
    tags: "برچسب‌ها",
  };

  it("shows one h1, the rendered body and links tags and neighbours", () => {
    render(
      <ArticleView
        article={detail({
          tags: [{ slug: "tips", title_fa: "نکته", title_en: "Tip" }],
          previous: "old",
          next: "new",
        })}
        locale="fa"
        labels={viewLabels}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("طعم قهوه");
    expect(screen.getByRole("heading", { level: 2, name: "تیتر" })).toBeInTheDocument();
    expect(screen.getByText("پررنگ").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "نکته" })).toHaveAttribute("href", "/blog/tag/tips");
    expect(screen.getByRole("link", { name: /قبلی/ })).toHaveAttribute("href", "/blog/old");
    expect(screen.getByRole("link", { name: /بعدی/ })).toHaveAttribute("href", "/blog/new");
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // not a preview
  });

  it("marks a draft preview clearly and lists related articles", () => {
    render(
      <ArticleView
        article={detail({ related_articles: [article({ slug: "other", title: "مقاله‌ی دیگر" })] })}
        locale="fa"
        labels={{ ...viewLabels, preview: "پیش‌نمایش پیش‌نویس" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("پیش‌نمایش پیش‌نویس");
    const related = screen.getByRole("region", { name: "مقاله‌های مرتبط" });
    expect(within(related).getByRole("link", { name: "مقاله‌ی دیگر" })).toHaveAttribute(
      "href",
      "/blog/other",
    );
  });
});
