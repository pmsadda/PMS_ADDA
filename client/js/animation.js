"use strict";

/*====================================================

PMS ADDA

ANIMATION ENGINE

Version : 1.0

====================================================*/

class AnimationEngine {

    constructor() {

        this.speed = 220;

    }

    sleep(ms) {

        return new Promise(resolve => {

            setTimeout(resolve, ms);

        });

    }

    async flyCard(fromElement, toElement) {

    if (!fromElement || !toElement) return;

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    // আসল target card আগে লুকানো থাকবে
    toElement.style.opacity = "0";

    const flyingCard = document.createElement("img");

    flyingCard.src = "../assets/cards/card-back.png";
    flyingCard.className = "flying-card";

    Object.assign(flyingCard.style, {
        position: "fixed",
        left: `${fromRect.left}px`,
        top: `${fromRect.top}px`,
        width: `${fromRect.width}px`,
        height: `${fromRect.height}px`,
        zIndex: "99999",
        pointerEvents: "none",
        transform: "translate3d(0,0,0) rotate(0deg)",
        transition:
            "left 380ms ease-in-out, top 380ms ease-in-out, width 380ms ease-in-out, height 380ms ease-in-out, transform 380ms ease-in-out"
    });

    document.body.appendChild(flyingCard);

    // Browser-কে initial position render করার সময় দাও
    await this.sleep(30);

    flyingCard.style.left = `${toRect.left}px`;
    flyingCard.style.top = `${toRect.top}px`;
    flyingCard.style.width = `${toRect.width}px`;
    flyingCard.style.height = `${toRect.height}px`;
    flyingCard.style.transform =
        "translate3d(0,0,0) rotate(180deg)";

    // একটি card পৌঁছানো পর্যন্ত অপেক্ষা
    await this.sleep(400);

    // Target player-এর card দেখাবে
    toElement.style.opacity = "1";

    flyingCard.remove();

    // পরের card যাওয়ার আগে ছোট gap
    await this.sleep(80);
  }

  async flyChips(fromElement, toElement, amount = 1) {

    if (!fromElement || !toElement) return;

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();

    const chipCount = Math.min(
        Math.max(Math.ceil(amount / 10), 1),
        5
    );

    const animations = [];

    for (let index = 0; index < chipCount; index++) {

        animations.push(
            this.flySingleChip(
                fromRect,
                toRect,
                index
            )
        );

        await this.sleep(60);
    }

    await Promise.all(animations);
}


flySingleChip(fromRect, toRect, index = 0) {

    return new Promise(resolve => {

        const chip = document.createElement("div");

        chip.className = "flying-chip";
        chip.textContent = "৳";

        const startX =
            fromRect.left + fromRect.width / 2 - 14;

        const startY =
            fromRect.top + fromRect.height / 2 - 14;

        const endX =
            toRect.left + toRect.width / 2 - 14;

        const endY =
            toRect.top + toRect.height / 2 - 14;

        Object.assign(chip.style, {
            position: "fixed",
            left: `${startX}px`,
            top: `${startY}px`,
            zIndex: "99999",
            pointerEvents: "none",
            transform:
                `translate3d(0,0,0) rotate(${index * 25}deg) scale(1)`,
            transition:
                "left 420ms cubic-bezier(.2,.8,.3,1)," +
                "top 420ms cubic-bezier(.2,.8,.3,1)," +
                "transform 420ms ease," +
                "opacity 420ms ease"
        });

        const layer = document.querySelector("#chipLayer") || document.body;
          layer.appendChild(chip);

        requestAnimationFrame(() => {

            chip.style.left =
                `${endX + index * 4}px`;

            chip.style.top =
                `${endY - index * 3}px`;

            chip.style.transform =
                `translate3d(0,0,0) rotate(${360 + index * 45}deg) scale(.85)`;
        });

        setTimeout(() => {

            chip.remove();
            resolve();

        }, 450);
    });
  }

}



const ANIMATION = new AnimationEngine();