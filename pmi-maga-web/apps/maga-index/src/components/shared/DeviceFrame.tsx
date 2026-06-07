import { useEffect, useState } from 'react';

type Device = {
  name: string;
  width: number;
  height: number;
};

const DEVICES: Record<string, Device> = {
  iphone: { name: 'iPhone 14', width: 390, height: 844 },
  'iphone-pro': { name: 'iPhone 14 Pro', width: 393, height: 852 },
  'iphone-se': { name: 'iPhone SE', width: 375, height: 667 },
};

export function getDeviceFromUrl(search: string): Device | null {
  const params = new URLSearchParams(search);
  const key = params.get('device');
  if (!key) return null;
  return DEVICES[key] ?? null;
}

function buildInnerSrc(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('device');
  return url.pathname + url.search + url.hash;
}

export function DeviceFrame() {
  const device = getDeviceFromUrl(window.location.search)!;
  const [innerSrc] = useState(buildInnerSrc);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const recompute = () => {
      const frameWidth = device.width + 24;
      const frameHeight = device.height + 28 + 64;
      const sx = window.innerWidth / frameWidth;
      const sy = window.innerHeight / frameHeight;
      setScale(Math.min(1, sx, sy));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [device.width, device.height]);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#0b0b0d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#d4d4d8',
        padding: 16,
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.7 }}>
        {device.name} · {device.width}×{device.height}
      </div>
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          transition: 'transform 120ms ease',
        }}
      >
        <div
          style={{
            width: device.width + 24,
            height: device.height + 28,
            borderRadius: 56,
            background: '#000',
            padding: '14px 12px',
            boxShadow:
              '0 30px 60px rgba(0,0,0,0.6), 0 0 0 2px #1f1f23 inset, 0 0 0 4px #000',
            position: 'relative',
          }}
        >
          {/* Dynamic island */}
          <div
            style={{
              position: 'absolute',
              top: 22,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 110,
              height: 30,
              borderRadius: 999,
              background: '#000',
              zIndex: 2,
            }}
          />
          <iframe
            src={innerSrc}
            title={device.name}
            style={{
              width: device.width,
              height: device.height,
              border: 'none',
              borderRadius: 44,
              background: '#fff',
              display: 'block',
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.5 }}>
        remove <code>?device=…</code> to exit · try <code>?device=iphone-se</code> or{' '}
        <code>?device=iphone-pro</code>
      </div>
    </div>
  );
}
