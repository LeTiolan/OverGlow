/**
 * CORE ENGINE SETUP
 */
const bgCanvas = document.getElementById('bgCanvas');
const gameCanvas = document.getElementById('gameCanvas');
const fxCanvas = document.getElementById('fxCanvas');
const bgCtx = bgCanvas.getContext('2d');
const ctx = gameCanvas.getContext('2d');
const fxCtx = fxCanvas.getContext('2d');

let width, height;
function resize() {
    width = window.innerWidth; height = window.innerHeight;
    bgCanvas.width = gameCanvas.width = fxCanvas.width = width;
    bgCanvas.height = gameCanvas.height = fxCanvas.height = height;
    drawBackground();
}
window.addEventListener('resize', resize);
resize();

// UI Elements
const dom = {
    start: document.getElementById('start-screen'),
    hud: document.getElementById('hud-top'),
    over: document.getElementById('game-over'),
    inv: document.getElementById('inventory-panel'),
    hpBar: document.getElementById('hp-bar'),
    enBar: document.getElementById('en-bar'),
    xpBar: document.getElementById('xp-bar'),
   score: document.getElementById('score-text'),
    time: document.getElementById('time-text'),
    lvl: document.getElementById('lvl-text'),
    abBar: document.getElementById('abilities-bar'),
    cdDash: document.getElementById('cd-dash'),
    cdNova: document.getElementById('cd-nova'),
    cdShield: document.getElementById('cd-shield')
};

// Generate 30 inventory slots visually
for(let i=0; i<30; i++) {
    document.getElementById('inv-grid').innerHTML += '<div class="slot"></div>';
}

let novas = [];

/**
 * PROCEDURAL AUDIO (Web Audio API)
 */
let audioCtx;
const sfx = {
    shoot: () => playTone(300, 'square', 0.1, 0.02, -1000),
    hit: () => playTone(150, 'sawtooth', 0.1, 0.05, -500),
    kill: () => playTone(800, 'sine', 0.2, 0.05, 500),
    levelUp: () => { 
        playTone(400, 'sine', 0.2, 0.05, 400); 
        setTimeout(()=>playTone(600, 'sine', 0.4, 0.05, 600), 100); 
    },
    dash: () => playTone(500, 'sine', 0.1, 0.05, -200),
    nova: () => playTone(100, 'square', 0.3, 0.1, -50),
    shield: () => playTone(600, 'triangle', 0.2, 0.05, 200)
};

function initAudio() {
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol, slide = 0) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if(slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + duration);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}

/**
 * INPUT HANDLING
 */
