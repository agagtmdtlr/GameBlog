import { BOARD, type Cell } from './world';

/** 미니맵 한 변 (CSS px) */
const SIZE = 120;
const PAPER = '#e9dcc6';
const GRASS = '#c4e6a8';
const INK = '#2a221e';
const BODY = '#a98bf0';
const HEAD = '#e2577a';

/** 화면 모서리의 판 전체 지도. 몸과 머리, 카메라가 보는 곳을 그림으로만 보인다. */
export class Minimap {
  readonly element: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly ratio = Math.min(window.devicePixelRatio || 1, 2);

  constructor(parent: HTMLElement) {
    this.element = document.createElement('canvas');
    this.element.className = 'tsnake-minimap';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.width = this.element.height = SIZE * this.ratio;
    parent.append(this.element);
    this.context = this.element.getContext('2d')!;
  }

  /**
   * 다시 그린다. `focus`는 카메라가 보는 판 위 자리(칸 단위), `view`는 화면에 보이는 칸 수(가로, 세로)다.
   */
  draw(body: readonly Cell[], focus: { x: number; z: number }, view: { width: number; height: number }, blink: boolean): void {
    const g = this.context;
    const s = (SIZE * this.ratio) / BOARD;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.element.width, this.element.height);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, this.element.width, this.element.height);
    g.fillStyle = GRASS;
    g.fillRect(s * 0.5, s * 0.5, s * (BOARD - 1), s * (BOARD - 1));

    // 카메라가 보는 곳
    g.strokeStyle = 'rgba(42, 34, 30, 0.45)';
    g.lineWidth = 1.5 * this.ratio;
    g.strokeRect(
      (focus.x + 0.5 - view.width / 2) * s,
      (focus.z + 0.5 - view.height / 2) * s,
      view.width * s,
      view.height * s,
    );

    // 칸이 작아서(약 3px) 몸은 칸보다 크게 그린다.
    g.fillStyle = BODY;
    const dot = s * 1.8;
    for (let i = body.length - 1; i >= 1; i--) {
      g.fillRect((body[i].x + 0.5) * s - dot / 2, (body[i].y + 0.5) * s - dot / 2, dot, dot);
    }
    if (!blink) {
      const head = body[0];
      g.fillStyle = HEAD;
      g.beginPath();
      g.arc((head.x + 0.5) * s, (head.y + 0.5) * s, s * 1.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = this.ratio;
      g.stroke();
    }
  }
}
