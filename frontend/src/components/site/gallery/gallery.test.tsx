import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fa from "../../../../messages/fa.json";
import en from "../../../../messages/en.json";
import { GALLERY_LABEL_KEYS, type GalleryLabels } from "@/lib/site/gallery-labels";
import type { PublicGallery } from "@/lib/site/gallery-api";
import { GalleryClient } from "./GalleryClient";

const labelsOf = (messages: typeof fa) =>
  Object.fromEntries(
    GALLERY_LABEL_KEYS.map((k) => [k, (messages.site.gallery as Record<string, string>)[k]]),
  ) as GalleryLabels;
const FA = labelsOf(fa);
const EN = labelsOf(en as unknown as typeof fa);

const LINK = "abc_def";
const BASE = `/api/public/galleries/${LINK}`;

type Fixed = { status?: number; body?: unknown };
type Reply = Fixed | ((req: { method: string; path: string; headers: Headers; body: unknown }) => Fixed);
type Call = { method: string; path: string; token: string | null; body: unknown };

/** A fetch that answers by "METHOD path"; each answer may be a function of the request, a list answers in turn. */
function server(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, token: headers.get("X-Gallery-Token"), body });
    const entry = routes[`${method} ${path}`];
    const picked: Reply | undefined = Array.isArray(entry)
      ? entry.length > 1
        ? entry.shift()
        : entry[0]
      : entry;
    const reply: Fixed | undefined =
      typeof picked === "function" ? picked({ method, path, headers, body }) : picked;
    if (!reply) return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { calls, fetchImpl };
}

const gallery = (extra: Partial<PublicGallery> = {}): PublicGallery => ({
  title: "جلسه‌ی کافه",
  client_name: "سارا",
  language: "fa",
  status: "published",
  has_password: false,
  selection_limit: null,
  download_level: "selected",
  submitted: false,
  ...extra,
});
const photo = (id: number, extra = {}) => ({
  id,
  name: `IMG_${id}.jpg`,
  width: 3000,
  height: 2000,
  thumb_url: `/storage-signed/t${id}`,
  preview_url: `/storage-signed/p${id}`,
  selected: false,
  comment: "",
  retouch: false,
  ...extra,
});
const photos = (list: ReturnType<typeof photo>[], extra = {}) => ({
  selection_limit: null,
  selected_count: list.filter((p) => p.selected).length,
  submitted: false,
  photos: list,
  ...extra,
});
const UNLOCK = `POST ${BASE}/unlock`;
const PHOTOS = `GET ${BASE}/photos`;
const FINALS = `GET ${BASE}/finals`;
const token = (t = "tok1") => ({ body: { token: t, expires_in: 43200 } });

