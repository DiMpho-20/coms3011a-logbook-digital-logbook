import React, { useEffect, useRef } from 'react';

export const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = window.devicePixelRatio || 1;

    let targetMouseX = 0;
    let targetMouseY = 0;
    let mouseX = 0;
    let mouseY = 0;

    const resizeCanvas = () => {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleMouseMove = (event: MouseEvent) => {
      targetMouseX = event.clientX / width - 0.5;
      targetMouseY = event.clientY / height - 0.5;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const random = (min: number, max: number) => Math.random() * (max - min) + min;
    const randomInt = (min: number, max: number) => Math.floor(random(min, max + 1));

    // Background Gradient & Glows
    const drawBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#07144f');
      gradient.addColorStop(0.25, '#07349b');
      gradient.addColorStop(0.48, '#075bd0');
      gradient.addColorStop(0.7, '#101e91');
      gradient.addColorStop(1, '#170b58');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Blue Glow
      const blueGlow = ctx.createRadialGradient(
        width * 0.52, height * 0.16, 0,
        width * 0.52, height * 0.16, width * 0.55
      );
      blueGlow.addColorStop(0, 'rgba(0, 174, 255, 0.40)');
      blueGlow.addColorStop(0.35, 'rgba(0, 115, 255, 0.18)');
      blueGlow.addColorStop(1, 'rgba(0, 100, 255, 0)');
      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);

      // Violet Top Glow
      const violetTop = ctx.createRadialGradient(
        width * 0.94, height * 0.03, 0,
        width * 0.94, height * 0.03, width * 0.42
      );
      violetTop.addColorStop(0, 'rgba(140, 60, 255, 0.40)');
      violetTop.addColorStop(0.5, 'rgba(90, 40, 220, 0.15)');
      violetTop.addColorStop(1, 'rgba(90, 40, 220, 0)');
      ctx.fillStyle = violetTop;
      ctx.fillRect(0, 0, width, height);

      // Violet Bottom Glow
      const violetBottom = ctx.createRadialGradient(
        width * 0.05, height * 0.98, 0,
        width * 0.05, height * 0.98, width * 0.38
      );
      violetBottom.addColorStop(0, 'rgba(115, 55, 255, 0.38)');
      violetBottom.addColorStop(0.55, 'rgba(70, 40, 200, 0.12)');
      violetBottom.addColorStop(1, 'rgba(70, 40, 200, 0)');
      ctx.fillStyle = violetBottom;
      ctx.fillRect(0, 0, width, height);
    };

    // Particles Setup
    const PARTICLE_COUNT = 75;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: random(0, width),
      y: random(0, height),
      radius: random(1, 3),
      speed: random(0.05, 0.35),
      opacity: random(0.25, 0.75),
      twinkle: random(0.01, 0.04),
      violet: Math.random() < 0.18,
    }));

    const drawParticles = () => {
      particles.forEach((p) => {
        p.y += p.speed;
        p.x += Math.sin(performance.now() * 0.0004 + p.y) * 0.03;

        if (p.y > height + 10) {
          p.y = -10;
          p.x = random(0, width);
        }

        const opacity = p.opacity + Math.sin(performance.now() * p.twinkle) * 0.15;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

        if (p.violet) {
          ctx.fillStyle = `rgba(170,110,255,${opacity})`;
          ctx.shadowColor = 'rgba(160,90,255,0.8)';
        } else {
          ctx.fillStyle = `rgba(70,200,255,${opacity})`;
          ctx.shadowColor = 'rgba(40,190,255,0.8)';
        }

        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    };

    // Light Streaks Setup
    const STREAK_COUNT = 32;
    const createStreak = (initial = false) => ({
      x: random(-100, width + 100),
      y: initial ? random(-height, height) : random(-200, -50),
      length: random(40, 130),
      speed: random(0.7, 2.2),
      width: random(1, 2.5),
      opacity: random(0.25, 0.75),
      violet: Math.random() < 0.18,
    });

    const streaks = Array.from({ length: STREAK_COUNT }, () => createStreak(true));

    const drawStreaks = () => {
      streaks.forEach((streak) => {
        streak.y += streak.speed;
        streak.x -= streak.speed * 0.65;

        if (streak.y > height + streak.length) {
          Object.assign(streak, createStreak(false));
        }

        const gradient = ctx.createLinearGradient(
          streak.x, streak.y,
          streak.x, streak.y + streak.length
        );

        if (streak.violet) {
          gradient.addColorStop(0, 'rgba(180,80,255,0)');
          gradient.addColorStop(0.5, `rgba(190,100,255,${streak.opacity})`);
          gradient.addColorStop(1, 'rgba(180,80,255,0)');
        } else {
          gradient.addColorStop(0, 'rgba(40,200,255,0)');
          gradient.addColorStop(0.5, `rgba(40,200,255,${streak.opacity})`);
          gradient.addColorStop(1, 'rgba(40,200,255,0)');
        }

        ctx.save();
        ctx.translate(streak.x, streak.y);
        ctx.rotate((35 * Math.PI) / 180);

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 10;
        ctx.shadowColor = streak.violet ? '#a65cff' : '#20cfff';
        ctx.fillRect(0, 0, streak.width, streak.length);
        ctx.restore();
      });
    };

    // Icons Setup
    const ICON_TYPES = ['notebook', 'document', 'calendar', 'clock', 'pencil', 'book'];
    const ICON_COUNT = 17;

    const createIcon = (initial = false) => ({
      type: ICON_TYPES[randomInt(0, ICON_TYPES.length - 1)],
      x: random(width * 0.02, width * 0.98),
      y: initial ? random(-height, height) : random(-200, -50),
      size: random(25, 55),
      speed: random(0.1, 0.35),
      rotation: random(-0.4, 0.4),
      rotationSpeed: random(-0.0015, 0.0015),
      sideMovement: random(0.15, 0.5),
      phase: random(0, Math.PI * 2),
      violet: Math.random() < 0.25,
    });

    const icons = Array.from({ length: ICON_COUNT }, () => createIcon(true));

    const iconStyle = (violet: boolean) => {
      ctx.strokeStyle = violet ? 'rgba(175,100,255,0.78)' : 'rgba(40,190,255,0.78)';
      ctx.shadowColor = violet ? 'rgba(165,80,255,0.7)' : 'rgba(30,180,255,0.65)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 8;
    };

    const drawNotebookIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      const w = size;
      const h = size * 1.25;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.08);
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        const yy = -h * 0.28 + i * h * 0.28;
        ctx.beginPath();
        ctx.arc(-w * 0.43, yy, size * 0.07, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = 0; i < 3; i++) {
        const yy = -h * 0.2 + i * h * 0.22;
        ctx.beginPath();
        ctx.moveTo(-w * 0.2, yy);
        ctx.lineTo(w * 0.3, yy);
        ctx.stroke();
      }

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawDocumentIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      const w = size * 0.8;
      const h = size;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.08);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w * 0.15, -h / 2);
      ctx.lineTo(w * 0.4, -h * 0.25);
      ctx.lineTo(w * 0.15, -h * 0.25);
      ctx.closePath();
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        const yy = -h * 0.05 + i * h * 0.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.28, yy);
        ctx.lineTo(w * 0.27, yy);
        ctx.stroke();
      }

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawCalendarIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      const w = size * 1.15;
      const h = size;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.08);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.2);
      ctx.lineTo(w / 2, -h * 0.2);
      ctx.stroke();

      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.25, -h * 0.62);
        ctx.lineTo(i * w * 0.25, -h * 0.35);
        ctx.stroke();
      }

      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.beginPath();
          ctx.arc(
            -w * 0.25 + col * w * 0.25,
            h * 0.05 + row * h * 0.25,
            size * 0.025,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawClockIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -size * 0.27);
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.22, size * 0.12);
      ctx.stroke();

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawPencilIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      const length = size * 1.5;

      ctx.beginPath();
      ctx.moveTo(-length / 2, -size * 0.13);
      ctx.lineTo(length * 0.35, -size * 0.13);
      ctx.lineTo(length * 0.35, size * 0.13);
      ctx.lineTo(-length / 2, size * 0.13);
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(length * 0.35, -size * 0.13);
      ctx.lineTo(length / 2, 0);
      ctx.lineTo(length * 0.35, size * 0.13);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-length * 0.25, -size * 0.13);
      ctx.lineTo(-length * 0.25, size * 0.13);
      ctx.stroke();

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawBookIcon = (x: number, y: number, size: number, rotation: number, violet: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      iconStyle(violet);

      const w = size * 1.15;
      const h = size * 0.8;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.08);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-w * 0.25, -h / 2);
      ctx.lineTo(-w * 0.25, h / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w * 0.18, -h / 2);
      ctx.lineTo(w * 0.18, h * 0.05);
      ctx.lineTo(w * 0.27, -h * 0.03);
      ctx.lineTo(w * 0.36, h * 0.05);
      ctx.lineTo(w * 0.36, -h / 2);
      ctx.stroke();

      ctx.restore();
      ctx.shadowBlur = 0;
    };

    const drawIcon = (icon: (typeof icons)[0]) => {
      const floatingX =
        Math.sin(performance.now() * 0.0005 + icon.phase) * icon.sideMovement * 20;

      const x = icon.x + floatingX;
      const y = icon.y;

      switch (icon.type) {
        case 'notebook':
          drawNotebookIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
        case 'document':
          drawDocumentIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
        case 'calendar':
          drawCalendarIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
        case 'clock':
          drawClockIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
        case 'pencil':
          drawPencilIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
        case 'book':
          drawBookIcon(x, y, icon.size, icon.rotation, icon.violet);
          break;
      }
    };

    const updateIcons = () => {
      icons.forEach((icon) => {
        icon.y += icon.speed;
        icon.rotation += icon.rotationSpeed;

        if (icon.y > height + icon.size * 2) {
          Object.assign(icon, createIcon(false));
        }
      });
    };

    // Main Animation Loop
    const animate = () => {
      mouseX += (targetMouseX - mouseX) * 0.02;
      mouseY += (targetMouseY - mouseY) * 0.02;

      drawBackground();

      ctx.save();
      ctx.translate(mouseX * 8, mouseY * 8);

      drawStreaks();
      drawParticles();
      updateIcons();
      icons.forEach(drawIcon);

      ctx.restore();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        zIndex: 0,
      }}
    />
  );
};