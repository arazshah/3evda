"use client";

import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useState } from "react";
import { MediaPicker } from "../MediaPicker";
import { Button } from "../ui";

/**
 * An image from the media library. Only the library id is stored in the article; the preview URL
 * is looked up for display. Pasted or dropped external images are not accepted (`parseHTML` is empty).
 */
function libraryImage(preview: (id: string) => string | null) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    addAttributes() {
      return { mediaId: { default: null } };
    },
    parseHTML() {
      return [];
    },
    renderHTML({ node }) {
      const id = String(node.attrs.mediaId);
      return ["img", mergeAttributes({ "data-media-id": id, src: preview(id) ?? "", alt: "" })];
    },
  });
}

const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

export function RichTextEditor({
  initial,
  previews,
  onChange,
  dir,
  label,
}: {
  initial: JSONContent | null;
  /** Preview URLs of the library images already in `initial`, by media id. */
  previews: Record<string, string>;
  onChange: (doc: JSONContent) => void;
  dir: "rtl" | "ltr";
  label: string;
}) {
  // Preview URLs by media id: the ones loaded with the article plus those inserted in this session.
  const [known] = useState(() => new Map(Object.entries(previews)));
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: false, HTMLAttributes: { rel: "noopener noreferrer" } },
      }),
      libraryImage((id) => known.get(id) ?? null),
    ],
    [known],
  );

  const editor = useEditor({
    extensions,
    content: initial && initial.content?.length ? initial : undefined,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    editorProps: {
      attributes: {
        dir,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class:
          "rich min-h-72 rounded-b-brand border border-t-0 border-line bg-elevated p-4 outline-none focus-visible:border-accent",
      },
    },
  });

  if (!editor)
    return <div className="min-h-72 rounded-brand border border-line bg-elevated" aria-busy="true" />;

  const tool = (name: string, text: string, active: boolean, run: () => void, disabled = false) => (
    <Button
      key={name}
      variant="ghost"
      className="min-h-11 min-w-11 px-3 text-sm"
      aria-pressed={active}
      aria-label={name}
      disabled={disabled}
      onClick={run}
    >
      {text}
    </Button>
  );

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("نشانی پیوند (خالی = حذف پیوند)", previous ?? "https://");
    if (href === null) return;
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (SAFE_LINK.test(value)) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    } else {
      window.alert("پیوند باید با http، https، mailto یا / شروع شود.");
    }
  };

  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-col">
      <div
        role="toolbar"
        aria-label="ابزار قالب‌بندی"
        className="flex flex-wrap gap-1 rounded-t-brand border border-line bg-surface p-1"
      >
        {tool("پررنگ", "B", editor.isActive("bold"), () => chain().toggleBold().run())}
        {tool("کج", "I", editor.isActive("italic"), () => chain().toggleItalic().run())}
        {tool("کد", "</>", editor.isActive("code"), () => chain().toggleCode().run())}
        {tool("پیوند", "🔗", editor.isActive("link"), setLink)}
        {([2, 3, 4] as const).map((level) =>
          tool(`تیتر ${level}`, `H${level}`, editor.isActive("heading", { level }), () =>
            chain().toggleHeading({ level }).run(),
          ),
        )}
        {tool("فهرست", "• ", editor.isActive("bulletList"), () => chain().toggleBulletList().run())}
        {tool("فهرست شماره‌دار", "1.", editor.isActive("orderedList"), () =>
          chain().toggleOrderedList().run(),
        )}
        {tool("نقل‌قول", "❝", editor.isActive("blockquote"), () => chain().toggleBlockquote().run())}
        {tool("خط جداکننده", "―", false, () => chain().setHorizontalRule().run())}
        {tool("بازگردانی", "↶", false, () => chain().undo().run(), !editor.can().undo())}
        {tool("تکرار", "↷", false, () => chain().redo().run(), !editor.can().redo())}
      </div>
      <EditorContent editor={editor} />
      <div className="mt-3">
        <MediaPicker
          label="افزودن تصویر به متن"
          value={null}
          onChange={(picked) => {
            if (!picked) return;
            if (picked.src) known.set(picked.id, picked.src);
            chain()
              .insertContent({ type: "image", attrs: { mediaId: picked.id } })
              .run();
          }}
        />
      </div>
    </div>
  );
}
