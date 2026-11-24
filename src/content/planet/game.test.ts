import { describe, expect, it } from 'vitest';
import { STARFIELD } from './shapes/starfield';
import { SUN_RAYS } from './shapes/sunRays';
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../../engine/math';
import { CameraRig } from '../common/cameraRig';
import { loadSurfaceScene, SURFACE_OBJECTS, tvVideoScreen, VIDEO_SOUND, videoVolume, type SurfaceObject } from './objects/surfaceScene';
import { PLANET, surfaceDirection } from './planet';
import { Player, PLAYER_RADIUS, type MoveCommand } from '../common/character/player';
import { MOON } from './objects/moon';
import { ASTRONAUT } from './objects/astronaut';
import { SATELLITE } from './objects/satellite';
import { SUN } from './objects/sun';
import { pupilOffset, SUN_FACE, sunBillboardBasis, sunEyes } from './objects/sunFace';
import { TRAIN_CARS } from './objects/train';
import { NPCS, STUDIO_ENVIRONMENT, World } from './world';

function surfaceObject(id: string): SurfaceObject {
  const found = SURFACE_OBJECTS.find((o) => o.id === id);
  if (!found) throw new Error(`장면 파일에 ${id}가 없다`);
  return found;
}
const TV = surfaceObject('tv');
const ROCKET = surfaceObject('rocket');

const DT = 1 / 120;
const IDLE: MoveCommand = { direction: [0, 0, 0] };
/** 구의 중심이 표면에 놓였을 때 행성 중심까지의 거리 */
const REST_DISTANCE = PLANET.radius + PLAYER_RADIUS;
const TOP: Vec3 = [0, REST_DISTANCE, 0];

function simulate(player: Player, seconds: number, command: MoveCommand = IDLE): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) player.step(DT, command, PLANET);
}

/** Z축을 도는 대원을 따라 +X 쪽으로 나아가는 방향 */
function alongEquator(position: Vec3): Vec3 {
  return normalize(cross(position, [0, 0, 1]));
}

describe('구 조작', () => {
  it('떨어지면 튕긴 뒤 표면에 안정된다', () => {
    const player = new Player([0, REST_DISTANCE + 2.35, 0]);
    simulate(player, 3);
    expect(player.grounded).toBe(true);
    expect(length(player.position)).toBeCloseTo(REST_DISTANCE, 2);
    expect(Math.abs(player.velocity[1])).toBeLessThan(0.3);
  });

  it('중력은 어디서나 행성 중심을 향한다', () => {
    const player = new Player([-(REST_DISTANCE + 2), 0, 0]);
    player.step(DT, IDLE, PLANET);
    expect(player.velocity[0]).toBeGreaterThan(0);
    simulate(player, 3);
    expect(player.grounded).toBe(true);
    expect(player.position[0]).toBeCloseTo(-REST_DISTANCE, 2);
  });

  it('이동 입력이 속도를 만들고 최고 속도에서 수렴한다', () => {
    const player = new Player(TOP);
    const roll = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        player.step(DT, { direction: alongEquator(player.position) }, PLANET);
      }
    };
    roll(5);
    const speed = length(player.velocity);
    roll(1);
    expect(speed).toBeGreaterThan(8);
    expect(length(player.velocity)).toBeCloseTo(speed, 3);
  });

  it('행성을 한 바퀴 돌아도 표면에서 떨어지지 않는다', () => {
    const player = new Player(TOP);
    let lowest = Infinity;
    let reachedFarSide = false;
    for (let i = 0; i < 20 / DT; i++) {
      player.step(DT, { direction: alongEquator(player.position) }, PLANET);
      lowest = Math.min(lowest, player.position[1]);
      if (lowest < -REST_DISTANCE + 1 && player.position[1] > REST_DISTANCE - 1) reachedFarSide = true;
      expect(Math.abs(length(player.position) - REST_DISTANCE)).toBeLessThan(0.05);
    }
    expect(reachedFarSide).toBe(true);
  });

  it('표면에 수직인 입력은 구를 움직이지 않는다', () => {
    const player = new Player(TOP);
    simulate(player, 1, { direction: [0, 1, 0] });
    expect(length(sub(player.position, TOP))).toBeLessThan(1e-6);
  });

});

