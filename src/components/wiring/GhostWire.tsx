import type { Point, PlacedDevice } from '@/lib/wiring/types';
import { useWiring, getPinWorldPos } from '@/lib/wiring/store';
import { routeWire, pathFromPoints } from '@/lib/wiring/routing';

export function GhostWire({ cursor, placedDevices }: { cursor: Point | null; placedDevices: PlacedDevice[] }) {
  const wiringFromPin = useWiring(s => s.wiringFromPin);
  if (!wiringFromPin || !cursor) return null;
  const from = getPinWorldPos(placedDevices, wiringFromPin);
  if (!from) return null;

  const points = routeWire(from, cursor);
  const d = pathFromPoints(points);

  return (
    <path
      d={d} fill="none"
      stroke="hsl(var(--primary))" strokeWidth={1.5}
      strokeDasharray="4 4"
      opacity={0.7}
      style={{ pointerEvents: 'none' }}
    />
  );
}
