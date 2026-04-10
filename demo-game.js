(() => {
  const canvas = document.getElementById('demo-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ui = {
    hp: document.getElementById('demo-hp'),
    relics: document.getElementById('demo-relics'),
    kills: document.getElementById('demo-kills'),
    mode: document.getElementById('demo-mode'),
    time: document.getElementById('demo-time'),
    objective: document.getElementById('demo-objective'),
    overlay: document.getElementById('demo-overlay'),
    restart: document.getElementById('demo-restart')
  };

  const touch = {
    root: document.getElementById('touch-controls'),
    moveButtons: Array.from(document.querySelectorAll('[data-move]')),
    actionButtons: Array.from(document.querySelectorAll('[data-action]'))
  };

  const celebration = {
    layer: document.getElementById('petal-layer'),
    banner: document.getElementById('victory-banner'),
    menu: document.getElementById('victory-menu')
  };

  const RAW_MAP = [
    '##############################',
    '#S..###########.....####....##',
    '#..R.....######.###.####.#####',
    '#.#############.###..E##....##',
    '#.#############.###.####.....#',
    '#..#E##########.R##.####.....#',
    '##.#.##########..##...##.....#',
    '##...#######~~~~~~~~~.##.....#',
    '#..###......D~~~r~~~D..#..####',
    '#.####.#####~~~~~~~~~.##..####',
    '#.##........#####E###.##..####',
    '#..##......######.###.#...####',
    '##.###.#########T.#.......####',
    '#..###.#########T##......#####',
    '#.####.#########T#..G.##.E####',
    '#.##...######...T..##....#####',
    '#....#........################',
    '##############################'
  ];

  const KILLS_TO_WIN = 4;
  const MAX_HP = 5;

  const ENEMY_ARCHETYPES = [
    { type: 'slime', hp: 2, speed: 1.15 },
    { type: 'mushling', hp: 2, speed: 1.3 },
    { type: 'boar', hp: 3, speed: 1.45 },
    { type: 'owlbat', hp: 2, speed: 1.55 }
  ];

  let map = [];
  let width = 0;
  let height = 0;
  let relics = [];
  let enemies = [];
  let goal = { x: 0, y: 0 };
  let celebrationStarted = false;

  const player = {
    x: 1.5,
    y: 1.5,
    radius: 0.28,
    hp: MAX_HP,
    mode: 'ground',
    facingX: 1,
    facingY: 0,
    invuln: 0,
    attackCd: 0,
    knockX: 0,
    knockY: 0,
    knocks: 0
  };

  const duck = {
    x: 1.1,
    y: 1.5
  };

  let kills = 0;
  let elapsed = 0;
  let messageTimer = 0;
  let state = 'running';
  let pressed = Object.create(null);

  const keys = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right'
  };

  const palettes = {
    adventure: {
      floor: '#233544',
      floor2: '#203140',
      wall: '#0d1a24',
      wallEdge: '#3f6b88',
      water: '#2b6f8f',
      waterWave: '#7bd0f3',
      tree: '#355c41',
      dock: '#8f6d47',
      goal: '#ffe177',
      hp: '#f07b82',
      text: '#d7ecf8'
    },
    storybook: {
      floor: '#d9cbb4',
      floor2: '#d3c4aa',
      wall: '#7b6859',
      wallEdge: '#f0dfc4',
      water: '#7faab7',
      waterWave: '#d9f0f2',
      tree: '#8ea17f',
      dock: '#b48b62',
      goal: '#da8b42',
      hp: '#c55f5f',
      text: '#2f302f'
    }
  };

  function currentPalette() {
    return document.body.classList.contains('theme-storybook') ? palettes.storybook : palettes.adventure;
  }

  function setMessage(text, time = 2.2) {
    if (ui.objective) ui.objective.textContent = text;
    messageTimer = time;
  }

  function formatTime(total) {
    const sec = Math.floor(total);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return '#';
    return map[ty][tx];
  }

  function tileAtPos(x, y) {
    return tileAt(Math.floor(x), Math.floor(y));
  }

  function passable(tile, mode) {
    if (tile === '#') return false;
    if (mode === 'ferry') return tile !== 'T';
    if (mode === 'carry') return tile !== '~';
    if (tile === '~' || tile === 'T') return false;
    return true;
  }

  function canOccupy(x, y, mode) {
    const r = player.radius;
    const points = [
      [x - r, y - r],
      [x + r, y - r],
      [x - r, y + r],
      [x + r, y + r]
    ];
    for (const [px, py] of points) {
      if (!passable(tileAtPos(px, py), mode)) return false;
    }
    return true;
  }

  function buildPatrol(x, y) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    const points = [{ x: x + 0.5, y: y + 0.5 }];

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const t = tileAt(nx, ny);
      if (t !== '#' && t !== '~' && t !== 'T') {
        points.push({ x: nx + 0.5, y: ny + 0.5 });
      }
      if (points.length >= 3) break;
    }

    return points;
  }

  function parseMap() {
    width = RAW_MAP.reduce((m, row) => Math.max(m, row.length), 0);
    map = RAW_MAP.map((row) => row.padEnd(width, '#').split(''));
    height = map.length;
    relics = [];
    enemies = [];

    let enemyTypeIndex = 0;
    let relicTypeIndex = 0;
    const relicTypes = ['pizza', 'flower'];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const c = map[y][x];
        if (c === 'S') {
          player.x = x + 0.5;
          player.y = y + 0.5;
          map[y][x] = '.';
        } else if (c === 'R' || c === 'r') {
          const type = relicTypes[relicTypeIndex % relicTypes.length];
          relicTypeIndex += 1;
          relics.push({ x: x + 0.5, y: y + 0.5, taken: false, type });
          map[y][x] = c === 'r' ? '~' : '.';
        } else if (c === 'E') {
          const profile = ENEMY_ARCHETYPES[enemyTypeIndex % ENEMY_ARCHETYPES.length];
          enemyTypeIndex += 1;
          enemies.push({
            x: x + 0.5,
            y: y + 0.5,
            type: profile.type,
            hp: profile.hp,
            maxHp: profile.hp,
            patrol: buildPatrol(x, y),
            patrolIndex: 0,
            speed: profile.speed
          });
          map[y][x] = '.';
        } else if (c === 'G') {
          goal = { x: x + 0.5, y: y + 0.5 };
          map[y][x] = '.';
        }
      }
    }

    duck.x = player.x - 0.4;
    duck.y = player.y;
  }

  function resetCelebration() {
    celebrationStarted = false;
    document.body.classList.remove('celebration-on');
    celebration.banner?.classList.remove('visible');
    celebration.menu?.classList.add('is-hidden');
    if (celebration.layer) celebration.layer.innerHTML = '';
  }

  function spawnPetals() {
    if (!celebration.layer) return;
    celebration.layer.innerHTML = '';
    for (let i = 0; i < 36; i += 1) {
      const petal = document.createElement('span');
      petal.className = 'petal';
      petal.style.left = `${Math.random() * 100}%`;
      petal.style.animationDuration = `${7 + Math.random() * 6}s`;
      petal.style.animationDelay = `${Math.random() * 4}s`;
      petal.style.setProperty('--drift', `${-50 + Math.random() * 100}px`);
      celebration.layer.appendChild(petal);
    }
  }

  function triggerCelebration() {
    if (celebrationStarted) return;
    celebrationStarted = true;
    document.body.classList.add('celebration-on');
    celebration.banner?.classList.add('visible');
    celebration.menu?.classList.remove('is-hidden');
    spawnPetals();
  }

  function resetGame() {
    parseMap();
    player.hp = MAX_HP;
    player.mode = 'ground';
    player.facingX = 1;
    player.facingY = 0;
    player.invuln = 0;
    player.attackCd = 0;
    player.knockX = 0;
    player.knockY = 0;
    player.knocks = 0;
    kills = 0;
    elapsed = 0;
    state = 'running';
    traversedWater = false;
    traversedTree = false;
    setMessage('Objective: 3 relics + 4 kills + star goal.', 3);
    if (ui.overlay) {
      ui.overlay.classList.add('is-hidden');
      ui.overlay.classList.remove('victory');
      ui.overlay.textContent = '';
    }
    resetCelebration();
    updateHud();
  }

  function movePlayer(dt) {
    let dx = 0;
    let dy = 0;
    if (pressed.up) dy -= 1;
    if (pressed.down) dy += 1;
    if (pressed.left) dx -= 1;
    if (pressed.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      player.facingX = dx;
      player.facingY = dy;
    }

    const speed = player.mode === 'ferry' ? 3.0 : player.mode === 'carry' ? 2.7 : 3.2;
    const kx = player.knocks > 0 ? player.knockX * 2.3 : 0;
    const ky = player.knocks > 0 ? player.knockY * 2.3 : 0;

    const stepX = (dx * speed + kx) * dt;
    const stepY = (dy * speed + ky) * dt;

    const nx = player.x + stepX;
    if (canOccupy(nx, player.y, player.mode)) player.x = nx;

    const ny = player.y + stepY;
    if (canOccupy(player.x, ny, player.mode)) player.y = ny;

    if (player.knocks > 0) player.knocks -= dt;
  }

  function updateDuck(dt) {
    if (player.mode === 'ferry') {
      duck.x += (player.x - duck.x) * Math.min(1, dt * 10);
      duck.y += (player.y + 0.04 - duck.y) * Math.min(1, dt * 10);
      return;
    }

    if (player.mode === 'carry') {
      duck.x += (player.x - duck.x) * Math.min(1, dt * 12);
      duck.y += (player.y - 0.3 - duck.y) * Math.min(1, dt * 12);
      return;
    }

    const tx = player.x - player.facingX * 0.55;
    const ty = player.y - player.facingY * 0.55;
    duck.x += (tx - duck.x) * Math.min(1, dt * 8);
    duck.y += (ty - duck.y) * Math.min(1, dt * 8);
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.patrol.length <= 1) continue;

      const target = enemy.patrol[enemy.patrolIndex % enemy.patrol.length];
      const vx = target.x - enemy.x;
      const vy = target.y - enemy.y;
      const dist = Math.hypot(vx, vy);

      if (dist < 0.08) {
        enemy.patrolIndex = (enemy.patrolIndex + 1) % enemy.patrol.length;
      } else {
        enemy.x += (vx / dist) * enemy.speed * dt;
        enemy.y += (vy / dist) * enemy.speed * dt;
      }

      const toPlayerX = player.x - enemy.x;
      const toPlayerY = player.y - enemy.y;
      const d = Math.hypot(toPlayerX, toPlayerY);
      if (d < 0.58 && player.invuln <= 0 && state === 'running') {
        player.hp -= 1;
        player.invuln = 1.1;
        const inv = d > 0.001 ? 1 / d : 1;
        player.knockX = toPlayerX * inv;
        player.knockY = toPlayerY * inv;
        player.knocks = 0.16;
        setMessage('Hit by a forest monster. Reposition and switch mode.');

        if (player.hp <= 0) {
          state = 'defeat';
          if (ui.overlay) {
            ui.overlay.classList.remove('is-hidden');
            ui.overlay.classList.remove('victory');
            ui.overlay.textContent = 'Mission Failed - Press R or tap Restart';
          }
        }
      }
    }
  }

  function tryAttack() {
    if (state !== 'running') return;
    if (player.mode !== 'ground') {
      setMessage('Cannot attack while carrying. Switch back to Ground mode.');
      return;
    }
    if (player.attackCd > 0) return;

    player.attackCd = 0.48;
    let target = null;
    let best = 999;

    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const vx = enemy.x - player.x;
      const vy = enemy.y - player.y;
      const dist = Math.hypot(vx, vy);
      if (dist > 1.15) continue;
      const dot = vx * player.facingX + vy * player.facingY;
      if (dot < -0.06) continue;
      if (dist < best) {
        best = dist;
        target = enemy;
      }
    }

    if (!target) {
      setMessage('Attack missed. Adjust your position.');
      return;
    }

    target.hp -= 1;
    if (target.hp <= 0) {
      kills += 1;
      setMessage(`Monster defeated (${kills}/${KILLS_TO_WIN})`);
    } else {
      setMessage('Hit confirmed.');
    }
  }

  function tryToggleFerry() {
    if (state !== 'running') return;
    player.mode = player.mode === 'ferry' ? 'ground' : 'ferry';
    setMessage(player.mode === 'ferry' ? 'Sia is carrying Luisa (Duck Carry).' : 'Back to Ground mode.');
  }

  function tryToggleCarry() {
    if (state !== 'running') return;
    player.mode = player.mode === 'carry' ? 'ground' : 'carry';
    setMessage(player.mode === 'carry' ? 'Luisa is carrying Sia (Raccoon Carry).' : 'Back to Ground mode.');
  }

  function collectRelics() {
    for (const relic of relics) {
      if (relic.taken) continue;
      const dist = Math.hypot(relic.x - player.x, relic.y - player.y);
      if (dist < 0.5) {
        relic.taken = true;
        const icon = relic.type === 'pizza' ? 'Pizza' : 'Flower';
        setMessage(`${icon} collected (${relics.filter((r) => r.taken).length}/${relics.length})`);
      }
    }
  }

  function checkGoal() {
    if (state !== 'running') return;

    const distToGoal = Math.hypot(goal.x - player.x, goal.y - player.y);
    if (distToGoal > 0.55) return;

    const gotRelics = relics.filter((r) => r.taken).length;
    if (gotRelics < relics.length) {
      setMessage(`Goal locked: ${relics.length - gotRelics} relic(s) remaining.`);
      return;
    }

    if (!traversedWater || !traversedTree) {
      if (!traversedWater && !traversedTree) setMessage('Goal locked: pass both water and tree route.');
      else if (!traversedWater) setMessage('Goal locked: water route required.');
      else setMessage('Goal locked: tree route required.');
      return;
    }

    if (kills < KILLS_TO_WIN) {
      setMessage(`Goal blocked: defeat ${KILLS_TO_WIN - kills} more enemy(ies).`);
      return;
    }

    state = 'victory';
    if (ui.overlay) {
      ui.overlay.classList.remove('is-hidden');
      ui.overlay.classList.add('victory');
      ui.overlay.textContent = `STAGE CLEAR!\nLuisa and Sia have been together for 3 months~\nTime ${formatTime(elapsed)} 路 Press R to replay`;
    }
    setMessage('Victory! Celebration unlocked.', 99);
    triggerCelebration();
  }

  function updateHud() {
    const relicCount = relics.filter((r) => r.taken).length;
    if (ui.hp) ui.hp.textContent = String(Math.max(0, player.hp));
    if (ui.relics) ui.relics.textContent = `${relicCount} / ${relics.length}`;
    if (ui.kills) ui.kills.textContent = `${kills} / ${KILLS_TO_WIN}`;
    if (ui.mode) {
      if (player.mode === 'ferry') ui.mode.textContent = 'Duck Carry';
      else if (player.mode === 'carry') ui.mode.textContent = 'Raccoon Carry';
      else ui.mode.textContent = 'Ground';
    }
    if (ui.time) ui.time.textContent = formatTime(elapsed);
  }

  function tileSeed(x, y) {
    return (((x * 73856093) ^ (y * 19349663)) >>> 0);
  }

  function drawStar(cx, cy, outerR, innerR, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawMap(time, palette, tileSize, offsetX, offsetY) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = tileAt(x, y);
        const px = offsetX + x * tileSize;
        const py = offsetY + y * tileSize;
        const seed = tileSeed(x, y);

        if (tile === '#') {
          ctx.fillStyle = palette.wall;
          ctx.fillRect(px, py, tileSize, tileSize);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px, py, tileSize, 2);
          ctx.fillRect(px, py, 2, tileSize);
          ctx.strokeStyle = palette.wallEdge;
          ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
          if (seed % 3 === 0) {
            ctx.fillStyle = 'rgba(110, 154, 176, 0.18)';
            ctx.fillRect(px + 5, py + 7, 4, 3);
            ctx.fillRect(px + 12, py + 14, 3, 3);
          }
        } else if (tile === '~') {
          ctx.fillStyle = palette.water;
          ctx.fillRect(px, py, tileSize, tileSize);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(px, py + 2, tileSize, 2);
          ctx.strokeStyle = palette.waterWave;
          const wave = Math.sin(time * 0.006 + x * 0.75 + y * 0.55) * 2.5;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + tileSize * 0.52 + wave * 0.3);
          ctx.lineTo(px + tileSize - 3, py + tileSize * 0.45 - wave * 0.3);
          ctx.stroke();
        } else if (tile === 'T') {
          ctx.fillStyle = palette.floor;
          ctx.fillRect(px, py, tileSize, tileSize);
          ctx.fillStyle = '#6b8a58';
          ctx.fillRect(px + tileSize * 0.28, py + 2, tileSize * 0.44, tileSize * 0.28);
          ctx.fillStyle = palette.tree;
          ctx.fillRect(px + tileSize * 0.4, py + tileSize * 0.2, tileSize * 0.2, tileSize * 0.76);
          ctx.fillStyle = '#547143';
          ctx.fillRect(px + tileSize * 0.46, py + tileSize * 0.3, tileSize * 0.08, tileSize * 0.54);
        } else if (tile === 'D') {
          ctx.fillStyle = palette.dock;
          ctx.fillRect(px, py, tileSize, tileSize);
          ctx.strokeStyle = '#d6bf95';
          ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
          ctx.fillStyle = 'rgba(75, 51, 28, 0.5)';
          ctx.fillRect(px + tileSize * 0.2, py + 4, 2, tileSize - 8);
          ctx.fillRect(px + tileSize * 0.5, py + 4, 2, tileSize - 8);
          ctx.fillRect(px + tileSize * 0.8, py + 4, 2, tileSize - 8);
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? palette.floor : palette.floor2;
          ctx.fillRect(px, py, tileSize, tileSize);
          if (seed % 5 === 0) {
            ctx.fillStyle = 'rgba(110, 180, 123, 0.35)';
            ctx.fillRect(px + 6, py + 16, 2, 5);
            ctx.fillRect(px + 9, py + 14, 2, 7);
          } else if (seed % 5 === 1) {
            ctx.fillStyle = 'rgba(190, 202, 176, 0.4)';
            ctx.fillRect(px + 11, py + 11, 3, 3);
            ctx.fillRect(px + 17, py + 19, 2, 2);
          }
        }
      }
    }
  }

  function drawPizza(cx, cy, size) {
    ctx.fillStyle = '#f0c47a';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e45f58';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.16, cy - size * 0.1);
    ctx.lineTo(cx + size * 0.14, cy - size * 0.02);
    ctx.lineTo(cx - size * 0.03, cy + size * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f4e8cf';
    ctx.fillRect(cx - size * 0.2, cy - size * 0.12, size * 0.08, size * 0.04);
  }

  function drawFlower(cx, cy, size) {
    ctx.fillStyle = '#f19ab3';
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const px = cx + Math.cos(a) * size * 0.14;
      const py = cy + Math.sin(a) * size * 0.14;
      ctx.beginPath();
      ctx.arc(px, py, size * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f8d96d';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRelics(tileSize, offsetX, offsetY) {
    for (const relic of relics) {
      if (relic.taken) continue;
      const cx = offsetX + relic.x * tileSize;
      const cy = offsetY + relic.y * tileSize;
      if (relic.type === 'pizza') drawPizza(cx, cy, tileSize);
      else drawFlower(cx, cy, tileSize);
    }
  }

  function drawGoal(palette, tileSize, offsetX, offsetY) {
    const cx = offsetX + goal.x * tileSize;
    const cy = offsetY + goal.y * tileSize;
    drawStar(cx, cy, tileSize * 0.32, tileSize * 0.15, palette.goal);
    ctx.strokeStyle = palette.goal;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawEnemies(palette, tileSize, offsetX, offsetY) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const x = offsetX + enemy.x * tileSize;
      const y = offsetY + enemy.y * tileSize;

      if (enemy.type === 'slime') {
        ctx.fillStyle = '#5cb989';
        ctx.beginPath();
        ctx.ellipse(x, y + tileSize * 0.08, tileSize * 0.28, tileSize * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#83d8a8';
        ctx.beginPath();
        ctx.ellipse(x, y + tileSize * 0.02, tileSize * 0.2, tileSize * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (enemy.type === 'mushling') {
        ctx.fillStyle = '#d66f61';
        ctx.beginPath();
        ctx.ellipse(x, y - tileSize * 0.03, tileSize * 0.3, tileSize * 0.18, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#efe3ca';
        ctx.fillRect(x - tileSize * 0.1, y - tileSize * 0.02, tileSize * 0.2, tileSize * 0.22);
      } else if (enemy.type === 'boar') {
        ctx.fillStyle = '#8f5d49';
        ctx.beginPath();
        ctx.ellipse(x, y + tileSize * 0.05, tileSize * 0.3, tileSize * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f1d8b9';
        ctx.fillRect(x + tileSize * 0.15, y + tileSize * 0.02, tileSize * 0.1, tileSize * 0.04);
        ctx.fillRect(x - tileSize * 0.25, y + tileSize * 0.02, tileSize * 0.1, tileSize * 0.04);
      } else {
        ctx.fillStyle = '#6f7bd8';
        ctx.beginPath();
        ctx.ellipse(x, y - tileSize * 0.02, tileSize * 0.16, tileSize * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8994ef';
        ctx.beginPath();
        ctx.moveTo(x, y - tileSize * 0.32);
        ctx.lineTo(x - tileSize * 0.22, y - tileSize * 0.1);
        ctx.lineTo(x + tileSize * 0.22, y - tileSize * 0.1);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(x - tileSize * 0.28, y - tileSize * 0.45, tileSize * 0.56, 5);
      ctx.fillStyle = palette.hp;
      ctx.fillRect(x - tileSize * 0.28, y - tileSize * 0.45, (tileSize * 0.56 * enemy.hp) / enemy.maxHp, 5);
    }
  }

  function drawDuckSprite(x, y, tileSize, options = {}) {
    const scale = options.scale ?? 1;
    const showBackHead = options.showBackHead ?? false;
    const bodyRx = tileSize * 0.28 * scale;
    const bodyRy = tileSize * 0.2 * scale;
    const headR = tileSize * 0.14 * scale;

    if (showBackHead) {
      ctx.fillStyle = '#d8b651';
      ctx.beginPath();
      ctx.ellipse(x, y - tileSize * 0.17 * scale, headR * 0.96, headR * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e6c45a';
      ctx.beginPath();
      ctx.ellipse(x, y - tileSize * 0.08 * scale, headR * 0.42, headR * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#de975e';
      ctx.beginPath();
      ctx.moveTo(x - tileSize * 0.06 * scale, y - tileSize * 0.17 * scale);
      ctx.lineTo(x + tileSize * 0.06 * scale, y - tileSize * 0.17 * scale);
      ctx.lineTo(x, y - tileSize * 0.11 * scale);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#ddb84f';
    ctx.beginPath();
    ctx.ellipse(x, y + tileSize * 0.07 * scale, bodyRx, bodyRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2dc75';
    ctx.beginPath();
    ctx.ellipse(x, y + tileSize * 0.02 * scale, bodyRx * 0.92, bodyRy * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e7a069';
    ctx.beginPath();
    ctx.moveTo(x - tileSize * 0.12 * scale, y - tileSize * 0.05 * scale);
    ctx.quadraticCurveTo(x, y - tileSize * 0.15 * scale, x + tileSize * 0.12 * scale, y - tileSize * 0.05 * scale);
    ctx.quadraticCurveTo(x, y + tileSize * 0.02 * scale, x - tileSize * 0.12 * scale, y - tileSize * 0.05 * scale);
    ctx.fill();

    ctx.fillStyle = '#262621';
    ctx.beginPath();
    ctx.arc(x - tileSize * 0.055 * scale, y - tileSize * 0.11 * scale, tileSize * 0.026 * scale, 0, Math.PI * 2);
    ctx.arc(x + tileSize * 0.055 * scale, y - tileSize * 0.11 * scale, tileSize * 0.026 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRaccoonSprite(x, y, tileSize, options = {}) {
    const scale = options.scale ?? 1;
    const flash = options.flash ?? false;
    const bodyColor = flash ? '#efe7d8' : '#88867f';
    const maskColor = '#4a5150';

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(x, y, tileSize * 0.25 * scale, tileSize * 0.28 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#6f6d66';
    ctx.beginPath();
    ctx.arc(x - tileSize * 0.14 * scale, y - tileSize * 0.2 * scale, tileSize * 0.11 * scale, 0, Math.PI * 2);
    ctx.arc(x + tileSize * 0.14 * scale, y - tileSize * 0.2 * scale, tileSize * 0.11 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e9e0d0';
    ctx.beginPath();
    ctx.ellipse(x, y + tileSize * 0.02 * scale, tileSize * 0.13 * scale, tileSize * 0.17 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = maskColor;
    ctx.beginPath();
    ctx.moveTo(x - tileSize * 0.16 * scale, y - tileSize * 0.06 * scale);
    ctx.quadraticCurveTo(x, y - tileSize * 0.22 * scale, x + tileSize * 0.16 * scale, y - tileSize * 0.06 * scale);
    ctx.quadraticCurveTo(x + tileSize * 0.13 * scale, y + tileSize * 0.08 * scale, x, y + tileSize * 0.12 * scale);
    ctx.quadraticCurveTo(x - tileSize * 0.13 * scale, y + tileSize * 0.08 * scale, x - tileSize * 0.16 * scale, y - tileSize * 0.06 * scale);
    ctx.fill();

    ctx.fillStyle = '#252a29';
    ctx.beginPath();
    ctx.ellipse(x - tileSize * 0.065 * scale, y - tileSize * 0.03 * scale, tileSize * 0.045 * scale, tileSize * 0.055 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + tileSize * 0.065 * scale, y - tileSize * 0.03 * scale, tileSize * 0.045 * scale, tileSize * 0.055 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(tileSize, offsetX, offsetY) {
    const px = offsetX + player.x * tileSize;
    const py = offsetY + player.y * tileSize;
    const dx = player.facingX;
    const dy = player.facingY;
    const flash = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0;

    if (player.mode === 'ferry') {
      drawDuckSprite(px, py + tileSize * 0.03, tileSize, { scale: 1.35, showBackHead: true });
      drawRaccoonSprite(px, py - tileSize * 0.1, tileSize, { scale: 0.92, flash });
      return;
    }

    drawRaccoonSprite(px, py, tileSize, { flash });

    if (player.mode === 'carry') {
      drawDuckSprite(px, py - tileSize * 0.3, tileSize, { scale: 0.82 });
    } else {
      const dxDuck = offsetX + duck.x * tileSize;
      const dyDuck = offsetY + duck.y * tileSize;
      drawDuckSprite(dxDuck, dyDuck, tileSize, { scale: 0.84 });
    }

    if (player.attackCd > 0.35) {
      ctx.strokeStyle = '#9ce6ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx * tileSize * 0.7, py + dy * tileSize * 0.7);
      ctx.stroke();
    }
  }

  function update(dt) {
    if (state !== 'running') return;

    elapsed += dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.attackCd > 0) player.attackCd -= dt;

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) {
        setMessage('Objective: 3 relics + 4 kills + star goal.', 999);
      }
    }

    movePlayer(dt);
    const currentTile = tileAtPos(player.x, player.y);
    if (currentTile === '~') traversedWater = true;
    if (currentTile === 'T') traversedTree = true;

    updateDuck(dt);
    updateEnemies(dt);
    collectRelics();
    checkGoal();
    updateHud();
  }

  function draw(time) {
    const palette = currentPalette();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tileSize = Math.floor(Math.min(canvas.width / width, canvas.height / height));
    const drawWidth = tileSize * width;
    const drawHeight = tileSize * height;
    const offsetX = Math.floor((canvas.width - drawWidth) / 2);
    const offsetY = Math.floor((canvas.height - drawHeight) / 2);

    drawMap(time, palette, tileSize, offsetX, offsetY);
    drawGoal(palette, tileSize, offsetX, offsetY);
    drawRelics(tileSize, offsetX, offsetY);
    drawEnemies(palette, tileSize, offsetX, offsetY);
    drawPlayer(tileSize, offsetX, offsetY);

    ctx.fillStyle = palette.text;
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('STAR = Goal  |  ~ = Water (Duck Carry)  |  T = Tree Route (Raccoon Carry)', offsetX + 8, offsetY + drawHeight - 8);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  function clearMoveInputs() {
    pressed.up = false;
    pressed.down = false;
    pressed.left = false;
    pressed.right = false;
    touch.moveButtons.forEach((btn) => btn.classList.remove('active'));
  }

  function triggerAction(action) {
    if (action === 'attack') tryAttack();
    else if (action === 'ferry') tryToggleFerry();
    else if (action === 'carry') tryToggleCarry();
    else if (action === 'restart') resetGame();
  }

  function initTouchControls() {
    if (!touch.root) return;
    touch.root.addEventListener('contextmenu', (event) => event.preventDefault());

    for (const btn of touch.moveButtons) {
      const direction = btn.dataset.move;
      if (!direction) continue;

      const press = (event) => {
        event.preventDefault();
        pressed[direction] = true;
        btn.classList.add('active');
      };

      const release = (event) => {
        event.preventDefault();
        pressed[direction] = false;
        btn.classList.remove('active');
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    }

    for (const btn of touch.actionButtons) {
      const action = btn.dataset.action;
      if (!action) continue;

      btn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        btn.classList.add('active');
        triggerAction(action);
      });

      const clearState = (event) => {
        event.preventDefault();
        btn.classList.remove('active');
      };

      btn.addEventListener('pointerup', clearState);
      btn.addEventListener('pointercancel', clearState);
      btn.addEventListener('pointerleave', clearState);
    }
  }

  function onKeyDown(event) {
    const moveKey = keys[event.code];
    if (moveKey) {
      pressed[moveKey] = true;
      event.preventDefault();
      return;
    }

    if (event.repeat) return;

    if (event.code === 'Space') {
      tryAttack();
      event.preventDefault();
    } else if (event.code === 'KeyF') {
      tryToggleFerry();
      event.preventDefault();
    } else if (event.code === 'KeyQ') {
      tryToggleCarry();
      event.preventDefault();
    } else if (event.code === 'KeyR') {
      resetGame();
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const moveKey = keys[event.code];
    if (moveKey) {
      pressed[moveKey] = false;
      event.preventDefault();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearMoveInputs);
  ui.restart?.addEventListener('click', resetGame);

  initTouchControls();
  resetGame();
  requestAnimationFrame(loop);
})();