describe('카메라', () => {
  it('구가 행성 어디에 있든 화면의 위쪽은 표면의 바깥 방향이다', () => {
    const camera = new CameraRig(TOP, PLANET.center);
    const side: Vec3 = [REST_DISTANCE, 0, 0];
    for (let i = 0; i < 600; i++) camera.follow(side, 1 / 60);
    expect(camera.view.up[0]).toBeCloseTo(1, 3);
    expect(dot(camera.forward, camera.view.up)).toBeCloseTo(0, 5);
    expect(dot(camera.right, camera.view.up)).toBeCloseTo(0, 5);
    expect(length(camera.forward)).toBeCloseTo(1, 5);
  });

  it('마우스를 오른쪽으로 움직이면 오른쪽으로 돈다', () => {
    const camera = new CameraRig(TOP, PLANET.center);
    const right = camera.right;
    camera.applyLook(100, 0);
    expect(dot(camera.forward, right)).toBeGreaterThan(0.1);
  });
});

describe('월드 통합', () => {
  it('구는 행성 꼭대기에서 시작한다', () => {
    const world = new World();
    expect(world.player.position).toEqual(TOP);
  });
});

describe('텔레비전 자리', () => {
  const up = surfaceDirection(TV.latitude, TV.longitude);
  const surfaceDistance = (a: Vec3, b: Vec3): number =>
    Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * PLANET.radius;

  it('시작 지점을 덮지 않고, 시작할 때 바라보는 쪽 가까이에 있다', () => {
    const distance = surfaceDistance(up, [0, 1, 0]);
    expect(distance).toBeGreaterThan(TV.size[2] + PLAYER_RADIUS);
    expect(distance).toBeLessThan(10);
  });

  it('해가 드는 쪽에 있다', () => {
    expect(dot(up, STUDIO_ENVIRONMENT.lightDirection)).toBeGreaterThan(0.25);
  });

  it('바닥이 표면에 닿고, 위쪽이 표면 바깥을 향한다', () => {
    const m = TV.model;
    const center: Vec3 = [m[12], m[13], m[14]];
    const axisY: Vec3 = [m[4], m[5], m[6]];
    expect(dot(normalize(axisY), up)).toBeCloseTo(1, 6);
    const bottom = length(center) - TV.size[1] / 2;
    expect(bottom).toBeLessThan(PLANET.radius);
    expect(bottom).toBeGreaterThan(PLANET.radius - 0.3);
  });

  it('걸어서 상자를 통과할 수 없다', () => {
    const world = new World();
    const box = TV.box;
    const [, , halfDepth] = box.halfExtents;
    // 시작할 때 바라보는 쪽(-Z)으로 상자를 지나칠 만큼 걷는다.
    let closest = Infinity;
    for (let i = 0; i < 120 * 4; i++) {
      const position = world.player.position;
      const up = normalize(position);
      const forward = normalize(sub(box.center, scale(up, dot(box.center, up))));
      world.fixedStep(DT, { direction: forward });
      const front = dot(sub(world.player.position, box.center), box.axes[2]);
      closest = Math.min(closest, front);
    }
    // 정면까지 와서 부딪혔고, 구의 중심은 정면에서 반지름 이상 떨어져 있다.
    expect(closest).toBeLessThan(halfDepth + PLAYER_RADIUS + 0.1);
    expect(closest).toBeGreaterThan(halfDepth + PLAYER_RADIUS - 0.05);
    expect(length(world.player.position)).toBeCloseTo(REST_DISTANCE, 1);
  });

  it('월드 그리기 목록에 모양대로 들어간다', () => {
    const items = new World().buildDrawList(1);
    const count = (mesh: string) => items.filter((item) => item.mesh === mesh).length;
    const shapes = SURFACE_OBJECTS.map((o) => o.shape);
    // 정육면체 몸의 NPC도 `box` 메시를 쓴다.
    const cubeNpcs = NPCS.filter((npc) => npc.shape === 'cube').length;
    // 기차 차량도 `box` 부품을 쓴다.
    const trainBoxes = TRAIN_CARS.flatMap((car) => car.parts).filter((part) => part.mesh === 'box').length;
    // 외계인의 광선총 손잡이도 `box`다.
    const alienBoxes = new World().aliens.flatMap((alien) => alien.parts(1)).filter((part) => part.mesh === 'box').length;
    // 인공위성의 몸통, 단열재 띠, 전지판도 `box`다.
    const satelliteBoxes = new World().satellite.parts(1, [0, 1, 0]).filter((part) => part.mesh === 'box').length;
    expect(count('box')).toBe(shapes.filter((v) => v === 'box').length + cubeNpcs + trainBoxes + alienBoxes + satelliteBoxes);
    expect(count('rocket')).toBe(shapes.filter((v) => v === 'rocket').length);
    expect(count('rocketGlass')).toBe(count('rocket'));
    const tvs = shapes.filter((v) => v === 'tv').length;
    for (const mesh of ['tv', 'tvTrim', 'tvDark', 'tvScreen']) expect(count(mesh)).toBe(tvs);
  });

  it('텔레비전 모형으로 서고, 화면이 시작 지점 쪽을 본다', () => {
    expect(TV.shape).toBe('tv');
    const base = scale(surfaceDirection(TV.latitude, TV.longitude), PLANET.radius);
    expect(dot(TV.box.axes[2], normalize(sub([0, PLANET.radius, 0], base)))).toBeGreaterThan(0.9);
  });
});