let clicked: HTMLAnchorElement[];
beforeEach(() => {
  clicked = [];
  window.sessionStorage.clear();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function show(
  routes: Record<string, Reply | Reply[]>,
  props: Partial<{ initial: PublicGallery; labels: GalleryLabels; locale: "fa" | "en"; pollMs: number }> = {},
) {
  const s = server({ [FINALS]: { body: { finals: [] } }, ...routes });
  vi.stubGlobal("fetch", s.fetchImpl);
  render(
    <GalleryClient
      initial={props.initial ?? gallery()}
      linkToken={LINK}
      locale={props.locale ?? "fa"}
      labels={props.labels ?? FA}
      pollMs={props.pollMs ?? 0}
    />,
  );
  return s;
}

describe("opening the gallery", () => {
  it("a gallery without a password is opened with a token at once, and every request carries it", async () => {
    const s = show({ [UNLOCK]: token(), [PHOTOS]: { body: photos([photo(1), photo(2)]) } });
    const list = await screen.findByRole("list", { name: FA.photos });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(s.calls[0]).toMatchObject({ method: "POST", path: `${BASE}/unlock`, body: {} });
    const asked = s.calls.find((c) => c.path === `${BASE}/photos`);
    expect(asked?.token).toBe("tok1");
    expect(screen.getByRole("heading", { level: 1, name: "جلسه‌ی کافه" })).toBeInTheDocument();
  });

  it("a gallery with a password asks for it, refuses a wrong one and opens with the right one", async () => {
    const s = show(
      {
        [UNLOCK]: [{ status: 403, body: { code: "locked" } }, token("tok2")],
        [PHOTOS]: { body: photos([photo(1)]) },
      },
      { initial: gallery({ has_password: true }) },
    );
    const box = await screen.findByLabelText(FA.password);
    expect(s.calls).toHaveLength(0); // nothing is asked until the password is typed
    fireEvent.change(box, { target: { value: "غلط" } });
    fireEvent.click(screen.getByRole("button", { name: FA.unlock }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.wrongPassword);
    fireEvent.change(screen.getByLabelText(FA.password), { target: { value: "درست" } });
    fireEvent.click(screen.getByRole("button", { name: FA.unlock }));
    await screen.findByRole("list", { name: FA.photos });
    expect(s.calls.filter((c) => c.path.endsWith("/unlock")).map((c) => c.body)).toEqual([
      { password: "غلط" },
      { password: "درست" },
    ]);
    expect(s.calls.find((c) => c.path.endsWith("/photos"))?.token).toBe("tok2");
  });

  it("says when there are too many tries", async () => {
    show(
      { [UNLOCK]: { status: 429, body: { code: "too_many" } } },
      { initial: gallery({ has_password: true }) },
    );
    fireEvent.change(await screen.findByLabelText(FA.password), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: FA.unlock }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.tooMany);
  });

  it("an expired gallery says so and asks nothing", () => {
    const s = show({}, { initial: gallery({ status: "expired" }) });
    expect(screen.getByRole("heading", { name: FA.expiredTitle })).toBeInTheDocument();
    expect(s.calls).toHaveLength(0);
  });

  it("a token kept for this tab is used without asking for the password again", async () => {
    window.sessionStorage.setItem(`gallery-access:${LINK}`, "kept");
    const s = show({ [PHOTOS]: { body: photos([photo(1)]) } }, { initial: gallery({ has_password: true }) });
    await screen.findByRole("list", { name: FA.photos });
    expect(s.calls.some((c) => c.path.endsWith("/unlock"))).toBe(false);
    expect(s.calls[0]!.token).toBe("kept");
  });

  it("a kept token that no longer works sends the visitor back to the password", async () => {
    window.sessionStorage.setItem(`gallery-access:${LINK}`, "old");
    show(
      { [PHOTOS]: { status: 401, body: { code: "locked" } } },
      { initial: gallery({ has_password: true }) },
    );
    expect(await screen.findByLabelText(FA.password)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(`gallery-access:${LINK}`)).toBeNull();
  });

  it("offers another try when a gallery without a password cannot be opened", async () => {
    show({ [UNLOCK]: [{ status: 500, body: {} }, token()], [PHOTOS]: { body: photos([photo(1)]) } });
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.errorGeneric);
    fireEvent.click(screen.getByRole("button", { name: FA.retry }));
    await screen.findByRole("list", { name: FA.photos });
  });
});

describe("choosing", () => {
  const open = (routes: Record<string, Reply | Reply[]>, props = {}) =>
    show({ [UNLOCK]: token(), ...routes }, props);

  it("selecting shows at once, updates the counter and is saved", async () => {
    const put = `PUT ${BASE}/photos/1/selection`;
    const s = open(
      {
        [PHOTOS]: { body: photos([photo(1), photo(2)], { selection_limit: 3 }) },
        [put]: { body: { selected: true, comment: "", retouch: false, selected_count: 1 } },
      },
      { initial: gallery({ selection_limit: 3 }) },
    );
    await screen.findByRole("list", { name: FA.photos });
    expect(screen.getByText("۰ از ۳ انتخاب شده")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    expect(screen.getByRole("button", { name: "برداشتن انتخاب IMG_1.jpg" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(screen.getByText("۱ از ۳ انتخاب شده")).toBeInTheDocument());
    expect(s.calls.find((c) => c.method === "PUT")).toMatchObject({
      body: { selected: true },
      token: "tok1",
    });
  });

  it("at the limit the choice is undone and the reason is shown", async () => {
    const put = `PUT ${BASE}/photos/2/selection`;
    open(
      {
        [PHOTOS]: { body: photos([photo(1, { selected: true }), photo(2)], { selection_limit: 1 }) },
        [put]: { status: 409, body: { code: "limit_reached" } },
      },
      { initial: gallery({ selection_limit: 1 }) },
    );
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_2.jpg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.limitReached);
    expect(screen.getByRole("button", { name: "انتخاب IMG_2.jpg" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("۱ از ۱ انتخاب شده")).toBeInTheDocument();
  });

  it("a failed save is undone", async () => {
    open({
      [PHOTOS]: { body: photos([photo(1)]) },
      [`PUT ${BASE}/photos/1/selection`]: { status: 500, body: {} },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.selectFailed);
    expect(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sending asks first, needs a choice, and then locks everything", async () => {
    const s = open({
      [PHOTOS]: { body: photos([photo(1, { selected: true }), photo(2)]) },
      [`POST ${BASE}/submit`]: { body: { submitted: true, selected_count: 1 } },
    });
    await screen.findByRole("list", { name: FA.photos });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: FA.submit }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    expect(s.calls.some((c) => c.path.endsWith("/submit"))).toBe(false); // declined
    fireEvent.click(await screen.findByRole("button", { name: FA.submit }));
    expect(await screen.findByText(FA.submittedTitle)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FA.submit })).not.toBeInTheDocument();
    for (const b of screen
      .getAllByRole("button", { name: /IMG_/ })
      .filter((b) => b.hasAttribute("aria-pressed")))
      expect(b).toBeDisabled();
    expect(vi.mocked(window.confirm).mock.calls[1]![0]).toContain("۱ عکس");
  });

  it("will not send an empty choice", async () => {
    const s = open({ [PHOTOS]: { body: photos([photo(1)]) } });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: FA.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.nothingSelected);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(s.calls.some((c) => c.path.endsWith("/submit"))).toBe(false);
  });

  it("a gallery already sent is locked from the start", async () => {
    open(
      { [PHOTOS]: { body: photos([photo(1, { selected: true })], { submitted: true }) } },
      { initial: gallery({ submitted: true }) },
    );
    await screen.findByRole("list", { name: FA.photos });
    expect(screen.getByText(FA.submittedTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "برداشتن انتخاب IMG_1.jpg" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: FA.submit })).not.toBeInTheDocument();
  });

  it("when the owner has sent it already, a save is refused and the page shows the locked state", async () => {
    open({
      [PHOTOS]: [{ body: photos([photo(1)]) }, { body: photos([photo(1)], { submitted: true }) }],
      [`PUT ${BASE}/photos/1/selection`]: { status: 409, body: { code: "submitted" } },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    expect(await screen.findByText(FA.submittedTitle)).toBeInTheDocument();
  });
});

describe("changes in flight", () => {
  const open = (routes: Record<string, Reply | Reply[]>, props = {}) =>
    show({ [UNLOCK]: token(), ...routes }, props);

  it("sending waits for a choice that is still on its way, so the order on the server is choice, then send", async () => {
    const put = `PUT ${BASE}/photos/1/selection`;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const s = server({
      [UNLOCK]: token(),
      [FINALS]: { body: { finals: [] } },
      [PHOTOS]: { body: photos([photo(1), photo(2)]) },
      [`POST ${BASE}/submit`]: { body: { submitted: true, selected_count: 1 } },
    });
    // the choice is answered late
    const slow = s.fetchImpl.getMockImplementation()!;
    s.fetchImpl.mockImplementation(async (input, init) => {
      if (`${init?.method ?? "GET"} ${String(input)}` === put) {
        await gate;
        s.calls.push({ method: "PUT", path: put, token: "tok1", body: { selected: true } });
        return new Response(
          JSON.stringify({ selected: true, comment: "", retouch: false, selected_count: 1 }),
          {
            status: 200,
          },
        );
      }
      return slow(input, init);
    });
    vi.stubGlobal("fetch", s.fetchImpl);
    render(<GalleryClient initial={gallery()} linkToken={LINK} locale="fa" labels={FA} pollMs={0} />);
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: FA.submit })); // straight away, before the answer
    await Promise.resolve();
    expect(s.calls.some((c) => c.path.endsWith("/submit"))).toBe(false); // it waits
    expect(window.confirm).not.toHaveBeenCalled();
    release();
    expect(await screen.findByText(FA.submittedTitle)).toBeInTheDocument();
    const order = s.calls
      .filter((c) => c.method !== "GET" && !c.path.endsWith("/unlock"))
      .map((c) => `${c.method} ${c.path.split("/").slice(-2).join("/")}`);
    expect(order).toEqual(["PUT 1/selection", "POST abc_def/submit"]);
    expect(vi.mocked(window.confirm).mock.calls[0]![0]).toContain("۱ عکس");
  });

  it("the counter follows the photos on the screen, not the number a late answer carries", async () => {
    open({
      [PHOTOS]: { body: photos([photo(1), photo(2)]) },
      [`PUT ${BASE}/photos/1/selection`]: {
        body: { selected: true, comment: "", retouch: false, selected_count: 2 },
      },
      [`PUT ${BASE}/photos/2/selection`]: {
        body: { selected: true, comment: "", retouch: false, selected_count: 1 },
      },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_2.jpg" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "برداشتن انتخاب IMG_2.jpg" })).toBeEnabled(),
    );
    expect(screen.getByText("۲ عکس انتخاب شده")).toBeInTheDocument();
  });

  it("when the owner changes the limit, the counter shows the limit the server now enforces", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    open(
      {
        [PHOTOS]: [
          { body: photos([photo(1)], { selection_limit: 1 }) },
          { body: photos([photo(1)], { selection_limit: 5 }) },
        ],
      },
      { initial: gallery({ selection_limit: 1 }) },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("۰ از ۱ انتخاب شده")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    });
    expect(screen.getByText("۰ از ۵ انتخاب شده")).toBeInTheDocument();
  });

  it("a refresh does not undo a choice that is still on its way", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const s = server({
      [UNLOCK]: token(),
      [FINALS]: { body: { finals: [] } },
      [PHOTOS]: [{ body: photos([photo(1)]) }, { body: photos([photo(1)]) }], // the server has not seen the choice yet
    });
    const plain = s.fetchImpl.getMockImplementation()!;
    s.fetchImpl.mockImplementation(async (input, init) => {
      if (init?.method === "PUT") {
        await gate;
        return new Response(
          JSON.stringify({ selected: true, comment: "", retouch: false, selected_count: 1 }),
          { status: 200 },
        );
      }
      return plain(input, init);
    });
    vi.stubGlobal("fetch", s.fetchImpl);
    render(<GalleryClient initial={gallery()} linkToken={LINK} locale="fa" labels={FA} pollMs={0} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60 * 1000); // a refresh arrives meanwhile
    });
    expect(screen.getByRole("button", { name: "برداشتن انتخاب IMG_1.jpg" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    release();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("button", { name: "برداشتن انتخاب IMG_1.jpg" })).toBeEnabled();
  });
});

