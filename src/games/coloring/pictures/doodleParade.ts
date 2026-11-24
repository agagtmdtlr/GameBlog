import {
  circleD,
  divided,
  dot,
  ellipseD,
  heartD,
  inked,
  line,
  path,
  pictureSvg,
  polygonD,
  scallopD,
  starPoints,
} from './svg';

/**
 * "두들 퍼레이드": 해, 구름, 별, 로켓 아래로 토끼·고양이·선인장·부엉이·개구리·곰·펭귄·버섯이 모여 있는 그림.
 * 뒤에서 앞 순서로 그린다. 좌표는 1000 × 1000 칸.
 */

const background = [
  // 하늘과 땅을 나누는 물결 언덕
  path('M30,600 C200,540 350,640 520,590 C700,540 820,610 970,560 L970,970 L30,970 Z'),
  // 틈을 메우는 작은 장식
  path(polygonD(starPoints(300, 262, 30, 14, 5))),
  path(heartD(598, 262, 46)),
  path(polygonD(starPoints(72, 345, 26, 12, 4, 0))),
  path(polygonD(starPoints(780, 258, 22, 10, 4, 0))),
  path(heartD(312, 545, 40)),
];

const sun = [
  path(polygonD(starPoints(160, 165, 130, 100, 12))),
  path(circleD(160, 165, 84)),
  dot(132, 155),
  dot(188, 155),
  line('M135,188 Q160,212 185,188'),
];

const cloud = [
  path(scallopD(470, 140, 140, 60, 10, 0.2)),
  dot(440, 136, 8),
  dot(500, 136, 8),
  line('M452,160 Q470,176 488,160'),
];

const star = [
  path(polygonD(starPoints(700, 150, 74, 36, 5, -82))),
  dot(684, 152, 7),
  dot(716, 152, 7),
  line('M690,170 Q700,180 710,170'),
];

const rocket = [
  path('M830,312 Q838,372 860,400 Q882,372 890,312 Z'),
  path('M846,316 Q850,350 860,370 Q870,350 874,316 Z'),
  path('M822,232 L768,318 L776,334 L832,306 Z'),
  path('M898,232 L952,318 L944,334 L888,306 Z'),
  divided('M860,50 C918,100 930,200 905,315 L815,315 C790,200 802,100 860,50 Z', [
    'M780,126 Q860,102 940,126',
    'M780,272 L940,272',
  ]),
  path(circleD(860, 195, 36)),
  dot(847, 192, 6),
  dot(873, 192, 6),
  line('M850,208 Q860,217 870,208'),
];

const bunny = [
  path(ellipseD(150, 285, 32, 90, -12)),
  path(ellipseD(232, 285, 32, 90, 12)),
  path(ellipseD(150, 292, 14, 58, -12)),
  path(ellipseD(232, 292, 14, 58, 12)),
  path(ellipseD(190, 575, 98, 88)),
  path(ellipseD(190, 590, 52, 50)),
  path(circleD(190, 420, 88)),
  dot(160, 410),
  dot(220, 410),
  inked(ellipseD(190, 437, 10, 7)),
  line('M174,452 Q182,463 190,452 Q198,463 206,452'),
  path(ellipseD(140, 640, 30, 21)),
  path(ellipseD(240, 640, 30, 21)),
];

const cat = [
  path('M545,612 C615,602 628,532 594,510 C578,500 562,516 574,532 C592,556 584,584 538,590 Z'),
  path(ellipseD(450, 595, 112, 74)),
  path(polygonD([[350, 400], [360, 280], [434, 345]])),
  path(polygonD([[550, 400], [540, 280], [466, 345]])),
  path(polygonD([[372, 372], [370, 310], [412, 345]])),
  path(polygonD([[528, 372], [530, 310], [488, 345]])),
  divided(ellipseD(450, 440, 124, 98), ['M300,386 Q450,350 600,386']),
  line('M430,352 L432,372'),
  line('M450,348 L450,370'),
  line('M470,352 L468,372'),
  dot(408, 445, 10),
  dot(492, 445, 10),
  inked(polygonD([[439, 466], [461, 466], [450, 477]])),
  line('M432,488 Q441,498 450,487 Q459,498 468,488'),
  line('M350,460 L388,464'),
  line('M352,484 L390,480'),
  line('M550,460 L512,464'),
  line('M548,484 L510,480'),
  path(ellipseD(405, 650, 32, 21)),
  path(ellipseD(495, 650, 32, 21)),
];