describe('표면 장면 파일', () => {
  const valid = {
    id: 'a',
    shape: 'box',
    placement: { latitude: 10, longitude: 20 },
    size: [1, 1, 1],
    sink: 0.1,
    color: [0.5, 0.5, 0.5],
    roughness: 0.5,
    collides: true,
  };

  it('객체마다 id가 유일하다', () => {
    const ids = SURFACE_OBJECTS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('위도·경도 자리를 그대로 쓰고, 위성 아래 자리는 위성 방향에서 계산한다', () => {
    const [a, b] = loadSurfaceScene({ objects: [valid, { ...valid, id: 'b', placement: { under: 'moon' } }] });
    expect([a.latitude, a.longitude]).toEqual([10, 20]);
    expect(dot(surfaceDirection(b.latitude, b.longitude), MOON.direction)).toBeCloseTo(1, 6);
  });

  it('잘못된 값은 객체 id를 적어 거부한다', () => {
    expect(() => loadSurfaceScene({})).toThrow('objects');
    expect(() => loadSurfaceScene({ objects: [valid, valid] })).toThrow('겹친다');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, shape: 'cone' }] })).toThrow('(a).shape');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, size: [1, 0, 1] }] })).toThrow('(a).size');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, roughness: 2 }] })).toThrow('(a).roughness');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, placement: { under: 'sun' } }] })).toThrow('(a).placement');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, placement: { latitude: 100, longitude: 0 } }] })).toThrow(
      '(a).placement',
    );
    expect(() => loadSurfaceScene({ objects: [{ ...valid, youtube: 'aqz-KE-bpKQ' }] })).toThrow('(a).youtube');
    expect(() => loadSurfaceScene({ objects: [{ ...valid, shape: 'tv', youtube: 'watch?v=1' }] })).toThrow('(a).youtube');
  });

});

