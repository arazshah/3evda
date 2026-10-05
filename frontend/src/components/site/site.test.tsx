import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSlides } from "./HeroSlides";
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

  it("does not render a control for a project without a style", () => {
    const unstyled = [
      project("a", "food", "low_key"),
      project("b", "food", "high_key"),
      project("z", "food", "" as never),
    ];
    render(<PortfolioGrid projects={unstyled} categories={categories} locale="en" labels={gridLabels} />);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAccessibleName();
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
    expect(screen.getByRole("link", { name: "Quote" })).toHaveAttribute("href", "/en/quote");
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

describe("LightboxGallery keyboard and video", () => {
  const polyfill = () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  };

  it("navigates with the arrow keys from the close button and plays videos", () => {
    polyfill();
    const items = [
      { src: "/a.webp", width: 1, height: 1, alt: "First" },
      { src: "/poster.webp", width: 1, height: 1, alt: "Clip", video: "/clip.mp4" },
    ];
    document.documentElement.dir = "ltr";
    render(
      <LightboxGallery images={items} labels={labels}>
        {(open) => (
          <button type="button" onClick={() => open(0)}>
            open
          </button>
        )}
      </LightboxGallery>,
    );
    fireEvent.click(screen.getByText("open"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "ArrowRight" });
    const video = screen.getByLabelText("Clip");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "/clip.mp4");
    expect(video).toHaveAttribute("poster", "/poster.webp");
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "ArrowLeft" });
    expect(screen.getByAltText("First")).toBeInTheDocument();
  });
});

describe("HeroSlides", () => {
  const props = {
    locale: "en" as const,
    eyebrow: "Tagline",
    primary: { href: "/en/quote", label: "Quote" },
    secondary: { href: "/en/portfolio", label: "Portfolio" },
    labels: {
      slideTemplate: "Slide {n}",
      group: "Slides",
      previous: "Previous slide",
      next: "Next slide",
      pause: "Pause slideshow",
      play: "Play slideshow",
    },
  };

  it("shows the first slide and lets the visitor reach the others", () => {
    const slides = [
      { title: "One", subtitle: "first", media: null },
      { title: "Two", subtitle: "second", media: null },
    ];
    render(<HeroSlides {...props} slides={slides} />);
    expect(screen.getByRole("heading", { level: 1, name: "One" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Slide 2" }));
    expect(screen.getByRole("heading", { level: 1, name: "Two" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slide 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("steps with the arrows and wraps around", () => {
    const slides = [
      { title: "One", subtitle: "", media: null },
      { title: "Two", subtitle: "", media: null },
    ];
    render(<HeroSlides {...props} slides={slides} />);
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByRole("heading", { level: 1, name: "Two" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByRole("heading", { level: 1, name: "One" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }));
    expect(screen.getByRole("heading", { level: 1, name: "Two" })).toBeInTheDocument();
  });

  it("has a pause control that reports its state (WCAG 2.2.2)", () => {
    const slides = [
      { title: "One", subtitle: "", media: null },
      { title: "Two", subtitle: "", media: null },
    ];
    render(<HeroSlides {...props} slides={slides} />);
    const pause = screen.getByRole("button", { name: "Pause slideshow" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "Play slideshow" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the slide buttons when there is only one slide", () => {
    render(<HeroSlides {...props} slides={[{ title: "Solo", subtitle: "", media: null }]} />);
    expect(screen.queryByRole("group", { name: "Slides" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next slide" })).not.toBeInTheDocument();
  });
});