const keys = {};
const mouse = { x: width/2, y: height/2, down: false };
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if(e.key.toLowerCase() === 'i' && gameState === 'playing') {
        dom.inv.classList.toggle('hidden');
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', () => mouse.down = true);
window.addEventListener('mouseup', () => mouse.down = false);

/**
 * GAME STATE & ENTITIES
 */
let gameState = 'start'; // start, playing, gameover
let lastTime = 0;
let gameTime = 0;
let score = 0;
let shakeTime = 0;

let player, projectiles, enemies, particles, texts, drops;

class Player {
    constructor() {
        this.x = width/2; this.y = height/2; this.r = 15;
        this.speed = 250; 
        this.hp = 100; this.maxHp = 100;
        this.energy = 100; this.maxEnergy = 100;
        this.xp = 0; this.lvl = 1; this.xpNeeded = 100;
        this.shootTimer = 0; this.fireRate = 0.15;
        
        // Ability Variables
        this.dashCd = 0; this.maxDashCd = 2;
        this.novaCd = 0; this.maxNovaCd = 5;
        this.shieldCd = 0; this.maxShieldCd = 8;
        this.shieldTime = 0; 
        this.inventory = [];
        this.maxInventory = 30;
    }
    update(dt) {
        if(this.dashCd > 0) this.dashCd -= dt;
        if(this.novaCd > 0) this.novaCd -= dt;
        if(this.shieldCd > 0) this.shieldCd -= dt;
        if(this.shieldTime > 0) this.shieldTime -= dt;

        let dx = 0, dy = 0;
        if(keys['w']) dy -= 1; if(keys['s']) dy += 1;
        if(keys['a']) dx -= 1; if(keys['d']) dx += 1;
        if(dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } 
        
        let currentSpeed = this.speed;
        if(keys[' '] && this.dashCd <= 0 && this.energy >= 15) {
            this.energy -= 15; this.dashCd = this.maxDashCd;
            sfx.dash(); spawnParticles(this.x, this.y, '#44ccff', 10);
            this.x += dx * 150; this.y += dy * 150; 
        }
        
        if(keys['q'] && this.novaCd <= 0 && this.energy >= 30) {
            this.energy -= 30; this.novaCd = this.maxNovaCd;
            sfx.nova(); shake(0.2);
            novas.push({x: this.x, y: this.y, r: 15, life: 0.3, maxLife: 0.3});
            
            enemies.forEach(e => {
                if(Math.hypot(this.x - e.x, this.y - e.y) < 150) {
                    e.hp -= 50;
                    spawnParticles(e.x, e.y, '#fff', 5);
                    spawnText(e.x, e.y, 50, '#44ccff', 20);
                }
            });
        }
        
        if(keys['e'] && this.shieldCd <= 0 && this.energy >= 40) {
            this.energy -= 40; this.shieldCd = this.maxShieldCd;
            this.shieldTime = 3; 
            sfx.shield();
        }

        this.x += dx * currentSpeed * dt;
        this.y += dy * currentSpeed * dt;
        
        this.x = Math.max(this.r, Math.min(width - this.r, this.x));
        this.y = Math.max(this.r, Math.min(height - this.r, this.y));
        if(this.energy < this.maxEnergy) this.energy += 15 * dt;

        this.shootTimer -= dt;
        if(mouse.down && this.shootTimer <= 0 && this.energy >= 5) {
            this.energy -= 5; this.shootTimer = this.fireRate;
            let angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
            projectiles.push(new Projectile(this.x, this.y, angle));
            sfx.shoot();
        }
    }
    draw(c) {
        if(this.shieldTime > 0) {
            c.beginPath(); c.arc(this.x, this.y, this.r + 10 + Math.sin(gameTime*10)*2, 0, Math.PI*2);
            c.strokeStyle = 'rgba(68, 204, 255, 0.8)'; c.lineWidth = 3; c.shadowBlur = 10; c.shadowColor = '#44ccff';
            c.stroke(); c.shadowBlur = 0;
        }
        c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI*2);
        c.fillStyle = '#fff'; c.shadowBlur = 20; c.shadowColor = '#44ccff';
        c.fill(); c.shadowBlur = 0; 
    }
    gainXp(amount) {
        this.xp += amount;
        if(this.xp >= this.xpNeeded) {
            this.lvl++; this.xp -= this.xpNeeded; this.xpNeeded *= 1.5;
            this.maxHp += 20; this.hp = this.maxHp;
            sfx.levelUp(); spawnText(this.x, this.y - 30, "LEVEL UP!", "#ffcc00", 24);
        }
    }
}
class Projectile {
    constructor(x, y, angle) {
        this.x = x; this.y = y; this.r = 4;
        this.vx = Math.cos(angle) * 800; this.vy = Math.sin(angle) * 800;
        this.life = 2; // seconds
        this.damage = 25;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; }
    draw(c) {
        c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI*2);
        c.fillStyle = '#fff'; c.shadowBlur = 10; c.shadowColor = '#ffffaa';
        c.fill(); c.shadowBlur = 0;
    }
}

class Enemy {
    constructor(type) {
        // Spawn at edges
        if(Math.random() < 0.5) {
            this.x = Math.random() < 0.5 ? -30 : width + 30;
            this.y = Math.random() * height;
        } else {
            this.x = Math.random() * width;
            this.y = Math.random() < 0.5 ? -30 : height + 30;
        }
        
        this.type = type;
        if(type === 'basic') { this.r = 12; this.hp = 50; this.speed = 100; this.color = '#ff4444'; }
        else if(type === 'fast') { this.r = 8; this.hp = 20; this.speed = 220; this.color = '#ff00ff'; }
        else if(type === 'tank') { this.r = 25; this.hp = 200; this.speed = 40; this.color = '#ff8800'; }
    }
    update(dt) {
        let angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * this.speed * dt;
        this.y += Math.sin(angle) * this.speed * dt;
    }
    draw(c) {
        c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI*2);
        c.fillStyle = this.color; c.shadowBlur = 15; c.shadowColor = this.color;
        c.fill(); c.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        let a = Math.random() * Math.PI*2;
        let s = Math.random() * 150 + 50;
        this.vx = Math.cos(a)*s; this.vy = Math.sin(a)*s;
        this.life = 1; this.maxLife = 1; this.color = color;
    }
    update(dt) { this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt; }
    draw(c) {
        c.globalAlpha = Math.max(0, this.life / this.maxLife);
        c.fillStyle = this.color; c.fillRect(this.x, this.y, 3, 3);
        c.globalAlpha = 1;
    }
}