describe("the large view", () => {
  const ready = (extra: Record<string, Reply | Reply[]> = {}, props = {}) =>
    show({ [UNLOCK]: token(), [PHOTOS]: { body: photos([photo(1), photo(2), photo(3)]) }, ...extra }, props);

  it("opens a photo, moves with the arrow keys the way the language reads, and closes with Escape giving the focus back", async () => {
    ready();
    const opener = await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: FA.lightbox });
    expect(within(dialog).getByRole("img", { name: "IMG_1.jpg" })).toHaveAttribute(
      "src",
      "/storage-signed/p1",
    );
    fireEvent.keyDown(dialog, { key: "ArrowLeft" }); // Persian reads right to left: left is forward
    expect(within(dialog).getByRole("img", { name: "IMG_2.jpg" })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img", { name: "IMG_1.jpg" })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("Escape and the arrows work wherever the focus is, even on the page itself", async () => {
    ready();
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(within(dialog).getByRole("img", { name: "IMG_2.jpg" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("after saving a note the focus returns to the note", async () => {
    const put = `PUT ${BASE}/photos/1/selection`;
    ready({ [put]: { body: { selected: false, comment: "گرم‌تر", retouch: false, selected_count: 0 } } });
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(FA.comment), { target: { value: "گرم‌تر" } });
    fireEvent.click(within(dialog).getByRole("button", { name: FA.saveComment }));
    await within(dialog).findByText(FA.commentSaved);
    expect(within(dialog).getByLabelText(FA.comment)).toHaveFocus();
  });

  it("in English the right arrow is forward", async () => {
    ready({}, { locale: "en", labels: EN });
    fireEvent.click(await screen.findByRole("button", { name: "View IMG_1.jpg large" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByRole("img", { name: "IMG_2.jpg" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: EN.next }));
    expect(within(dialog).getByRole("img", { name: "IMG_3.jpg" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: EN.next })).toBeDisabled();
  });

  it("swiping turns the page", async () => {
    ready();
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    const stage = within(dialog).getByRole("img", { name: "IMG_1.jpg" }).parentElement!;
    fireEvent.touchStart(stage, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 80 }] }); // dragged left: forward in a right-to-left page? no — back
    expect(within(dialog).getByRole("img", { name: "IMG_1.jpg" })).toBeInTheDocument();
    fireEvent.touchStart(stage, { touches: [{ clientX: 80 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 220 }] }); // dragged right: forward in Persian
    expect(within(dialog).getByRole("img", { name: "IMG_2.jpg" })).toBeInTheDocument();
  });

  it("selects, keeps a note and a retouch request", async () => {
    const put = `PUT ${BASE}/photos/1/selection`;
    const s = ready({
      [put]: [
        { body: { selected: true, comment: "", retouch: false, selected_count: 1 } },
        { body: { selected: true, comment: "", retouch: true, selected_count: 1 } },
        { body: { selected: true, comment: "گرم‌تر", retouch: true, selected_count: 1 } },
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "انتخاب IMG_1.jpg" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /برداشتن انتخاب/ })).toBeEnabled());
    fireEvent.click(within(dialog).getByLabelText(FA.retouch));
    fireEvent.change(within(dialog).getByLabelText(FA.comment), { target: { value: "گرم‌تر" } });
    fireEvent.click(within(dialog).getByRole("button", { name: FA.saveComment }));
    expect(await within(dialog).findByText(FA.commentSaved)).toBeInTheDocument();
    expect(s.calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([
      { selected: true },
      { retouch: true },
      { comment: "گرم‌تر" },
    ]);
  });

  it("is read-only once the selection has been sent", async () => {
    show(
      {
        [UNLOCK]: token(),
        [PHOTOS]: { body: photos([photo(1, { comment: "سلام", selected: true })], { submitted: true }) },
      },
      { initial: gallery({ submitted: true }) },
    );
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(FA.comment)).toHaveAttribute("readonly");
    expect(within(dialog).queryByRole("button", { name: FA.saveComment })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(FA.retouch)).toBeDisabled();
  });

  it("keeps the focus inside while it is open", async () => {
    ready();
    fireEvent.click(await screen.findByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    const dialog = screen.getByRole("dialog");
    const last = within(dialog).getByRole("checkbox", { name: FA.retouch });
    // the last control on the page: the note's text area comes after it, so go to the very last one
    const controls = dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), textarea, input:not([disabled])",
    );
    const end = controls[controls.length - 1]!;
    end.focus();
    fireEvent.keyDown(end, { key: "Tab" });
    expect(controls[0]).toHaveFocus();
    expect(last).toBeInTheDocument();
  });
});

