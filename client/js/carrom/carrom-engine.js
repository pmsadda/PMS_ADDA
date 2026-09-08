/* ==========================================
   TPL22 CARROM CANVAS ENGINE
   Frontend Demonstration Physics
========================================== */

(() => {
  "use strict";

  const BOARD_SIZE = 1000;

  const BOARD_EDGE = 64;

  const POCKET_RADIUS = 43;

  const COIN_RADIUS = 19;

  const STRIKER_RADIUS = 27;

  const STOP_SPEED = 7;

  const MAX_FRAME_SECONDS = 0.032;

  class PMSCarromEngine {
    constructor(
      canvas,
      options = {},
    ) {
      if (
        !(canvas instanceof HTMLCanvasElement)
      ) {
        throw new Error(
          "A valid Carrom canvas is required.",
        );
      }

      this.canvas = canvas;

      this.context =
        canvas.getContext("2d");

      this.options = {
        onPocket:
          typeof options.onPocket ===
          "function"
            ? options.onPocket
            : () => {},

        onShotStart:
          typeof options.onShotStart ===
          "function"
            ? options.onShotStart
            : () => {},

        onShotComplete:
          typeof options.onShotComplete ===
          "function"
            ? options.onShotComplete
            : () => {},

        onAimChange:
          typeof options.onAimChange ===
          "function"
            ? options.onAimChange
            : () => {},
      };

      this.pockets = [
        {
          x: BOARD_EDGE,
          y: BOARD_EDGE,
        },
        {
          x:
            BOARD_SIZE -
            BOARD_EDGE,
          y: BOARD_EDGE,
        },
        {
          x: BOARD_EDGE,
          y:
            BOARD_SIZE -
            BOARD_EDGE,
        },
        {
          x:
            BOARD_SIZE -
            BOARD_EDGE,
          y:
            BOARD_SIZE -
            BOARD_EDGE,
        },
      ];

      this.coins = [];

      this.striker = null;

      this.aimPoint = {
        x: BOARD_SIZE / 2,
        y: BOARD_SIZE / 2,
      };

      this.power = 50;

      this.isAiming = false;

      this.isMovingStriker = false;

      this.shotRunning = false;

      this.shotWasMoving = false;

      this.pocketedThisShot = [];

      this.lastFrameTime = 0;

      this.animationFrameId = null;

      this.resizeObserver = null;

      this.boundPointerDown =
        this.handlePointerDown.bind(this);

      this.boundPointerMove =
        this.handlePointerMove.bind(this);

      this.boundPointerUp =
        this.handlePointerUp.bind(this);

      this.initialize();
    }

    /* ==================================
       Initialization
    ================================== */

    initialize() {
      this.createStartingPieces();

      this.bindEvents();

      this.resizeCanvas();

      if (
        typeof ResizeObserver ===
        "function"
      ) {
        this.resizeObserver =
          new ResizeObserver(() => {
            this.resizeCanvas();
          });

        this.resizeObserver.observe(
          this.canvas,
        );
      } else {
        window.addEventListener(
          "resize",
          () => {
            this.resizeCanvas();
          },
        );
      }

      this.animationFrameId =
        window.requestAnimationFrame(
          (time) => {
            this.runFrame(time);
          },
        );
    }

    createStartingPieces() {
      this.coins = [];

      const center =
        BOARD_SIZE / 2;

      this.coins.push(
        this.createBody({
          id: "queen",
          type: "queen",
          color: "#c72d42",
          x: center,
          y: center,
          radius: COIN_RADIUS,
        }),
      );

      const firstRingRadius = 42;

      for (
        let index = 0;
        index < 6;
        index += 1
      ) {
        const angle =
          -Math.PI / 2 +
          index *
            (Math.PI * 2 / 6);

        this.coins.push(
          this.createBody({
            id:
              `ring-one-${index}`,

            type:
              index % 2 === 0
                ? "white"
                : "black",

            color:
              index % 2 === 0
                ? "#f9f2d9"
                : "#182023",

            x:
              center +
              Math.cos(angle) *
                firstRingRadius,

            y:
              center +
              Math.sin(angle) *
                firstRingRadius,

            radius:
              COIN_RADIUS,
          }),
        );
      }

      const secondRingRadius = 79;

      for (
        let index = 0;
        index < 12;
        index += 1
      ) {
        const angle =
          -Math.PI / 2 +
          index *
            (Math.PI * 2 / 12);

        this.coins.push(
          this.createBody({
            id:
              `ring-two-${index}`,

            type:
              index % 2 === 0
                ? "black"
                : "white",

            color:
              index % 2 === 0
                ? "#182023"
                : "#f9f2d9",

            x:
              center +
              Math.cos(angle) *
                secondRingRadius,

            y:
              center +
              Math.sin(angle) *
                secondRingRadius,

            radius:
              COIN_RADIUS,
          }),
        );
      }

      this.striker =
        this.createBody({
          id: "striker",
          type: "striker",
          color: "#1faf86",
          x: center,
          y: 835,
          radius: STRIKER_RADIUS,
          mass: 1.55,
        });

      this.aimPoint = {
        x: center,
        y: 500,
      };

      this.pocketedThisShot = [];

      this.shotRunning = false;

      this.shotWasMoving = false;
    }

    createBody({
      id,
      type,
      color,
      x,
      y,
      radius,
      mass = 1,
    }) {
      return {
        id,
        type,
        color,

        x,
        y,

        velocityX: 0,
        velocityY: 0,

        radius,
        mass,

        pocketed: false,
      };
    }

    resetGame() {
      this.createStartingPieces();

      this.options.onAimChange(
        this.getAimState(),
      );
    }

    /* ==================================
       Canvas Size
    ================================== */

    resizeCanvas() {
      const bounds =
        this.canvas
          .getBoundingClientRect();

      const displaySize =
        Math.max(
          280,
          Math.min(
            bounds.width ||
              BOARD_SIZE,
            bounds.height ||
              bounds.width ||
              BOARD_SIZE,
          ),
        );

      const pixelRatio =
        Math.min(
          window.devicePixelRatio || 1,
          2,
        );

      const renderSize =
        Math.round(
          displaySize *
            pixelRatio,
        );

      if (
        this.canvas.width !==
          renderSize ||
        this.canvas.height !==
          renderSize
      ) {
        this.canvas.width =
          renderSize;

        this.canvas.height =
          renderSize;
      }

      this.draw();
    }

    prepareContext() {
      const scaleX =
        this.canvas.width /
        BOARD_SIZE;

      const scaleY =
        this.canvas.height /
        BOARD_SIZE;

      this.context.setTransform(
        scaleX,
        0,
        0,
        scaleY,
        0,
        0,
      );
    }

    /* ==================================
       Pointer Controls
    ================================== */

    bindEvents() {
      this.canvas.addEventListener(
        "pointerdown",
        this.boundPointerDown,
      );

      this.canvas.addEventListener(
        "pointermove",
        this.boundPointerMove,
      );

      window.addEventListener(
        "pointerup",
        this.boundPointerUp,
      );

      window.addEventListener(
        "pointercancel",
        this.boundPointerUp,
      );
    }

    getPointerPosition(event) {
      const bounds =
        this.canvas
          .getBoundingClientRect();

      return {
        x:
          (event.clientX -
            bounds.left) /
          bounds.width *
          BOARD_SIZE,

        y:
          (event.clientY -
            bounds.top) /
          bounds.height *
          BOARD_SIZE,
      };
    }

    handlePointerDown(event) {
      if (this.shotRunning) {
        return;
      }

      event.preventDefault();

      this.canvas.setPointerCapture?.(
        event.pointerId,
      );

      const point =
        this.getPointerPosition(
          event,
        );

      const strikerDistance =
        Math.hypot(
          point.x -
            this.striker.x,

          point.y -
            this.striker.y,
        );

      if (
        strikerDistance <=
        this.striker.radius * 2
      ) {
        this.isMovingStriker = true;

        this.isAiming = false;
      } else {
        this.isAiming = true;

        this.isMovingStriker = false;

        this.setAimPoint(
          point.x,
          point.y,
        );
      }
    }

    handlePointerMove(event) {
      if (
        this.shotRunning ||
        (
          !this.isAiming &&
          !this.isMovingStriker
        )
      ) {
        return;
      }

      event.preventDefault();

      const point =
        this.getPointerPosition(
          event,
        );

      if (
        this.isMovingStriker
      ) {
        this.moveStrikerTo(
          point.x,
        );

        return;
      }

      this.setAimPoint(
        point.x,
        point.y,
      );
    }

    handlePointerUp(event) {
      if (
        !this.isAiming &&
        !this.isMovingStriker
      ) {
        return;
      }

      this.canvas
        .releasePointerCapture?.(
          event.pointerId,
        );

      this.isAiming = false;

      this.isMovingStriker = false;

      this.options.onAimChange(
        this.getAimState(),
      );
    }

    moveStrikerTo(xPosition) {
      const minimumX = 235;

      const maximumX = 765;

      const safeX =
        Math.min(
          maximumX,
          Math.max(
            minimumX,
            xPosition,
          ),
        );

      const collidesWithCoin =
        this.coins.some((coin) => {
          if (coin.pocketed) {
            return false;
          }

          return (
            Math.hypot(
              coin.x - safeX,
              coin.y -
                this.striker.y,
            ) <
            coin.radius +
              this.striker.radius +
              3
          );
        });

      if (!collidesWithCoin) {
        this.striker.x = safeX;
      }

      this.options.onAimChange(
        this.getAimState(),
      );
    }

    setAimPoint(x, y) {
      const safeX =
        Math.min(
          BOARD_SIZE -
            BOARD_EDGE,
          Math.max(
            BOARD_EDGE,
            x,
          ),
        );

      const safeY =
        Math.min(
          this.striker.y - 25,
          Math.max(
            BOARD_EDGE,
            y,
          ),
        );

      this.aimPoint = {
        x: safeX,
        y: safeY,
      };

      this.options.onAimChange(
        this.getAimState(),
      );
    }

    resetAim() {
      this.aimPoint = {
        x: BOARD_SIZE / 2,
        y: BOARD_SIZE / 2,
      };

      this.options.onAimChange(
        this.getAimState(),
      );
    }

    setPower(value) {
      const power =
        Number(value);

      this.power =
        Number.isFinite(power)
          ? Math.min(
              100,
              Math.max(10, power),
            )
          : 50;
    }

    getAimState() {
      return {
        strikerX:
          this.striker.x,

        strikerY:
          this.striker.y,

        aimX:
          this.aimPoint.x,

        aimY:
          this.aimPoint.y,

        power:
          this.power,

        shotRunning:
          this.shotRunning,
      };
    }

    /* ==================================
       Strike
    ================================== */

    shoot(power = this.power) {
      if (
        this.shotRunning ||
        this.striker.pocketed
      ) {
        return false;
      }

      this.setPower(power);

      const differenceX =
        this.aimPoint.x -
        this.striker.x;

      const differenceY =
        this.aimPoint.y -
        this.striker.y;

      const length =
        Math.hypot(
          differenceX,
          differenceY,
        );

      if (length < 20) {
        return false;
      }

      const speed =
        510 +
        this.power * 12.5;

      this.striker.velocityX =
        differenceX /
        length *
        speed;

      this.striker.velocityY =
        differenceY /
        length *
        speed;

      this.shotRunning = true;

      this.shotWasMoving = true;

      this.pocketedThisShot = [];

      this.options.onShotStart({
        power:
          this.power,

        direction: {
          x:
            differenceX /
            length,

          y:
            differenceY /
            length,
        },
      });

      return true;
    }

    /* ==================================
       Physics
    ================================== */

    runFrame(time) {
      const elapsedSeconds =
        this.lastFrameTime
          ? Math.min(
              MAX_FRAME_SECONDS,
              (
                time -
                this.lastFrameTime
              ) / 1000,
            )
          : 0;

      this.lastFrameTime =
        time;

      if (elapsedSeconds > 0) {
        this.updatePhysics(
          elapsedSeconds,
        );
      }

      this.draw();

      this.animationFrameId =
        window.requestAnimationFrame(
          (nextTime) => {
            this.runFrame(
              nextTime,
            );
          },
        );
    }

    updatePhysics(deltaSeconds) {
      const bodies =
        this.getActiveBodies();

      bodies.forEach((body) => {
        body.x +=
          body.velocityX *
          deltaSeconds;

        body.y +=
          body.velocityY *
          deltaSeconds;

        const friction =
          Math.pow(
            0.982,
            deltaSeconds * 60,
          );

        body.velocityX *=
          friction;

        body.velocityY *=
          friction;

        if (
          Math.hypot(
            body.velocityX,
            body.velocityY,
          ) < STOP_SPEED
        ) {
          body.velocityX = 0;

          body.velocityY = 0;
        }

        this.checkPocket(body);

        if (!body.pocketed) {
          this.resolveWallCollision(
            body,
          );
        }
      });

      const activeAfterPocket =
        this.getActiveBodies();

      for (
        let firstIndex = 0;
        firstIndex <
        activeAfterPocket.length;
        firstIndex += 1
      ) {
        for (
          let secondIndex =
            firstIndex + 1;
          secondIndex <
          activeAfterPocket.length;
          secondIndex += 1
        ) {
          this.resolveBodyCollision(
            activeAfterPocket[
              firstIndex
            ],
            activeAfterPocket[
              secondIndex
            ],
          );
        }
      }

      if (
        this.shotRunning &&
        !this.hasMovingBodies()
      ) {
        this.completeShot();
      }
    }

    getActiveBodies() {
      return [
        ...this.coins,
        this.striker,
      ].filter(
        (body) =>
          body &&
          !body.pocketed,
      );
    }

    hasMovingBodies() {
      return this
        .getActiveBodies()
        .some(
          (body) =>
            body.velocityX !== 0 ||
            body.velocityY !== 0,
        );
    }

    resolveWallCollision(body) {
      const minimum =
        BOARD_EDGE +
        body.radius;

      const maximum =
        BOARD_SIZE -
        BOARD_EDGE -
        body.radius;

      if (body.x < minimum) {
        body.x = minimum;

        body.velocityX =
          Math.abs(
            body.velocityX,
          ) * 0.84;
      } else if (
        body.x > maximum
      ) {
        body.x = maximum;

        body.velocityX =
          -Math.abs(
            body.velocityX,
          ) * 0.84;
      }

      if (body.y < minimum) {
        body.y = minimum;

        body.velocityY =
          Math.abs(
            body.velocityY,
          ) * 0.84;
      } else if (
        body.y > maximum
      ) {
        body.y = maximum;

        body.velocityY =
          -Math.abs(
            body.velocityY,
          ) * 0.84;
      }
    }

    resolveBodyCollision(
      firstBody,
      secondBody,
    ) {
      const differenceX =
        secondBody.x -
        firstBody.x;

      const differenceY =
        secondBody.y -
        firstBody.y;

      const distance =
        Math.hypot(
          differenceX,
          differenceY,
        );

      const minimumDistance =
        firstBody.radius +
        secondBody.radius;

      if (
        distance <= 0 ||
        distance >= minimumDistance
      ) {
        return;
      }

      const normalX =
        differenceX /
        distance;

      const normalY =
        differenceY /
        distance;

      const overlap =
        minimumDistance -
        distance;

      const totalMass =
        firstBody.mass +
        secondBody.mass;

      firstBody.x -=
        normalX *
        overlap *
        (
          secondBody.mass /
          totalMass
        );

      firstBody.y -=
        normalY *
        overlap *
        (
          secondBody.mass /
          totalMass
        );

      secondBody.x +=
        normalX *
        overlap *
        (
          firstBody.mass /
          totalMass
        );

      secondBody.y +=
        normalY *
        overlap *
        (
          firstBody.mass /
          totalMass
        );

      const relativeVelocityX =
        secondBody.velocityX -
        firstBody.velocityX;

      const relativeVelocityY =
        secondBody.velocityY -
        firstBody.velocityY;

      const separatingSpeed =
        relativeVelocityX *
          normalX +
        relativeVelocityY *
          normalY;

      if (separatingSpeed > 0) {
        return;
      }

      const restitution = 0.91;

      const impulse =
        -(
          1 +
          restitution
        ) *
        separatingSpeed /
        (
          1 /
            firstBody.mass +
          1 /
            secondBody.mass
        );

      const impulseX =
        impulse *
        normalX;

      const impulseY =
        impulse *
        normalY;

      firstBody.velocityX -=
        impulseX /
        firstBody.mass;

      firstBody.velocityY -=
        impulseY /
        firstBody.mass;

      secondBody.velocityX +=
        impulseX /
        secondBody.mass;

      secondBody.velocityY +=
        impulseY /
        secondBody.mass;
    }

    checkPocket(body) {
      const pocket =
        this.pockets.find(
          (item) =>
            Math.hypot(
              body.x - item.x,
              body.y - item.y,
            ) <=
            POCKET_RADIUS -
              body.radius * 0.18,
        );

      if (!pocket) {
        return;
      }

      body.pocketed = true;

      body.velocityX = 0;

      body.velocityY = 0;

      this.pocketedThisShot.push({
        id: body.id,
        type: body.type,
      });

      this.options.onPocket({
        id: body.id,
        type: body.type,
      });
    }

    completeShot() {
      this.shotRunning = false;

      const result = {
        pocketed:
          [
            ...this
              .pocketedThisShot,
          ],

        strikerPocketed:
          this.striker.pocketed,

        remainingCoins:
          this.coins.filter(
            (coin) =>
              !coin.pocketed,
          ).length,
      };

      this.resetStriker();

      this.options.onShotComplete(
        result,
      );
    }

    resetStriker() {
      this.striker.pocketed = false;

      this.striker.x =
        BOARD_SIZE / 2;

      this.striker.y = 835;

      this.striker.velocityX = 0;

      this.striker.velocityY = 0;

      this.resetAim();
    }

    /* ==================================
       Board Drawing
    ================================== */

    draw() {
      const context =
        this.context;

      this.prepareContext();

      context.clearRect(
        0,
        0,
        BOARD_SIZE,
        BOARD_SIZE,
      );

      this.drawBoard(context);

      this.coins.forEach((coin) => {
        if (!coin.pocketed) {
          this.drawBody(
            context,
            coin,
          );
        }
      });

      if (
        this.striker &&
        !this.striker.pocketed
      ) {
        this.drawAimGuide(
          context,
        );

        this.drawBody(
          context,
          this.striker,
        );
      }
    }

    drawBoard(context) {
      const boardGradient =
        context.createLinearGradient(
          0,
          0,
          BOARD_SIZE,
          BOARD_SIZE,
        );

      boardGradient.addColorStop(
        0,
        "#f9e6b5",
      );

      boardGradient.addColorStop(
        1,
        "#dba35a",
      );

      context.fillStyle =
        boardGradient;

      context.fillRect(
        0,
        0,
        BOARD_SIZE,
        BOARD_SIZE,
      );

      context.strokeStyle =
        "rgba(105, 47, 31, 0.64)";

      context.lineWidth = 7;

      context.strokeRect(
        BOARD_EDGE,
        BOARD_EDGE,
        BOARD_SIZE -
          BOARD_EDGE * 2,
        BOARD_SIZE -
          BOARD_EDGE * 2,
      );

      this.pockets.forEach(
        (pocket) => {
          context.beginPath();

          context.arc(
            pocket.x,
            pocket.y,
            POCKET_RADIUS,
            0,
            Math.PI * 2,
          );

          context.fillStyle =
            "#23110f";

          context.fill();

          context.lineWidth = 8;

          context.strokeStyle =
            "rgba(92, 38, 27, 0.5)";

          context.stroke();
        },
      );

      context.strokeStyle =
        "#7c332b";

      context.lineWidth = 6;

      const lineStart = 210;

      const lineEnd = 790;

      const topLine = 170;

      const bottomLine = 830;

      context.beginPath();

      context.moveTo(
        lineStart,
        topLine,
      );

      context.lineTo(
        lineEnd,
        topLine,
      );

      context.moveTo(
        lineStart,
        bottomLine,
      );

      context.lineTo(
        lineEnd,
        bottomLine,
      );

      context.stroke();

      [
        {
          x: lineStart,
          y: topLine,
        },
        {
          x: lineEnd,
          y: topLine,
        },
        {
          x: lineStart,
          y: bottomLine,
        },
        {
          x: lineEnd,
          y: bottomLine,
        },
      ].forEach((point) => {
        context.beginPath();

        context.arc(
          point.x,
          point.y,
          28,
          0,
          Math.PI * 2,
        );

        context.stroke();
      });

      context.beginPath();

      context.arc(
        BOARD_SIZE / 2,
        BOARD_SIZE / 2,
        108,
        0,
        Math.PI * 2,
      );

      context.lineWidth = 7;

      context.stroke();

      context.beginPath();

      context.arc(
        BOARD_SIZE / 2,
        BOARD_SIZE / 2,
        42,
        0,
        Math.PI * 2,
      );

      context.lineWidth = 4;

      context.stroke();
    }

    drawBody(
      context,
      body,
    ) {
      context.save();

      context.translate(
        body.x,
        body.y,
      );

      context.shadowColor =
        "rgba(0, 0, 0, 0.38)";

      context.shadowBlur = 11;

      context.shadowOffsetY = 6;

      const gradient =
        context.createRadialGradient(
          -body.radius * 0.35,
          -body.radius * 0.4,
          body.radius * 0.12,
          0,
          0,
          body.radius,
        );

      if (
        body.type === "white"
      ) {
        gradient.addColorStop(
          0,
          "#ffffff",
        );

        gradient.addColorStop(
          1,
          "#d3c7aa",
        );
      } else if (
        body.type === "black"
      ) {
        gradient.addColorStop(
          0,
          "#5c686b",
        );

        gradient.addColorStop(
          1,
          "#111719",
        );
      } else if (
        body.type === "queen"
      ) {
        gradient.addColorStop(
          0,
          "#ff8c98",
        );

        gradient.addColorStop(
          1,
          "#b51f36",
        );
      } else {
        gradient.addColorStop(
          0,
          "#75e5be",
        );

        gradient.addColorStop(
          0.5,
          "#149b76",
        );

        gradient.addColorStop(
          1,
          "#f4e3aa",
        );
      }

      context.beginPath();

      context.arc(
        0,
        0,
        body.radius,
        0,
        Math.PI * 2,
      );

      context.fillStyle =
        gradient;

      context.fill();

      context.shadowColor =
        "transparent";

      context.lineWidth =
        body.type ===
        "striker"
          ? 6
          : 3;

      context.strokeStyle =
        body.type ===
        "striker"
          ? "rgba(255, 249, 220, 0.9)"
          : "rgba(255, 255, 255, 0.3)";

      context.stroke();

      context.restore();
    }

    drawAimGuide(context) {
      if (this.shotRunning) {
        return;
      }

      const differenceX =
        this.aimPoint.x -
        this.striker.x;

      const differenceY =
        this.aimPoint.y -
        this.striker.y;

      const distance =
        Math.max(
          1,
          Math.hypot(
            differenceX,
            differenceY,
          ),
        );

      const normalX =
        differenceX /
        distance;

      const normalY =
        differenceY /
        distance;

      const guideLength =
        130 +
        this.power * 2.1;

      const endX =
        this.striker.x +
        normalX *
          guideLength;

      const endY =
        this.striker.y +
        normalY *
          guideLength;

      context.save();

      context.beginPath();

      context.moveTo(
        this.striker.x,
        this.striker.y,
      );

      context.lineTo(
        endX,
        endY,
      );

      context.lineWidth = 6;

      context.setLineDash([
        16,
        12,
      ]);

      context.strokeStyle =
        "rgba(187, 62, 54, 0.84)";

      context.stroke();

      context.setLineDash([]);

      context.beginPath();

      context.arc(
        endX,
        endY,
        12,
        0,
        Math.PI * 2,
      );

      context.fillStyle =
        "rgba(187, 62, 54, 0.9)";

      context.fill();

      context.restore();
    }

    /* ==================================
       Cleanup
    ================================== */

    destroy() {
      if (
        this.animationFrameId
      ) {
        window.cancelAnimationFrame(
          this.animationFrameId,
        );
      }

      this.resizeObserver?.disconnect();

      this.canvas.removeEventListener(
        "pointerdown",
        this.boundPointerDown,
      );

      this.canvas.removeEventListener(
        "pointermove",
        this.boundPointerMove,
      );

      window.removeEventListener(
        "pointerup",
        this.boundPointerUp,
      );

      window.removeEventListener(
        "pointercancel",
        this.boundPointerUp,
      );
    }
  }

  window.PMSCarromEngine =
    PMSCarromEngine;
})();