const cactus = [
  path('M660,472 L612,472 Q592,472 592,452 L592,402 Q592,382 610,382 Q628,382 628,402 L628,436 L660,436 Z'),
  path('M720,420 L768,420 Q788,420 788,400 L788,352 Q788,332 770,332 Q752,332 752,352 L752,386 L720,386 Z'),
  divided('M650,580 L650,345 Q650,300 690,300 Q730,300 730,345 L730,580 Z', ['M600,505 Q690,530 780,505']),
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return path(circleD(690 + 24 * Math.cos(a), 292 + 24 * Math.sin(a), 19));
  }),
  path(circleD(690, 292, 15)),
  dot(674, 400, 7),
  dot(706, 400, 7),
  line('M680,420 Q690,430 700,420'),
  path(polygonD([[636, 590], [744, 590], [728, 668], [652, 668]])),
  path(polygonD([[624, 556], [756, 556], [756, 594], [624, 594]])),
];

const owl = [
  path(polygonD([[782, 412], [786, 345], [832, 388]])),
  path(polygonD([[918, 412], [914, 345], [868, 388]])),
  path('M850,365 C928,365 948,470 940,560 C932,632 768,632 760,560 C752,470 772,365 850,365 Z'),
  path(ellipseD(850, 556, 60, 54)),
  line('M826,540 l10,10 l10,-10'),
  line('M854,540 l10,10 l10,-10'),
  line('M840,568 l10,10 l10,-10'),
  path(ellipseD(770, 520, 24, 58, 15)),
  path(ellipseD(930, 520, 24, 58, -15)),
  path(circleD(818, 440, 31)),
  path(circleD(882, 440, 31)),
  dot(822, 444, 11),
  dot(878, 444, 11),
  inked(polygonD([[850, 462], [837, 484], [863, 484]])),
  path(ellipseD(828, 626, 18, 11)),
  path(ellipseD(872, 626, 18, 11)),
];

const frog = [
  path(circleD(110, 715, 46)),
  path(circleD(232, 715, 46)),
  path(ellipseD(170, 828, 140, 102)),
  path(ellipseD(170, 880, 82, 44)),
  dot(110, 712, 15),
  dot(232, 712, 15),
  dot(158, 772, 4),
  dot(182, 772, 4),
  line('M92,800 Q170,850 248,800'),
  path(ellipseD(76, 928, 50, 24)),
  path(ellipseD(264, 928, 50, 24)),
];

const bear = [
  path(circleD(378, 650, 40)),
  path(circleD(562, 650, 40)),
  path(circleD(378, 650, 19)),
  path(circleD(562, 650, 19)),
  path(ellipseD(470, 895, 148, 118)),
  path(ellipseD(470, 912, 86, 66)),
  path(circleD(470, 715, 100)),
  path(ellipseD(470, 752, 44, 33)),
  inked(ellipseD(470, 737, 15, 10)),
  line('M470,747 L470,762 M455,770 Q470,780 485,770'),
  dot(430, 700, 10),
  dot(510, 700, 10),
  divided(polygonD([[552, 812], [618, 812], [585, 910]]), ['M556,790 L626,870', 'M614,790 L544,870']),
  path(scallopD(585, 792, 42, 30, 7, 0.4)),
  path(circleD(585, 752, 15)),
  path(ellipseD(566, 872, 30, 23)),
  path(ellipseD(372, 872, 30, 23)),
];

const penguin = [
  path('M740,655 C815,655 835,760 835,860 C835,945 645,945 645,860 C645,760 665,655 740,655 Z'),
  path('M740,725 C785,725 796,800 796,860 C796,915 684,915 684,860 C684,800 695,725 740,725 Z'),
  divided('M670,708 C662,612 818,612 810,708 Q740,690 670,708 Z', ['M650,680 Q740,664 830,680']),
  path(circleD(740, 614, 19)),
  dot(718, 742, 8),
  dot(762, 742, 8),
  inked(polygonD([[728, 758], [752, 758], [740, 775]])),
  path(ellipseD(652, 830, 19, 56, 20)),
  path(ellipseD(828, 830, 19, 56, -20)),
  path(ellipseD(708, 935, 32, 14)),
  path(ellipseD(772, 935, 32, 14)),
];

const mushroom = [
  path('M855,975 L864,830 L910,830 L922,975 Z'),
  path('M800,845 C800,730 960,730 960,845 Q880,828 800,845 Z'),
  path(circleD(842, 802, 16)),
  path(circleD(890, 778, 18)),
  path(circleD(928, 812, 14)),
  dot(875, 880, 6),
  dot(903, 880, 6),
  line('M880,898 Q889,906 898,898'),
];

export const DOODLE_PARADE = pictureSvg([
  ...background,
  ...sun,
  ...cloud,
  ...star,
  ...rocket,
  ...bunny,
  ...cat,
  ...cactus,
  ...owl,
  ...frog,
  ...bear,
  ...penguin,
  ...mushroom,
]);