describe('텔레비전 영상', () => {
  const screen = tvVideoScreen(TV);

  it('텔레비전에 YouTube 영상이 있고, 다른 표면 객체에는 없다', () => {
    expect(TV.youtube).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(SURFACE_OBJECTS.filter((o) => o !== TV).map(tvVideoScreen)).toEqual(SURFACE_OBJECTS.filter((o) => o !== TV).map(() => null));
  });

  it('화면 자리가 텔레비전 정면 안쪽에 있고 시작 지점 쪽을 본다', () => {
    expect(screen).not.toBeNull();
    const s = screen!;
    const local = sub(s.center, TV.box.center);
    const [right, up, front] = TV.box.axes;
    // 정면(몸통 앞면은 뚜껑보다 조금 들어가 있다) 가까이, 상자 폭과 높이 안
    expect(dot(local, front)).toBeGreaterThan(TV.box.halfExtents[2] - 0.2);
    expect(dot(local, front)).toBeLessThan(TV.box.halfExtents[2] + 0.2);
    expect(Math.abs(dot(local, right)) + s.width / 2).toBeLessThan(TV.box.halfExtents[0]);
    expect(Math.abs(dot(local, up)) + s.height / 2).toBeLessThan(TV.box.halfExtents[1]);
    expect(dot(s.normal, front)).toBeCloseTo(1, 9);
    expect(s.model).toEqual(TV.model);
  });

  it('가까우면 소리가 크고 멀어질수록 줄어 들리지 않게 된다', () => {
    expect(videoVolume(0)).toBe(1);
    expect(videoVolume(VIDEO_SOUND.fullDistance)).toBe(1);
    expect(videoVolume(VIDEO_SOUND.silentDistance)).toBe(0);
    expect(videoVolume(PLANET.radius * 2)).toBe(0);
    const mid = videoVolume((VIDEO_SOUND.fullDistance + VIDEO_SOUND.silentDistance) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });
});

describe('로켓 자리', () => {
  const up = surfaceDirection(ROCKET.latitude, ROCKET.longitude);

  it('위성 바로 아래 표면에 있다', () => {
    expect(dot(up, MOON.direction)).toBeCloseTo(1, 6);
  });

  it('텔레비전 자리, 시작 지점과 떨어져 있다', () => {
    const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, dot(a, b))) * PLANET.radius;
    const tv = surfaceDirection(TV.latitude, TV.longitude);
    // 두 상자의 바닥 대각선 절반과 캐릭터 지름만큼 떨어져 있으면 사이로 지나갈 수 있다.
    const halfDiagonal = ([w, , d]: Vec3) => Math.hypot(w, d) / 2;
    expect(angle(up, tv)).toBeGreaterThan(halfDiagonal(TV.size) + halfDiagonal(ROCKET.size) + 2 * PLAYER_RADIUS);
    expect(angle(up, [0, 1, 0])).toBeGreaterThan(ROCKET.size[0] + PLAYER_RADIUS);
  });

  it('로켓 모형으로 표면에 서고, 위쪽이 위성을 향한다', () => {
    const box = ROCKET.box;
    const [, h] = ROCKET.size;
    expect(ROCKET.shape).toBe('rocket');
    expect(dot(box.axes[1], MOON.direction)).toBeCloseTo(1, 6);
    const bottom = length(box.center) - h / 2;
    expect(bottom).toBeLessThan(PLANET.radius);
    expect(bottom).toBeGreaterThan(PLANET.radius - 0.3);
  });

  it('걸어서 통과할 수 없다', () => {
    const world = new World();
    const box = ROCKET.box;
    let closest = Infinity;
    for (let i = 0; i < 120 * 12; i++) {
      const position = world.player.position;
      const up = normalize(position);
      const forward = normalize(sub(box.center, scale(up, dot(box.center, up))));
      world.fixedStep(DT, { direction: forward });
      closest = Math.min(closest, length(sub(world.player.position, box.center)));
    }
    // 상자 앞까지 와서 부딪혔고, 구는 상자 안으로 들어가지 않았다.
    expect(closest).toBeLessThan(box.halfExtents[0] * 1.5 + PLAYER_RADIUS);
    expect(closest).toBeGreaterThan(box.halfExtents[0] + PLAYER_RADIUS - 0.05);
  });
});