describe("downloading", () => {
  const ready = (
    level: PublicGallery["download_level"],
    list = [photo(1, { selected: true }), photo(2)],
    extra = {},
    pollMs = 0,
  ) =>
    show(
      { [UNLOCK]: token(), [PHOTOS]: { body: photos(list) }, ...extra },
      { initial: gallery({ download_level: level }), pollMs },
    );

  it("offers nothing to take at level «none»", async () => {
    ready("none");
    await screen.findByRole("list", { name: FA.photos });
    expect(screen.queryByRole("button", { name: FA.downloadZip })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    expect(screen.queryByRole("button", { name: FA.download })).not.toBeInTheDocument();
  });

  it("at «selected» only a chosen photo can be downloaded, through its short-lived link", async () => {
    ready("selected", undefined, {
      [`GET ${BASE}/photos/1/download`]: {
        body: { url: "/storage-signed/private/x?sig=1", filename: "IMG_1.webp" },
      },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "نمایش بزرگ IMG_2.jpg" }));
    expect(screen.queryByRole("button", { name: FA.download })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: FA.download }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toHaveAttribute("href", "/storage-signed/private/x?sig=1");
    expect(clicked[0]).toHaveAttribute("download", "IMG_1.webp");
  });

  it("at «all» every photo can be downloaded", async () => {
    ready("all_original");
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "نمایش بزرگ IMG_2.jpg" }));
    expect(screen.getByRole("button", { name: FA.download })).toBeInTheDocument();
  });

  it("says so when the server refuses a download", async () => {
    ready("all_web", undefined, {
      [`GET ${BASE}/photos/1/download`]: { status: 403, body: { code: "download_disabled" } },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: "نمایش بزرگ IMG_1.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: FA.download }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.downloadNotAllowed);
    expect(clicked).toHaveLength(0);
  });

  it("makes a ZIP, shows its progress and downloads it when it is ready", async () => {
    const s = ready(
      "all_web",
      undefined,
      {
        [`POST ${BASE}/zip`]: {
          status: 202,
          body: { id: 7, status: "queued", total: 2, done: 0, url: null, filename: null },
        },
        [`GET ${BASE}/zip/7`]: [
          { body: { id: 7, status: "running", total: 2, done: 1, url: null, filename: null } },
          {
            body: {
              id: 7,
              status: "ready",
              total: 2,
              done: 2,
              url: "/storage-signed/private/z.zip?sig=1",
              filename: "جلسه.zip",
            },
          },
        ],
      },
      80,
    );
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: FA.downloadZip }));
    expect(await screen.findByRole("button", { name: "در حال ساخت ZIP… ۱ از ۲" })).toBeDisabled();
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toHaveAttribute("href", "/storage-signed/private/z.zip?sig=1");
    expect(await screen.findByText(FA.zipReady)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: FA.downloadZip })).toBeEnabled();
    expect(s.calls.filter((c) => c.path.endsWith("/zip") && c.method === "POST")).toHaveLength(1);
  });

  it("builds the ZIP again once when the permissions changed meanwhile", async () => {
    const s = ready("all_web", undefined, {
      [`POST ${BASE}/zip`]: [
        { status: 202, body: { id: 7, status: "queued", total: 2, done: 0, url: null, filename: null } },
        { status: 202, body: { id: 8, status: "queued", total: 2, done: 0, url: null, filename: null } },
      ],
      [`GET ${BASE}/zip/7`]: { status: 409, body: { code: "stale" } },
      [`GET ${BASE}/zip/8`]: {
        body: {
          id: 8,
          status: "ready",
          total: 2,
          done: 2,
          url: "/storage-signed/private/z2.zip?sig=1",
          filename: "a.zip",
        },
      },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: FA.downloadZip }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toHaveAttribute("href", "/storage-signed/private/z2.zip?sig=1");
    expect(s.calls.filter((c) => c.method === "POST" && c.path.endsWith("/zip"))).toHaveLength(2);
  });

  it("reports a failed ZIP and an empty one", async () => {
    ready("all_web", undefined, {
      [`POST ${BASE}/zip`]: [
        { status: 202, body: { id: 7, status: "queued", total: 2, done: 0, url: null, filename: null } },
        { status: 409, body: { code: "nothing_to_download" } },
      ],
      [`GET ${BASE}/zip/7`]: {
        body: { id: 7, status: "failed", total: 2, done: 0, url: null, filename: null },
      },
    });
    await screen.findByRole("list", { name: FA.photos });
    fireEvent.click(screen.getByRole("button", { name: FA.downloadZip }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.zipFailed);
    fireEvent.click(screen.getByRole("button", { name: FA.downloadZip }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(FA.zipNothing));
  });

  it("says when the finished files could not be loaded and loads them on a second try", async () => {
    show(
      {
        [UNLOCK]: token(),
        [PHOTOS]: { body: photos([photo(1)]) },
        [FINALS]: [
          { status: 500, body: {} },
          { body: { finals: [{ id: 9, filename: "final.jpg", size_bytes: 1000 }] } },
        ],
      },
      { initial: gallery({ download_level: "none" }) },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(FA.finalsFailed);
    fireEvent.click(screen.getByRole("button", { name: FA.retry }));
    expect(await screen.findByRole("list", { name: FA.finalsTitle })).toBeInTheDocument();
    expect(screen.queryByText(FA.finalsFailed)).not.toBeInTheDocument();
  });

  it("lists the finished files, which can always be taken", async () => {
    show(
      {
        [UNLOCK]: token(),
        [PHOTOS]: { body: photos([photo(1)]) },
        [FINALS]: { body: { finals: [{ id: 9, filename: "final.jpg", size_bytes: 1000 }] } },
        [`GET ${BASE}/finals/9/download`]: {
          body: { url: "/storage-signed/private/f?sig=1", filename: "final.jpg" },
        },
      },
      { initial: gallery({ download_level: "none" }) },
    );
    const list = await screen.findByRole("list", { name: FA.finalsTitle });
    fireEvent.click(within(list).getByRole("button", { name: "دانلود final.jpg" }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toHaveAttribute("download", "final.jpg");
  });
});

describe("keeping the previews fresh", () => {
  it("asks for a new list every twenty minutes and when the tab is shown again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const s = show({
      [UNLOCK]: token(),
      [PHOTOS]: [
        { body: photos([photo(1)]) },
        { body: photos([photo(1, { thumb_url: "/storage-signed/new1" })]) },
        { body: photos([photo(1, { thumb_url: "/storage-signed/new2" })]) },
      ],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const count = () => s.calls.filter((c) => c.path.endsWith("/photos")).length;
    expect(count()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19 * 60 * 1000);
    });
    expect(count()).toBe(1); // not yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    });
    expect(count()).toBe(2);
    expect(screen.getByAltText("IMG_1.jpg")).toHaveAttribute("src", "/storage-signed/new1");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(count()).toBe(3);
    expect(screen.getByAltText("IMG_1.jpg")).toHaveAttribute("src", "/storage-signed/new2");
  });

  it("when a preview fails to load it asks again once, not in a loop", async () => {
    const s = show({
      [UNLOCK]: token(),
      [PHOTOS]: [
        { body: photos([photo(1)]) },
        { body: photos([photo(1, { thumb_url: "/storage-signed/fresh" })]) },
      ],
    });
    const img = await screen.findByAltText("IMG_1.jpg");
    const count = () => s.calls.filter((c) => c.path.endsWith("/photos")).length;
    fireEvent.error(img);
    await waitFor(() => expect(count()).toBe(2));
    await waitFor(() =>
      expect(screen.getByAltText("IMG_1.jpg")).toHaveAttribute("src", "/storage-signed/fresh"),
    );
    fireEvent.error(screen.getByAltText("IMG_1.jpg"));
    fireEvent.error(screen.getByAltText("IMG_1.jpg"));
    await Promise.resolve();
    expect(count()).toBe(2);
  });

  it("many thumbnails failing together make one request, not one each", async () => {
    const s = show({
      [UNLOCK]: token(),
      [PHOTOS]: [
        { body: photos([photo(1), photo(2), photo(3), photo(4), photo(5)]) },
        {
          body: photos(
            [photo(1), photo(2), photo(3), photo(4), photo(5)].map((p) => ({
              ...p,
              thumb_url: `/new${p.id}`,
            })),
          ),
        },
      ],
    });
    const images = await screen.findAllByRole("img");
    const count = () => s.calls.filter((c) => c.path.endsWith("/photos")).length;
    for (const img of images) fireEvent.error(img);
    await waitFor(() => expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "/new1"));
    expect(count()).toBe(2); // the first list and one renewal
  });

  it("a session that ended asks for the password again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    show(
      {
        [UNLOCK]: token(),
        [PHOTOS]: [{ body: photos([photo(1)]) }, { status: 401, body: { code: "locked" } }],
      },
      { initial: gallery({ has_password: true }) },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    fireEvent.change(screen.getByLabelText(FA.password), { target: { value: "x" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: FA.unlock }));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("list", { name: FA.photos })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    });
    expect(screen.getByLabelText(FA.password)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(FA.sessionEnded);
  });
});

describe("a big gallery", () => {
  it("shows 500 photos with lazy images and a reserved shape (no layout jump)", async () => {
    const many = Array.from({ length: 500 }, (_, i) => photo(i + 1));
    show({ [UNLOCK]: token(), [PHOTOS]: { body: photos(many) } });
    const started = performance.now();
    const list = await screen.findByRole("list", { name: FA.photos });
    expect(within(list).getAllByRole("listitem")).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(5000);
    const first = within(list).getAllByRole("img")[0]!;
    expect(first).toHaveAttribute("loading", "lazy");
    expect(first.closest("button")!.style.aspectRatio).toBe("3000 / 2000");
  });
});

it("has a label for every message, in both languages", () => {
  for (const key of GALLERY_LABEL_KEYS) {
    expect(FA[key], key).toBeTruthy();
    expect(EN[key], key).toBeTruthy();
  }
  const all = (m: typeof fa) => Object.keys(m.site.gallery).sort();
  expect(all(en as unknown as typeof fa)).toEqual(all(fa));
});
