import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LightboxGallery } from "./Lightbox";
import { PackageCard } from "./PackageCard";
import { PortfolioGrid } from "./PortfolioGrid";
import type { Package, Project } from "@/lib/site/types";

const labels = { dialog: "Viewer", close: "Close", previous: "Previous", next: "Next" };

const project = (slug: string, category: string, style: Project["style"]): Project => ({
  slug,
  category,
  style,
  title_fa: `عنوان ${slug}`,
  title_en: `Title ${slug}`,
  summary_fa: "",
  summary_en: "",
  client_fa: "",
  client_en: "",
  year: null,
  is_featured: false,
  cover: null,
});

describe("PortfolioGrid", () => {
  const categories = [
    {
      slug: "food",
      title_fa: "غذا",
      title_en: "Food",
      description_fa: "",
      description_en: "",
      cover: null,
      project_count: 2,
    },
    {
      slug: "product",
      title_fa: "محصول",
      title_en: "Product",
      description_fa: "",
      description_en: "",
      cover: null,
      project_count: 1,
    },
  ];
  const projects = [
    project("a", "food", "low_key"),
    project("b", "food", "high_key"),
    project("c", "product", "low_key"),
  ];
  const gridLabels = {
    filter: "Filter",
    all: "All",
    noResults: "Nothing",
    styles: { low_key: "Low key", high_key: "High key", natural: "Natural" },
  };

  it("filters by category and exposes the pressed state", () => {
    render(<PortfolioGrid projects={projects} categories={categories} locale="en" labels={gridLabels} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(screen.getByRole("button", { name: "Product" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Title c" })).toHaveAttribute("href", "/en/portfolio/c");
  });

  it("combines category and style filters and reports an empty result", () => {
    render(<PortfolioGrid projects={projects} categories={categories} locale="en" labels={gridLabels} />);
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    fireEvent.click(screen.getByRole("button", { name: "High key" }));
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });

  it("starts with the category from the URL", () => {
    render(
      <PortfolioGrid
        projects={projects}
        categories={categories}
        locale="fa"
        labels={gridLabels}
        initialCategory="product"
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "عنوان c" })).toHaveAttribute("href", "/portfolio/c");
  });
});

describe("PackageCard", () => {
  const pkg: Package = {
    id: 1,
    title_fa: "پایه",
    title_en: "Basic",
    summary_fa: "",
    summary_en: "",
    price_mode: "from",
    price_amount: 2000000,
    price_unit_fa: "",
    price_unit_en: "per product",
    badge_fa: "",
    badge_en: "Popular",
    is_featured: true,
    features: [
      { text_fa: "", text_en: "10 photos", included: true },
      { text_fa: "", text_en: "Video", included: false },
    ],
  };
  const pl = {
    from: "From",
    toman: "Toman",
    inquiry: "Ask",
    included: "Included",
    excluded: "Not included",
    quote: "Quote",
  };

  it("renders price, badge and the included/excluded state of each feature", () => {
    render(<PackageCard pkg={pkg} locale="en" labels={pl} />);
    expect(screen.getByText(/From 2,000,000 Toman/)).toBeInTheDocument();
    expect(screen.getByText("Popular")).toBeInTheDocument();
    expect(screen.getByText(/Included:/)).toBeInTheDocument();
    expect(screen.getByText(/Not included:/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quote" })).toHaveAttribute("href", "/en/contact");
  });

  it("shows the inquiry label when there is no amount", () => {
    render(
      <PackageCard pkg={{ ...pkg, price_mode: "inquiry", price_amount: null }} locale="en" labels={pl} />,
    );
    expect(screen.getByText("Ask")).toBeInTheDocument();
  });
});

describe("LightboxGallery", () => {
  it("opens a viewer, wraps around with next and closes", () => {
    const images = [
      { src: "/a.webp", width: 1, height: 1, alt: "First" },
      { src: "/b.webp", width: 1, height: 1, alt: "Second" },
    ];
    // jsdom has no <dialog> modal support yet.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    render(
      <LightboxGallery images={images} labels={labels}>
        {(open) => (
          <button type="button" onClick={() => open(1)}>
            open
          </button>
        )}
      </LightboxGallery>,
    );
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByAltText("Second")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByAltText("First")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByAltText("First")).not.toBeInTheDocument();
  });
});