describe('해', () => {
  const stepWorld = (world: World, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) world.fixedStep(DT, IDLE);
  };
  const sunItem = (world: World) => world.buildDrawList(1).find((item) => item.mesh === 'sphere' && item.material.emissive[0] > 0)!;
  const sunCenter = (world: World): Vec3 => [sunItem(world).model[12], sunItem(world).model[13], sunItem(world).model[14]];

  it('시작할 때 직사광은 기본 조명 방향이다', () => {
    const world = new World();
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(1, 6);
  });

  it('직사광은 언제나 행성 중심에서 해 구체를 향한다', () => {
    const world = new World();
    for (let i = 0; i < 6; i++) {
      stepWorld(world, SUN.periodSeconds / 7);
      const center = sunCenter(world);
      expect(length(center)).toBeCloseTo(SUN.orbitRadius, 4);
      expect(dot(normalize(center), world.environment(1).lightDirection)).toBeCloseTo(1, 6);
    }
  });

  it('행성 둘레를 돌아 한 주기 뒤 제자리로 온다', () => {
    const world = new World();
    stepWorld(world, SUN.periodSeconds / 2);
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(-1, 3);
    stepWorld(world, SUN.periodSeconds / 2);
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(1, 3);
  });

  it('시작 지점의 머리 위를 지난다', () => {
    const world = new World();
    let highest = -1;
    for (let i = 0; i < 240; i++) {
      stepWorld(world, SUN.periodSeconds / 240);
      highest = Math.max(highest, world.environment(1).lightDirection[1]);
    }
    expect(highest).toBeGreaterThan(0.999);
  });

  it('궤적 고리는 해가 지나는 궤도와 같은 원이고 그림자를 드리우지 않는다', () => {
    const world = new World();
    const ring = world.buildDrawList(1).find((item) => item.mesh === 'ring')!;
    expect(ring.castShadow).toBe(false);
    const m = ring.model;
    // 고리 위의 점 (cos t, sin t, 0)을 옮겨 해 궤도 위에 있는지 본다.
    const normal = normalize(world.sun.axis);
    for (let t = 0; t < 2 * Math.PI; t += 0.7) {
      const p: Vec3 = [
        m[0] * Math.cos(t) + m[4] * Math.sin(t) + m[12],
        m[1] * Math.cos(t) + m[5] * Math.sin(t) + m[13],
        m[2] * Math.cos(t) + m[6] * Math.sin(t) + m[14],
      ];
      expect(length(p)).toBeCloseTo(SUN.orbitRadius, 4);
      expect(dot(p, normal)).toBeCloseTo(0, 4);
    }
    for (let i = 0; i < 5; i++) {
      stepWorld(world, SUN.periodSeconds / 6);
      expect(dot(world.sun.position(1), normal)).toBeCloseTo(0, 4);
    }
  });

  it('햇살은 해를 가운데 두고 둘러싸는 빌보드다', () => {
    const world = new World();
    stepWorld(world, SUN.periodSeconds / 5);
    const view = { position: [6, 30, -9] as Vec3, up: normalize([0.1, 1, 0.2]) };
    const rays = world.buildBillboards(1, view).filter((b) => b.image === 'sunRays');
    expect(rays).toHaveLength(1);
    const [ray] = rays;
    expect(length(sub(ray.position, world.sun.position(1)))).toBeCloseTo(0, 4);
    expect(ray.size[0]).toBeCloseTo(ray.size[1], 6);
    // 가장 긴 햇살의 끝까지 덮는다.
    expect(ray.size[0] / 2).toBeGreaterThan((SUN_RAYS.innerRadius + SUN_RAYS.maxLength) * SUN.radius);
    expect(ray.toneMapped).toBe(true);
    // 해 빌보드는 그리기 목록(그림자 패스)에 들어가지 않는다. 빛나는 항목은 해 구체, 해와 인공위성의 궤적 고리, 기차 전조등뿐이다.
    const lamps = TRAIN_CARS.flatMap((car) => car.parts).filter((part) => part.emissive).length;
    expect(world.buildDrawList(1).filter((item) => item.material.emissive[0] > 0)).toHaveLength(3 + lamps);
  });

  it('눈은 흰자와 검은자를 따로 그리고, 해 구면 앞에 놓인다', () => {
    const world = new World();
    const view = { position: [6, 30, -9] as Vec3, up: [0, 1, 0] as Vec3 };
    const disks = world.buildBillboards(1, view).filter((b) => b.image === 'disk');
    expect(disks).toHaveLength(4);
    const sun = world.sun.position(1);
    const toCamera = normalize(sub(view.position, sun));
    for (const disk of disks) {
      expect(dot(sub(disk.position, sun), toCamera)).toBeGreaterThan(SUN.radius);
    }
    const [white, pupil] = disks;
    // 검은자가 흰자보다 카메라 쪽에 있어 흰자 위에 그려진다.
    expect(dot(sub(pupil.position, white.position), toCamera)).toBeGreaterThan(0);
    expect(pupil.size[0]).toBeLessThan(white.size[0]);
  });

  it('별은 정해진 개수만큼 있고 얼굴 색 그대로 보인다', () => {
    const stars = new World().buildBillboards(1).filter((b) => b.image === 'starFace');
    expect(stars).toHaveLength(STARFIELD.count);
    for (const star of stars) expect(star.toneMapped).toBe(false);
  });

  it('검은자는 캐릭터 쪽으로 움직이되 흰자 밖으로 나가지 않는다', () => {
    const sun: Vec3 = [0, 0, -70];
    const basis = sunBillboardBasis(sun, { position: [0, 0, 0], up: [0, 1, 0] });
    const [rx, ry] = SUN_FACE.whiteRadius;
    const room = SUN_FACE.pupilRadius + SUN_FACE.pupilMargin;
    // 화면 오른쪽 위에 있는 대상을 보면 검은자도 오른쪽 위로 간다.
    const [u, v] = pupilOffset(basis, sun, [40, 30, -60]);
    expect(u).toBeGreaterThan(0);
    expect(v).toBeGreaterThan(0);
    // 해와 카메라를 잇는 선 위에 있으면 가운데를 본다.
    const centered = pupilOffset(basis, sun, [0, 0, -10]);
    expect(Math.hypot(...centered)).toBeCloseTo(0, 6);
    for (const target of [[500, 0, -70], [0, -500, -70], [300, 300, -70], [-1, 2, -200]] as Vec3[]) {
      const [x, y] = pupilOffset(basis, sun, target);
      expect((x / (rx - room)) ** 2 + (y / (ry - room)) ** 2).toBeLessThanOrEqual(1 + 1e-9);
    }
    const [left, right] = sunEyes(sun, SUN.radius, basis, [40, 30, -60]);
    expect(left.pupilOffset).toEqual(right.pupilOffset);
  });

  it('그림자를 드리우지 않는다', () => {
    expect(sunItem(new World()).castShadow).toBe(false);
  });
});

