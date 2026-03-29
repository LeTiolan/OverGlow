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
    lvl: document.getElementById('lvl-text')
};

// Generate 30 inventory slots visually
for(let i=0; i<30; i++) {
    document.getElementById('inv-grid').innerHTML += '<div class="slot"></div>';
}

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
    }
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

let player, projectiles, enemies, particles, texts;

class Player {
    constructor() {
        this.x = width/2; this.y = height/2; this.r = 15;
        this.speed = 250; 
        this.hp = 100; this.maxHp = 100;
        this.energy = 100; this.maxEnergy = 100;
        this.xp = 0; this.lvl = 1; this.xpNeeded = 100;
        this.shootTimer = 0; this.fireRate = 0.15;
    }
    update(dt) {
        // Movement
        let dx = 0, dy = 0;
        if(keys['w']) dy -= 1; if(keys['s']) dy += 1;
        if(keys['a']) dx -= 1; if(keys['d']) dx += 1;
        if(dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } // Normalize diagonal
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        
        // Bounds
        this.x = Math.max(this.r, Math.min(width - this.r, this.x));
        this.y = Math.max(this.r, Math.min(height - this.r, this.y));

        // Energy Regen
        if(this.energy < this.maxEnergy) this.energy += 15 * dt;

        // Shooting
        this.shootTimer -= dt;
        if(mouse.down && this.shootTimer <= 0 && this.energy >= 5) {
            this.energy -= 5;
            this.shootTimer = this.fireRate;
            let angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
            projectiles.push(new Projectile(this.x, this.y, angle));
            sfx.shoot();
        }
    }
    draw(c) {
        c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI*2);
        c.fillStyle = '#fff'; c.shadowBlur = 20; c.shadowColor = '#44ccff';
        c.fill(); c.shadowBlur = 0; // Reset
    }
    gainXp(amount) {
        this.xp += amount;
        if(this.xp >= this.xpNeeded) {
            this.lvl++; this.xp -= this.xpNeeded; this.xpNeeded *= 1.5;
            this.maxHp += 20; this.hp = this.maxHp;
            sfx.levelUp();
            spawnText(this.x, this.y - 30, "LEVEL UP!", "#ffcc00", 24);
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
            player.hp -= 10;
            spawnParticles(player.x, player.y, '#ff4444', 10);
            shake(0.2);
            enemies.splice(i, 1);
            if(player.hp <= 0) gameOver();
        }
    }

    // Visual FX Updates
    particles.forEach((p, i) => { p.update(dt); if(p.life <= 0) particles.splice(i,1); });
    texts.forEach((t, i) => { t.update(dt); if(t.life <= 0) texts.splice(i,1); });

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

    projectiles.forEach(p => p.draw(ctx));
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

function startGame() {
    initAudio();
    player = new Player();
    projectiles = []; enemies = []; particles = []; texts = [];
    score = 0; gameTime = 0; lastTime = performance.now();
    gameState = 'playing';
    dom.start.classList.add('hidden');
    dom.over.classList.add('hidden');
    dom.hud.classList.remove('hidden');
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