class FloatingText {
    constructor(x, y, text, color, size=16) {
        this.x = x + (Math.random()*20-10); this.y = y;
        this.text = text; this.color = color; this.size = size;
        this.life = 1; this.vy = -50;
    }
    update(dt) { this.y += this.vy * dt; this.life -= dt; }
    draw(c) {
        c.globalAlpha = Math.max(0, this.life);
        c.fillStyle = this.color; c.font = `bold ${this.size}px Arial`;
        c.shadowBlur = 5; c.shadowColor = this.color;
        c.fillText(this.text, this.x, this.y);
        c.globalAlpha = 1; c.shadowBlur = 0;
    }
}
class Drop {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.r = 6;
        this.type = type; // 'health', 'energy', 'core'
        this.life = 10; // Disappears after 10 seconds
        this.color = type === 'health' ? '#ff4444' : type === 'energy' ? '#44ccff' : '#ffcc00';
    }
    update(dt) { this.life -= dt; }
    draw(c) {
        c.globalAlpha = Math.max(0, this.life / 10);
        c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI*2);
        c.fillStyle = this.color; c.shadowBlur = 10; c.shadowColor = this.color;
        c.fill(); c.shadowBlur = 0; c.globalAlpha = 1;
    }
}

/**
 * SYSTEMS & LOGIC
 */
function spawnParticles(x, y, color, count) {
    for(let i=0; i<count; i++) particles.push(new Particle(x, y, color));
}
function spawnText(x, y, text, color, size) {
    texts.push(new FloatingText(x, y, text, color, size));
}
function shake(duration) { shakeTime = duration; }

function drawBackground() {
    bgCtx.fillStyle = '#050510'; bgCtx.fillRect(0,0,width,height);
    bgCtx.fillStyle = '#fff';
    for(let i=0; i<100; i++) {
        bgCtx.globalAlpha = Math.random() * 0.5;
        bgCtx.beginPath();
        bgCtx.arc(Math.random()*width, Math.random()*height, Math.random()*2, 0, Math.PI*2);
        bgCtx.fill();
    }
    bgCtx.globalAlpha = 1;
}

let enemySpawnTimer = 0;
function updateGame(dt) {
    gameTime += dt;
    player.update(dt);
    
    // Wave Spawning Logic (Escalates over time)
    enemySpawnTimer -= dt;
    if(enemySpawnTimer <= 0) {
        enemySpawnTimer = Math.max(0.2, 1.5 - (gameTime * 0.01)); // gets faster
        let roll = Math.random();
        let type = 'basic';
        if(gameTime > 15 && roll < 0.3) type = 'fast';
        if(gameTime > 30 && roll > 0.8) type = 'tank';
        enemies.push(new Enemy(type));
    }

    // Projectile updates
    for(let i = projectiles.length-1; i>=0; i--) {
        let p = projectiles[i];
        p.update(dt);
        if(p.life <= 0 || p.x<0 || p.x>width || p.y<0 || p.y>height) {
            projectiles.splice(i, 1); continue;
        }
        // Collision with enemies
        for(let j = enemies.length-1; j>=0; j--) {
            let e = enemies[j];
            let dist = Math.hypot(p.x - e.x, p.y - e.y);
            if(dist < p.r + e.r) {
                e.hp -= p.damage;
                spawnParticles(p.x, p.y, '#fff', 5);
                spawnText(e.x, e.y, p.damage, '#fff');
                sfx.hit();
                projectiles.splice(i, 1);
                
             if(e.hp <= 0) {
                    spawnParticles(e.x, e.y, e.color, 15);
                    score += (e.type === 'tank' ? 50 : e.type === 'fast' ? 20 : 10);
                    player.gainXp(e.type === 'tank' ? 40 : 15);
                    sfx.kill();
                    
                    // 30% chance to drop loot on death
                    if(Math.random() < 0.3) {
                        let dropType = Math.random() < 0.4 ? 'health' : (Math.random() < 0.8 ? 'energy' : 'core');
                        drops.push(new Drop(e.x, e.y, dropType));
                    }
                    
                    enemies.splice(j, 1);
                    shake(0.05);
                }
                break;
            }
        }
    }

    // Enemy updates
    for(let i = enemies.length-1; i>=0; i--) {
        let e = enemies[i];
        e.update(dt);
        let dist = Math.hypot(player.x - e.x, player.y - e.y);
        if(dist < player.r + e.r) {
         if(player.shieldTime <= 0) {
                player.hp -= 10;
            } else {
                spawnText(player.x, player.y, "BLOCKED", "#44ccff");
            }
            spawnParticles(player.x, player.y, '#ff4444', 10);
            shake(0.2);
            enemies.splice(i, 1);
            if(player.hp <= 0) gameOver();
        }
    }
    // Loot Drop Updates
    for(let i = drops.length-1; i>=0; i--) {
        let d = drops[i];
        d.update(dt);
        if(d.life <= 0) { drops.splice(i, 1); continue; }
        
        // Pick up collision (with a slight magnet radius of 20px)
        if(Math.hypot(player.x - d.x, player.y - d.y) < player.r + d.r + 20) { 
            if(d.type === 'health') { player.hp = Math.min(player.maxHp, player.hp + 25); }
            if(d.type === 'energy') { player.energy = Math.min(player.maxEnergy, player.energy + 40); }
            if(d.type === 'core' && player.inventory.length < player.maxInventory) {
                player.inventory.push('core');
                updateInventoryUI();
            }
            spawnText(d.x, d.y, d.type === 'core' ? "CORE" : "+STAT", d.color, 16);
            playTone(800, 'sine', 0.1, 0.05, 400); // Pickup sound
            drops.splice(i, 1);
        }
    }

    // Visual FX Updates
    particles.forEach((p, i) => { p.update(dt); if(p.life <= 0) particles.splice(i,1); });
    texts.forEach((t, i) => { t.update(dt); if(t.life <= 0) texts.splice(i,1); });
    // Update Nova Rings
    for(let i = novas.length-1; i>=0; i--) {
        let n = novas[i];
        n.r += 600 * dt; n.life -= dt;
        if(n.life <= 0) novas.splice(i, 1);
    }

    updateHUD();
}