describe('인공위성', () => {
  const stepWorld = (world: World, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) world.fixedStep(DT, IDLE);
  };
  const rings = (world: World) => world.buildDrawList(1).filter((item) => item.mesh === 'ring');

  it('궤도를 돌아 한 주기 뒤 제자리로 오고, 궤적 고리가 그 궤도와 같은 원이다', () => {
    const world = new World();
    const start = world.satellite.position(1);
    const normal = world.satellite.axis;
    expect(length(start)).toBeCloseTo(SATELLITE.orbitRadius, 4);
    stepWorld(world, SATELLITE.periodSeconds / 4);
    const quarter = world.satellite.position(1);
    expect(dot(normalize(quarter), normalize(start))).toBeCloseTo(0, 2);
    expect(dot(quarter, normal)).toBeCloseTo(0, 4);
    stepWorld(world, (SATELLITE.periodSeconds * 3) / 4);
    expect(length(sub(world.satellite.position(1), start))).toBeLessThan(0.05);

    const orbit = rings(world)[1];
    expect(orbit.castShadow).toBe(false);
    const m = orbit.model;
    for (let t = 0; t < 2 * Math.PI; t += 0.7) {
      const p: Vec3 = [
        m[0] * Math.cos(t) + m[4] * Math.sin(t) + m[12],
        m[1] * Math.cos(t) + m[5] * Math.sin(t) + m[13],
        m[2] * Math.cos(t) + m[6] * Math.sin(t) + m[14],
      ];
      expect(length(p)).toBeCloseTo(SATELLITE.orbitRadius, 4);
      expect(dot(p, normal)).toBeCloseTo(0, 4);
    }
  });

  it('위성, 비눗방울 띠, 해 궤도와 부딪치지 않는 거리를 돈다', () => {
    const world = new World();
    // 전지판 끝까지의 반경 (월드)
    const reach = (SATELLITE.body[0] / 2 + SATELLITE.boomLength + SATELLITE.panel.length) * SATELLITE.scale * 1.05;
    const moonCenter = scale(MOON.direction, MOON.distance);
    for (let i = 0; i < 24; i++) {
      stepWorld(world, SATELLITE.periodSeconds / 24);
      const p = world.satellite.position(1);
      expect(length(sub(p, moonCenter))).toBeGreaterThan(MOON.radius * 1.25 + reach);
    }
    expect(SATELLITE.orbitRadius - reach).toBeGreaterThan(44 + 2.2 + 1);
    expect(SUN.orbitRadius - SATELLITE.orbitRadius).toBeGreaterThan(SUN.radius + reach);
  });

  it('접시에서 행성 쪽으로 신호 물결이 퍼져 나간다', () => {
    const world = new World();
    stepWorld(world, SATELLITE.signal.lifetime * 2);
    const sat = world.satellite;
    const source = sat.signalSource(1);
    const down = scale(sat.direction(1), -1);
    // 궤도면 법선 쪽 옆에서 보면 신호 방향이 화면에 온전히 보인다.
    const view = { position: add(source, scale(sat.axis, 30)), up: sat.direction(1) };
    const waves = world.buildBillboards(1, view).filter((b) => b.image === 'signalArc');
    const { interval, lifetime } = SATELLITE.signal;
    expect(waves.length).toBeGreaterThanOrEqual(Math.floor(lifetime / interval) - 1);
    expect(waves.length).toBeLessThanOrEqual(Math.ceil(lifetime / interval) + 1);
    for (const wave of waves) {
      expect(length(sub(wave.position, source))).toBeCloseTo(0, 6);
      expect(wave.opacity!).toBeGreaterThanOrEqual(0);
      expect(wave.opacity!).toBeLessThanOrEqual(1);
      // 회전한 빌보드의 +Y가 화면에서 행성 쪽(카메라 기준 아래)을 본다.
      const basis = sunBillboardBasis(source, view);
      const r = wave.rotation!;
      const up = add(scale(basis.x, -Math.sin(r)), scale(basis.y, Math.cos(r)));
      expect(dot(up, down)).toBeCloseTo(1, 4);
    }
    // 먼저 생긴 물결일수록 크고 가는 프레임이다.
    const sorted = [...waves].sort((a, b) => a.size[0] - b.size[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].frame!).toBeGreaterThanOrEqual(sorted[i - 1].frame!);
    // 신호를 정면(행성 쪽 아래)에서 보면 감춘다.
    const below = { position: add(source, scale(down, 20)), up: sat.axis };
    expect(world.buildBillboards(1, below).filter((b) => b.image === 'signalArc')).toHaveLength(0);
  });

  it('전지판이 해를 보고, 접시가 행성을 보며, 그림자를 드리우지 않는다', () => {
    const world = new World();
    stepWorld(world, 5);
    const sun = world.sun.direction(1);
    const parts = world.satellite.parts(1, sun);
    const center = world.satellite.position(1);
    // 전지판 칸: 가장 얇은 축이 판의 법선이다. 해 방향을 궤도면 법선(붐)에 수직인 평면에 투영한 것과 나란하다.
    const boom = world.satellite.axis;
    const projected = normalize(sub(sun, scale(boom, dot(sun, boom))));
    const cells = parts.filter((part) => part.mesh === 'box' && part.color[0] < 0.1);
    expect(cells).toHaveLength(16);
    for (const cell of cells) {
      const panelNormal = normalize([cell.model[4], cell.model[5], cell.model[6]]);
      expect(Math.abs(dot(panelNormal, projected))).toBeCloseTo(1, 4);
    }
    // 접시 메시의 -Y(오목한 쪽)가 행성 중심을 본다.
    const dish = parts.find((part) => part.mesh === 'satelliteDish')!;
    const dishDown = normalize([-dish.model[4], -dish.model[5], -dish.model[6]]);
    expect(dot(dishDown, normalize(scale(center, -1)))).toBeCloseTo(1, 4);
    const satelliteItems = world.buildDrawList(1).filter((item) => item.mesh === 'satelliteDish');
    expect(satelliteItems.every((item) => !item.castShadow)).toBe(true);
  });
});

