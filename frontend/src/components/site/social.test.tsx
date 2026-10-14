import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";
import type { SiteData } from "@/lib/site/types";

const site = {
  settings: {
    brand_name_fa: "سودا",
    brand_name_en: "Sevda",
    phone: "",
    email: "",
    instagram: "3evda.r",
    telegram: "sevda",
    whatsapp: "989121234567",
    address_fa: "",
    address_en: "",
    footer_text_fa: "",
    footer_text_en: "",
  },
  blocks: {},
  collections: {},
} as unknown as SiteData;

const labels = {
  instagram: "اینستاگرام",
  telegram: "تلگرام",
  whatsapp: "واتس‌اپ",
  book: "رزرو",
  sitemap: "نقشه‌ی سایت",
};

describe("SiteFooter social links", () => {
  it("shows an icon link for each network, named for screen readers", () => {
    render(<SiteFooter site={site} locale="fa" labels={labels} />);
    const insta = screen.getByRole("link", { name: "اینستاگرام" });
    expect(insta).toHaveAttribute("href", "https://www.instagram.com/3evda.r/");
    expect(insta.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "تلگرام" })).toHaveAttribute("href", "https://t.me/sevda");
    expect(screen.getByRole("link", { name: "واتس‌اپ" })).toHaveAttribute(
      "href",
      "https://wa.me/989121234567",
    );
  });

  it("links to the sitemap page in each language", () => {
    const { unmount } = render(<SiteFooter site={site} locale="fa" labels={labels} />);
    expect(screen.getByRole("link", { name: "نقشه‌ی سایت" })).toHaveAttribute("href", "/sitemap");
    unmount();
    render(<SiteFooter site={site} locale="en" labels={{ ...labels, sitemap: "Sitemap" }} />);
    expect(screen.getByRole("link", { name: "Sitemap" })).toHaveAttribute("href", "/en/sitemap");
  });

  it("leaves out a network with no address", () => {
    const empty = { ...site, settings: { ...site.settings, telegram: "", whatsapp: "" } } as SiteData;
    render(<SiteFooter site={empty} locale="fa" labels={labels} />);
    expect(screen.queryByRole("link", { name: "تلگرام" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اینستاگرام" })).toBeInTheDocument();
  });
});
