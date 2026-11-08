import type { Vec3 } from '../engine/math';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`요소를 찾을 수 없습니다: #${id}`);
  return found as T;
}

/** 선형 RGB를 CSS 색으로 변환한다. */
function cssColor(linear: Vec3): string {
  const encode = (c: number): number => {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return `rgb(${encode(linear[0])} ${encode(linear[1])} ${encode(linear[2])})`;
}

export class Overlay {
  private readonly screen = element('screen');
  private readonly title = element('screen-title');
  private readonly message = element('screen-message');
  private readonly controls = element('screen-controls');
  private readonly action = element<HTMLButtonElement>('screen-action');
  private readonly hud = element('hud');
  private readonly swatch = element('hud-swatch');
  private readonly label = element('hud-label');

  constructor(onAction: () => void) {
    this.action.addEventListener('click', onAction);
  }

  showStart(): void {
    this.show('구를 굴려 보세요', '발판을 밟으면 그래픽스 콘텐츠가 켜집니다.', '시작하기');
  }

  showPaused(): void {
    this.show('일시 정지', '클릭하면 이어서 플레이합니다.', '계속하기');
  }

  /** 플레이할 수 없는 환경을 알린다. 버튼 없이 안내만 보여준다. */
  showNotice(title: string, message: string): void {
    this.title.textContent = title;
    this.message.textContent = message;
    this.controls.hidden = true;
    this.action.hidden = true;
    this.screen.hidden = false;
    this.hud.hidden = true;
  }

  hideScreen(): void {
    this.screen.hidden = true;
    this.hud.hidden = false;
  }

  setActiveContent(label: string, color: Vec3): void {
    this.label.textContent = label;
    this.swatch.style.backgroundColor = cssColor(color);
    this.hud.classList.remove('hud--changed');
    // 레이아웃을 강제로 계산해 같은 애니메이션을 다시 재생한다.
    void this.hud.offsetWidth;
    this.hud.classList.add('hud--changed');
  }

  private show(title: string, message: string, action: string): void {
    this.title.textContent = title;
    this.message.textContent = message;
    this.action.textContent = action;
    this.controls.hidden = false;
    this.action.hidden = false;
    this.screen.hidden = false;
    this.hud.hidden = true;
    this.action.focus({ preventScroll: true });
  }
}
