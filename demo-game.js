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

  const RAW_MAP = [
    '##############################',
    '#S..###########.....####...G##',
    '#..R###########.###.####.#####',
    '#.#############.###..E##....##',
    '#.#############.###.#######..#',
    '#..#E##########.R##.########.#',
    '##.#.##############...######.#',
    '##...#######~~~~~~~~~.###....#',
    '#..#########D~~~~~~~D.R#..####',
    '#.##########~~~~~~~~~.##.#####',
    '#.###############E###.##.#####',
    '#..##############.###.#..#####',
    '##.#############T.#.....######',
    '#..#############T##.##########',
    '#.##############T#....##.E####',
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
      relic: '#ffd979',
      goal: '#7bf2e2',
      enemy: '#b96263',
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
      relic: '#e8a761',
      goal: '#6ea08d',
      enemy: '#a45d58',
      hp: '#c55f5f',
      text: '#2f302f'
    }
  };


  function setMessage(text, time = 2.1) {
    if (ui.objective) ui.objective.textContent = text;
    messageTimer = time;
  }


  function formatTime(total) {
    const sec = Math.floor(total);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }


  function clearMoveInputs() {
    pressed.up = false;
    pressed.down = false;
    pressed.left = false;
    pressed.right = false;
    touch.moveButtons.forEach((btn) => btn.classList.remove('active'));
  }

  function triggerAction(action) {
    if (action === 'attack') {
      tryAttack();
    } else if (action === 'ferry') {
      tryToggleFerry();
    } else if (action === 'carry') {
      tryToggleCarry();
    } else if (action === 'restart') {
      resetGame();
    }
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

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return '#';
    return map[ty][tx];
  }

  function tileAtPos(x, y) {
    return tileAt(Math.floor(x), Math.floor(y));
  }

  function passable(tile, mode) {
    if (tile === '#') return false;
    if (mode === 'ferry') return tile === '~' || tile === 'D';
    if (tile === '~') return false;
    if (tile === 'T' && mode !== 'carry') return false;
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
      if (t !== '#' && t !== '~') {
        points.push({ x: nx + 0.5, y: ny + 0.5 });
        if (points.length >= 3) break;
      }
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

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const c = map[y][x];
        if (c === 'S') {
          player.x = x + 0.5;
          player.y = y + 0.5;
          map[y][x] = '.';
        } else if (c === 'R') {
          relics.push({ x: x + 0.5, y: y + 0.5, taken: false });
          map[y][x] = '.';
        } else if (c === 'r') {
          relics.push({ x: x + 0.5, y: y + 0.5, taken: false });
          map[y][x] = '~';
        } else if (c === 'E') {
          const hx = x + 0.5;
          const hy = y + 0.5;
          const profile = ENEMY_ARCHETYPES[enemyTypeIndex % ENEMY_ARCHETYPES.length];
          enemyTypeIndex += 1;

          enemies.push({
            x: hx,
            y: hy,
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

    duck.x = player.x - 0.42;
    duck.y = player.y;
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
    setMessage('探索开始：操控 Luisa Z 与 Sia Z，收集遗物并推进到信标 G。', 3);
    if (ui.overlay) {
      ui.overlay.classList.add('is-hidden');
      ui.overlay.textContent = '';
    }
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

    const speed = player.mode === 'ferry' ? 3.05 : player.mode === 'carry' ? 2.65 : 3.2;
    const kx = player.knocks > 0 ? player.knockX * 2.4 : 0;
    const ky = player.knocks > 0 ? player.knockY * 2.4 : 0;

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
      duck.y += (player.y - duck.y) * Math.min(1, dt * 10);
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
      if (enemy.hp <= 0) continue;
      if (enemy.patrol.length <= 1) continue;

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
        setMessage('你被击中！保持移动并反击。');

        if (player.hp <= 0) {
          state = 'defeat';
          if (ui.overlay) {
            ui.overlay.classList.remove('is-hidden');
            ui.overlay.textContent = 'Mission Failed - 按 R 或按钮重新开始';
          }
        }
      }
    }
  }

  function tryAttack() {
    if (state !== 'running') return;
    if (player.mode === 'ferry') {
      setMessage('在水上无法攻击，先到码头 D 下船。');
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
      if (dot < -0.05) continue;
      if (dist < best) {
        best = dist;
        target = enemy;
      }
    }

    if (!target) {
      setMessage('挥击落空，调整站位。');
      return;
    }

    target.hp -= 1;
    if (target.hp <= 0) {
      kills += 1;
      setMessage(`击败敌人 (${kills}/${KILLS_TO_WIN})`);
    } else {
      setMessage('命中敌人，继续进攻。');
    }
  }

  function tryToggleCarry() {
    if (state !== 'running') return;
    if (player.mode === 'ferry') {
      setMessage('先在码头 D 下船，再切换背负模式。');
      return;
    }
    player.mode = player.mode === 'carry' ? 'ground' : 'carry';
    setMessage(player.mode === 'carry' ? '已进入背负模式：可通过树干 T。' : '已切换到普通地面模式。');
  }

  function tryToggleFerry() {
    if (state !== 'running') return;
    const tile = tileAtPos(player.x, player.y);

    if (player.mode === 'ferry') {
      if (tile === 'D') {
        player.mode = 'ground';
        setMessage('靠岸成功，继续推进。');
      } else {
        setMessage('需要站在码头 D 才能下船。');
      }
      return;
    }

    if (tile === 'D') {
      player.mode = 'ferry';
      setMessage('Sia Z 驮着 Luisa Z 过河中，前往水域遗物。');
      return;
    }

    setMessage('在码头 D 按 F 切换过河模式。');
  }

  function collectRelics() {
    for (const relic of relics) {
      if (relic.taken) continue;
      const dist = Math.hypot(relic.x - player.x, relic.y - player.y);
      if (dist < 0.5) {
        relic.taken = true;
        setMessage(`遗物已收集 (${relics.filter((r) => r.taken).length}/${relics.length})`);
      }
    }
  }

  function checkGoal() {
    if (state !== 'running') return;
    const distToGoal = Math.hypot(goal.x - player.x, goal.y - player.y);
    if (distToGoal > 0.55) return;

    const gotRelics = relics.filter((r) => r.taken).length;
    if (gotRelics < relics.length) {
      setMessage(`信标尚未激活：还需遗物 ${relics.length - gotRelics} 个。`);
      return;
    }

    if (kills < KILLS_TO_WIN) {
      setMessage(`信标检测到敌对威胁：还需击败 ${KILLS_TO_WIN - kills} 个敌人。`);
      return;
    }

    state = 'victory';
    if (ui.overlay) {
      ui.overlay.classList.remove('is-hidden');
      ui.overlay.textContent = `Stage Clear! 用时 ${formatTime(elapsed)} · 按 R 可重玩`;
    }
    setMessage('阶段胜利：你完成了 Web Demo 任务。', 99);
  }

  function updateHud() {
    const relicCount = relics.filter((r) => r.taken).length;
    if (ui.hp) ui.hp.textContent = String(Math.max(0, player.hp));
    if (ui.relics) ui.relics.textContent = `${relicCount} / ${relics.length}`;
    if (ui.kills) ui.kills.textContent = `${kills} / ${KILLS_TO_WIN}`;
    if (ui.mode) {
      ui.mode.textContent = player.mode === 'ferry' ? 'Duck Ferry' : player.mode === 'carry' ? 'Carry Duck' : 'Ground';
    }
    if (ui.time) ui.time.textContent = formatTime(elapsed);
  }

  function tileSeed(x, y) {
    return (((x * 73856093) ^ (y * 19349663)) >>> 0);
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

          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(px, py + 2, tileSize, 2);

          ctx.strokeStyle = palette.waterWave;
          const wave = Math.sin(time * 0.006 + x * 0.75 + y * 0.55) * 2.5;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + tileSize * 0.52 + wave * 0.3);
          ctx.lineTo(px + tileSize - 3, py + tileSize * 0.45 - wave * 0.3);
          ctx.stroke();

          if (seed % 4 === 0) {
            ctx.fillStyle = 'rgba(200, 243, 255, 0.3)';
            ctx.fillRect(px + 9, py + 10, 3, 2);
          }
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

          if (seed % 11 === 0) {
            ctx.fillStyle = 'rgba(209, 164, 112, 0.32)';
            ctx.fillRect(px + 18, py + 8, 3, 3);
          }
        }
      }
    }
  }

  function drawRelics(palette, tileSize, offsetX, offsetY) {
    for (const relic of relics) {
      if (relic.taken) continue;
      const cx = offsetX + relic.x * tileSize;
      const cy = offsetY + relic.y * tileSize;
      ctx.fillStyle = palette.relic;
      ctx.beginPath();
      ctx.moveTo(cx, cy - tileSize * 0.25);
      ctx.lineTo(cx + tileSize * 0.18, cy);
      ctx.lineTo(cx, cy + tileSize * 0.25);
      ctx.lineTo(cx - tileSize * 0.18, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGoal(palette, tileSize, offsetX, offsetY) {
    const cx = offsetX + goal.x * tileSize;
    const cy = offsetY + goal.y * tileSize;
    ctx.fillStyle = palette.goal;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.goal;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.42, 0, Math.PI * 2);
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - tileSize * 0.17, y - tileSize * 0.06, 3, 3);
        ctx.fillRect(x + tileSize * 0.11, y - tileSize * 0.08, 3, 3);
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
    const bodyRx = tileSize * 0.28 * scale;
    const bodyRy = tileSize * 0.2 * scale;
    const headR = tileSize * 0.14 * scale;

    ctx.fillStyle = '#ddb84f';
    ctx.beginPath();
    ctx.ellipse(x, y + tileSize * 0.07 * scale, bodyRx, bodyRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f2dc75';
    ctx.beginPath();
    ctx.ellipse(x, y + tileSize * 0.02 * scale, bodyRx * 0.92, bodyRy * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f4e38a';
    ctx.beginPath();
    ctx.arc(x, y - tileSize * 0.08 * scale, headR, 0, Math.PI * 2);
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

    ctx.strokeStyle = '#6f6e67';
    ctx.lineWidth = tileSize * 0.06 * scale;
    ctx.beginPath();
    ctx.moveTo(x + tileSize * 0.19 * scale, y + tileSize * 0.05 * scale);
    ctx.quadraticCurveTo(x + tileSize * 0.35 * scale, y + tileSize * 0.17 * scale, x + tileSize * 0.22 * scale, y + tileSize * 0.3 * scale);
    ctx.stroke();

    ctx.strokeStyle = '#e7ddcc';
    ctx.lineWidth = tileSize * 0.032 * scale;
    ctx.beginPath();
    ctx.moveTo(x + tileSize * 0.2 * scale, y + tileSize * 0.08 * scale);
    ctx.quadraticCurveTo(x + tileSize * 0.3 * scale, y + tileSize * 0.17 * scale, x + tileSize * 0.23 * scale, y + tileSize * 0.27 * scale);
    ctx.stroke();

    ctx.strokeStyle = '#6f6e67';
    ctx.lineWidth = tileSize * 0.018 * scale;
    ctx.beginPath();
    ctx.moveTo(x + tileSize * 0.255 * scale, y + tileSize * 0.13 * scale);
    ctx.lineTo(x + tileSize * 0.29 * scale, y + tileSize * 0.165 * scale);
    ctx.moveTo(x + tileSize * 0.265 * scale, y + tileSize * 0.2 * scale);
    ctx.lineTo(x + tileSize * 0.295 * scale, y + tileSize * 0.23 * scale);
    ctx.stroke();
  }

  function drawPlayer(tileSize, offsetX, offsetY) {
    const px = offsetX + player.x * tileSize;
    const py = offsetY + player.y * tileSize;
    const dx = player.facingX;
    const dy = player.facingY;
    const flash = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0;

    if (player.mode === 'ferry') {
      drawDuckSprite(px, py + tileSize * 0.03, tileSize, { scale: 1.35 });
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
        setMessage('目标：3 遗物 + 4 击杀，最后抵达 G。', 999);
      }
    }

    movePlayer(dt);
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
    drawRelics(palette, tileSize, offsetX, offsetY);
    drawEnemies(palette, tileSize, offsetX, offsetY);
    drawPlayer(tileSize, offsetX, offsetY);

    ctx.fillStyle = palette.text;
    ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText('D = Dock  |  T = Tree route  |  G = Beacon goal', offsetX + 8, offsetY + drawHeight - 8);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
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



























