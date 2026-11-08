import type { ContentContext, GraphicsContent } from './types';

/** 활성 콘텐츠를 한 번에 하나만 유지한다. */
export class ContentManager {
  private active: GraphicsContent | null = null;
  private readonly contents = new Map<string, GraphicsContent>();

  constructor(
    private readonly ctx: ContentContext,
    contents: readonly GraphicsContent[],
    private readonly onChange: (content: GraphicsContent) => void = () => {},
  ) {
    for (const content of contents) {
      if (this.contents.has(content.id)) throw new Error(`콘텐츠 id 중복: ${content.id}`);
      this.contents.set(content.id, content);
    }
  }

  get activeId(): string | null {
    return this.active?.id ?? null;
  }

  activate(id: string): void {
    if (this.active?.id === id) return;
    const next = this.contents.get(id);
    if (!next) throw new Error(`등록되지 않은 콘텐츠: ${id}`);
    this.active?.deactivate(this.ctx);
    this.active = next;
    next.activate(this.ctx);
    this.onChange(next);
  }

  update(dt: number): void {
    this.active?.update?.(dt, this.ctx);
  }
}
