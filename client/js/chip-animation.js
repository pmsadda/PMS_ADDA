"use strict";

/*====================================================

    PMS ADDA
    CHIP ANIMATION ENGINE V2

====================================================*/

class ChipAnimation {
  constructor() {
    this.layer = null;

    this.stack = [];

    this.maxStack = 40;

    this.chipImage = "../assets/chips/chip10.png";

    this.sound = {
      throw: new Audio("../assets/sounds/chip-throw.mp3"),

      land: new Audio("../assets/sounds/chip-land.mp3"),
    };

    this.sound.throw.volume = 0.45;
    this.sound.land.volume = 0.55;

    this.createLayer();
  }

  /*=========================================
        LAYER
    =========================================*/

  createLayer() {
    this.layer = document.getElementById("chipLayer");

    if (this.layer) return;

    this.layer = document.createElement("div");

    this.layer.id = "chipLayer";

    document.body.appendChild(this.layer);
  }

  /*=========================================
        PLAY SOUND
    =========================================*/

  play(audio) {
    try {
      const s = audio.cloneNode();

      s.volume = audio.volume;

      s.play();
    } catch (e) {}
  }

  /*=========================================
        PLAYER
    =========================================*/
  getPlayer(playerId) {
    if (typeof UI === "undefined") {
      return null;
    }

    return UI.getPlayerElement(playerId);
  }

  /*=========================================
        POT
    =========================================*/

  getPot() {
    return document.getElementById("pot");
  }

  /*=========================================
        CENTER
    =========================================*/

  center(el) {
    const r = el.getBoundingClientRect();

    return {
      x: r.left + r.width / 2,

      y: r.top + r.height / 2,
    };
  }

  /*=========================================
        CHIP
    =========================================*/

  chip() {
    const img = document.createElement("img");

    img.src = this.chipImage;

    img.className = "fly-chip";

    return img;
  }

  /*=========================================
    PLAYER → POT
=========================================*/

  flyToPot(playerId) {
    const player = this.getPlayer(playerId);

    const pot = this.getPot();

    if (!player || !pot) return;

    const from = this.center(player);

    const to = this.center(pot);

    const chip = this.chip();

    chip.style.left = from.x - 17 + "px";
    chip.style.top = from.y - 17 + "px";

    this.layer.appendChild(chip);

    this.play(this.sound.throw);

    const start = performance.now();

    const duration = 420;

    const startX = from.x - 17;
    const startY = from.y - 17;

    const endX = to.x - 17;
    const endY = to.y - 17;

    const dx = endX - startX;
    const dy = endY - startY;

    const arc = 70;

    const animate = (time) => {
      let t = (time - start) / duration;

      if (t > 1) t = 1;

      const ease = 1 - Math.pow(1 - t, 3);

      const x = startX + dx * ease;

      const y = startY + dy * ease - Math.sin(ease * Math.PI) * arc;

      chip.style.left = x + "px";
      chip.style.top = y + "px";

      chip.style.transform = "rotate(" + ease * 540 + "deg)";

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.play(this.sound.land);

        chip.remove();

        this.bouncePot();
      }
    };

    requestAnimationFrame(animate);
  }

  /*=========================================
    POT EFFECT
=========================================*/

  bouncePot() {
    const pot = this.getPot();

    if (!pot) return;

    pot.classList.remove("pot-chip-bounce");

    void pot.offsetWidth;

    pot.classList.add("pot-chip-bounce");

    setTimeout(() => {
      pot.classList.remove("pot-chip-bounce");
    }, 300);
  }
}

window.CHIP_ANIMATION = new ChipAnimation();