function drawGame() {
    ctx.clearRect(0, 0, width, height);
    fxCtx.clearRect(0, 0, width, height);

    // Screen Shake application
    if(shakeTime > 0) {
        let sx = (Math.random()-0.5)*10; let sy = (Math.random()-0.5)*10;
        ctx.save(); fxCtx.save();
        ctx.translate(sx, sy); fxCtx.translate(sx, sy);
    }
    novas.forEach(n => {
        ctx.globalAlpha = Math.max(0, n.life / n.maxLife);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
        ctx.strokeStyle = '#44ccff'; ctx.lineWidth = 5; ctx.shadowBlur = 15; ctx.shadowColor = '#44ccff';
        ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    });

    projectiles.forEach(p => p.draw(ctx));
    drops.forEach(d => d.draw(ctx));
    enemies.forEach(e => e.draw(ctx));
    player.draw(ctx);
    
    particles.forEach(p => p.draw(fxCtx));
    texts.forEach(t => t.draw(fxCtx));

    if(shakeTime > 0) { ctx.restore(); fxCtx.restore(); shakeTime -= 1/60; }
}

function updateHUD() {
    dom.hpBar.style.width = `${Math.max(0, (player.hp/player.maxHp)*100)}%`;
    dom.enBar.style.width = `${(player.energy/player.maxEnergy)*100}%`;
    dom.xpBar.style.width = `${(player.xp/player.xpNeeded)*100}%`;
    dom.lvl.innerText = player.lvl;
    document.getElementById('hp-text').innerText = Math.floor(Math.max(0, player.hp));
    document.getElementById('en-text').innerText = Math.floor(player.energy);
    document.getElementById('xp-text').innerText = Math.floor(player.xp);
    dom.score.innerText = score;
    
    let m = Math.floor(gameTime / 60);
    let s = Math.floor(gameTime % 60).toString().padStart(2, '0');
    dom.time.innerText = `${m}:${s}`;

    dom.cdDash.style.height = `${(player.dashCd / player.maxDashCd) * 100}%`;
    dom.cdNova.style.height = `${(player.novaCd / player.maxNovaCd) * 100}%`;
    dom.cdShield.style.height = `${(player.shieldCd / player.maxShieldCd) * 100}%`;
}

function gameLoop(timestamp) {
    if(!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // cap delta time
    lastTime = timestamp;

    if(gameState === 'playing') {
        updateGame(dt);
        drawGame();
    }
    requestAnimationFrame(gameLoop);
}
function updateInventoryUI() {
    let slots = document.querySelectorAll('#inv-grid .slot');
    slots.forEach((slot, index) => {
        if(index < player.inventory.length) {
            slot.style.backgroundColor = '#ffcc00'; // Fill slot with glowing gold
            slot.style.boxShadow = '0 0 10px #ffcc00';
        } else {
            slot.style.backgroundColor = 'rgba(0,0,0,0.5)'; // Empty slot
            slot.style.boxShadow = 'none';
        }
    });
}

function startGame() {
    initAudio();
    player = new Player();
   projectiles = []; enemies = []; particles = []; texts = []; drops = [];
    updateInventoryUI();
    score = 0; gameTime = 0; lastTime = performance.now();
    gameState = 'playing';
    dom.start.classList.add('hidden');
    dom.over.classList.add('hidden');
    dom.hud.classList.remove('hidden');
    dom.abBar.classList.remove('hidden');
}

function gameOver() {
    gameState = 'gameover';
    dom.hud.classList.add('hidden');
    dom.inv.classList.add('hidden');
    dom.over.classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
    let m = Math.floor(gameTime / 60);
    let s = Math.floor(gameTime % 60).toString().padStart(2, '0');
    document.getElementById('final-time').innerText = `${m}:${s}`;
}

// Binds
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Start Loop
requestAnimationFrame(gameLoop);
