import type { JoystickState } from '../engine/input';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`요소를 찾을 수 없습니다: #${id}`);
  return found as T;
}

export class Overlay {
  private readonly screen = element('screen');
  private readonly title = element('screen-title');
  private readonly message = element('screen-message');
  private readonly controls = element('screen-controls');
  private readonly action = element<HTMLButtonElement>('screen-action');
  private readonly pauseButton = element<HTMLButtonElement>('pause-button');
  private readonly joystick = element('joystick');
  private readonly joystickKnob = element('joystick-knob');

  constructor(onAction: () => void, onPause: () => void) {
    this.action.addEventListener('click', onAction);
    this.pauseButton.addEventListener('click', onPause);
  }

  showStart(): void {
    this.show('행성을 걸어 보세요', '행성을 자유롭게 탐험해 보세요.', '시작하기');
  }

  showPaused(): void {
    this.show('일시 정지', '버튼을 누르면 이어서 플레이합니다.', '계속하기');
  }

  /** 플레이할 수 없는 환경을 알린다. 버튼 없이 안내만 보여준다. */
  showNotice(title: string, message: string): void {
    this.title.textContent = title;
    this.message.textContent = message;
    this.controls.hidden = true;
    this.action.hidden = true;
    this.screen.hidden = false;
    this.setPlaying(false);
  }

  hideScreen(): void {
    this.screen.hidden = true;
    this.setPlaying(true);
  }

  /** 터치 조이스틱을 손가락 위치에 그린다. `null`이면 숨긴다. */
  setJoystick(state: JoystickState | null): void {
    this.joystick.hidden = !state;
    if (!state) return;
    this.joystick.style.transform = `translate(${state.origin.x}px, ${state.origin.y}px)`;
    this.joystickKnob.style.transform = `translate(${state.knob.x}px, ${state.knob.y}px)`;
  }

  private show(title: string, message: string, action: string): void {
    this.title.textContent = title;
    this.message.textContent = message;
    this.action.textContent = action;
    this.controls.hidden = false;
    this.action.hidden = false;
    this.screen.hidden = false;
    this.setPlaying(false);
    this.action.focus({ preventScroll: true });
  }

  private setPlaying(playing: boolean): void {
    this.pauseButton.hidden = !playing;
    if (!playing) this.joystick.hidden = true;
  }
}
