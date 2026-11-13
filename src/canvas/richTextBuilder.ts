import { toRichText, type TLRichText } from 'tldraw';

export type RichTextListKind = 'bullet' | 'ordered' | 'checklist';

interface ProseMirrorMark {
  type: 'bold' | 'italic' | 'strike' | 'code' | 'highlight';
}

interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: ProseMirrorMark[];
  text?: string;
  content?: ProseMirrorNode[];
}

function textNode(text: string, marks?: ProseMirrorMark[]): ProseMirrorNode {
  return marks && marks.length > 0 ? { type: 'text', marks, text } : { type: 'text', text };
}

function paragraphNode(children?: ProseMirrorNode[]): ProseMirrorNode {
  return children && children.length > 0
    ? { type: 'paragraph', content: children }
    : { type: 'paragraph' };
}

/**
 * Builds a validated tldraw v5 TipTap `TLRichText` document containing an optional
 * bold heading and a native `bulletList` or `orderedList` (or checklist items).
 */
export function buildListRichText(
  heading: string | null | undefined,
  items: string[],
  kind: RichTextListKind = 'bullet',
): TLRichText {
  const cleanItems = items.map((s) => s.trim()).filter(Boolean);
  if (cleanItems.length === 0) {
    return toRichText(heading?.trim() || 'Notes');
  }

  const content: ProseMirrorNode[] = [];
  const cleanHeading = heading?.trim();
  if (cleanHeading) {
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [textNode(cleanHeading, [{ type: 'bold' }])],
    });
  }

  if (kind === 'ordered') {
    content.push({
      type: 'orderedList',
      attrs: { start: 1 },
      content: cleanItems.map((item) => ({
        type: 'listItem',
        content: [paragraphNode([textNode(item)])],
      })),
    });
  } else {
    content.push({
      type: 'bulletList',
      content: cleanItems.map((item) => ({
        type: 'listItem',
        content: [
          paragraphNode([
            textNode(kind === 'checklist' ? `☐ ${item}` : item),
          ]),
        ],
      })),
    });
  }

  return { type: 'doc', content } as unknown as TLRichText;
}

/**
 * Builds a validated tldraw v5 TipTap `TLRichText` document formatted for code / schema cards.
 * Uses inline `code` marks inside paragraphs (compatible with tldraw's default TipTap StarterKit config).
 */
export function buildCodeRichText(
  title: string | null | undefined,
  codeLines: string[],
): TLRichText {
  const lines = codeLines
    .flatMap((l) => l.split(/\n/))
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const content: ProseMirrorNode[] = [];
  const cleanTitle = title?.trim();
  if (cleanTitle) {
    content.push(paragraphNode([textNode(cleanTitle, [{ type: 'bold' }])]));
  }

  if (lines.length === 0) {
    content.push(paragraphNode([textNode('const studio = ready()', [{ type: 'code' }])]));
  } else {
    for (const line of lines) {
      content.push(paragraphNode([textNode(line, [{ type: 'code' }])]));
    }
  }

  return { type: 'doc', content } as unknown as TLRichText;
}

/**
 * Appends a new bullet item or paragraph line to an existing `TLRichText` document
 * without losing any existing headings, lists, or formatting.
 */
export function appendToRichText(
  existing: unknown,
  addition: string,
  asBullet = true,
): TLRichText {
  const clean = addition.trim();
  if (!clean) {
    return (existing as TLRichText) ?? toRichText('');
  }

  const doc =
    existing &&
    typeof existing === 'object' &&
    (existing as { type?: string }).type === 'doc' &&
    Array.isArray((existing as { content?: unknown[] }).content)
      ? (JSON.parse(JSON.stringify(existing)) as { type: 'doc'; content: ProseMirrorNode[] })
      : (JSON.parse(JSON.stringify(toRichText(''))) as { type: 'doc'; content: ProseMirrorNode[] });

  // Remove trailing empty placeholder paragraph if document was blank
  if (
    doc.content.length === 1 &&
    doc.content[0].type === 'paragraph' &&
    (!doc.content[0].content || doc.content[0].content.length === 0)
  ) {
    doc.content = [];
  }

  const lastNode = doc.content[doc.content.length - 1];
  if (lastNode && (lastNode.type === 'bulletList' || lastNode.type === 'orderedList')) {
    lastNode.content = lastNode.content ?? [];
    lastNode.content.push({
      type: 'listItem',
      content: [paragraphNode([textNode(clean)])],
    });
    return doc as unknown as TLRichText;
  }

  if (asBullet) {
    doc.content.push({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [paragraphNode([textNode(clean)])],
        },
      ],
    });
  } else {
    doc.content.push(paragraphNode([textNode(clean)]));
  }

  return doc as unknown as TLRichText;
}

/**
 * Extracts a concise primary headline from a `TLRichText` tree (first non-empty block),
 * ideal for symbolic register summaries on multi-line list/schema cards.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractHeadlineText(richText: any): string {
  if (!richText || typeof richText !== 'object') return '';
  if (typeof richText.text === 'string') return richText.text.trim();
  if (Array.isArray(richText.content)) {
    for (const child of richText.content) {
      const sub = extractHeadlineText(child);
      if (sub) return sub.slice(0, 48);
    }
  }
  return '';
}