describe('우주인 스티커', () => {
  const sticker = (world: World) => world.buildBillboards(1).filter((b) => b.image === 'astronaut');

  it('위성 곁에 하나 떠 있고, 어느 쪽에서 보아도 위성 속에 묻히지 않는다', () => {
    const world = new World();
    const [b] = sticker(world);
    expect(sticker(world)).toHaveLength(1);
    const moonCenter = scale(MOON.direction, MOON.distance);
    const gap = length(sub(b.position, moonCenter));
    expect(gap - (ASTRONAUT.size / 2) * Math.SQRT2 - ASTRONAUT.bobAmplitude).toBeGreaterThan(MOON.radius * 1.25);
    expect(gap).toBeLessThan(MOON.radius * 3);
    // 사진 색 그대로, 조명과 톤 매핑을 받지 않는다.
    expect(b.toneMapped).toBe(false);
    expect(b.color).toEqual([1, 1, 1]);
  });

  it('시간이 흐르면 둥실거리고 기우뚱한다', () => {
    const world = new World();
    const before = sticker(world)[0];
    for (let i = 0; i < Math.round(ASTRONAUT.bobPeriodSeconds / 4 / DT); i++) world.fixedStep(DT, IDLE);
    const after = sticker(world)[0];
    expect(length(sub(after.position, before.position))).toBeGreaterThan(ASTRONAUT.bobAmplitude * 0.8);
    expect(after.rotation).not.toBeCloseTo(before.rotation!, 3);
  });
});

describe('위성', () => {
  const moonItem = (world: World) => world.buildDrawList(1).find((item) => item.mesh === 'moon')!;

  it('행성과 해의 궤도에서 떨어진 고정된 자리에서 자전한다', () => {
    const world = new World();
    const before = moonItem(world).model.slice();
    for (let i = 0; i < Math.round(MOON.spinPeriodSeconds / 4 / DT); i++) world.fixedStep(DT, IDLE);
    const after = moonItem(world).model;
    // 자리는 그대로
    expect([after[12], after[13], after[14]]).toEqual([before[12], before[13], before[14]]);
    // 4분의 1바퀴 돌았으므로 자전축에 수직인 축은 방향이 바뀐다.
    expect(Math.abs(after[0] - before[0]) + Math.abs(after[2] - before[2])).toBeGreaterThan(0.5);

    const center: Vec3 = [after[12], after[13], after[14]];
    expect(length(center) - MOON.radius * 1.25).toBeGreaterThan(PLANET.radius + 10);
    // 해 궤도면에서 해 반지름과 위성 반지름보다 멀다.
    expect(Math.abs(dot(center, normalize(world.sun.axis)))).toBeGreaterThan(SUN.radius + MOON.radius * 1.25);
  });

  it('그림자를 드리우지 않는다', () => {
    expect(moonItem(new World()).castShadow).toBe(false);
  });
});
