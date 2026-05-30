import type { PlacedDevice } from '@/lib/wiring/types';
import type { SymbolDef } from '@/lib/wiring/symbols';
import { Pin } from './Pin';

/**
 * Renders the schematic-symbol body for a device whose `symbolType` matches one
 * of the SYMBOLS entries. Wraps each symbol type in a small sub-renderer so the
 * geometry stays colocated with its anchor points.
 */
export function SymbolBlock({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  switch (def.type) {
    case 'ground':           return <GroundBody device={device} def={def} />;
    case 'breaker':          return <BreakerBody device={device} def={def} />;
    case 'resistor':         return <ResistorBody device={device} def={def} />;
    case 'capacitor':        return <CapacitorBody device={device} def={def} polar={false} />;
    case 'capacitor-polar':  return <CapacitorBody device={device} def={def} polar={true}  />;
    case 'switch-spst':      return <SwitchSpstBody device={device} def={def} />;
    case 'switch-spdt':      return <SwitchSpdtBody device={device} def={def} />;
    case 'switch-dpst':      return <SwitchDpstBody device={device} def={def} />;
    case 'switch-dpdt':      return <SwitchDpdtBody device={device} def={def} />;
    case 'switch-momentary':    return <MomentaryBody device={device} def={def} variant="no" />;
    case 'switch-momentary-nc': return <MomentaryBody device={device} def={def} variant="nc" />;
    case 'diode':            return <DiodeBody device={device} def={def} variant="junction" />;
    case 'diode-zener':      return <DiodeBody device={device} def={def} variant="zener" />;
    case 'diode-schottky':   return <DiodeBody device={device} def={def} variant="schottky" />;
    case 'diode-led':        return <DiodeBody device={device} def={def} variant="led" />;
    case 'thermocouple':        return <ThermocoupleBody device={device} def={def} polar={false} />;
    case 'thermocouple-polar':  return <ThermocoupleBody device={device} def={def} polar={true}  />;
    case 'solenoid-spst':    return <SolenoidBody device={device} def={def} variant="spst" />;
    case 'solenoid-spdt':    return <SolenoidBody device={device} def={def} variant="spdt" />;
    case 'solenoid-dpst':    return <SolenoidBody device={device} def={def} variant="dpst" />;
    case 'solenoid-dpdt':    return <SolenoidBody device={device} def={def} variant="dpdt" />;
    case 'speaker':          return <SpeakerBody device={device} def={def} />;
    case 'headphone-jack':       return <HeadphoneJackBody device={device} def={def} variant="stereo" />;
    case 'headphone-jack-mono':  return <HeadphoneJackBody device={device} def={def} variant="mono" />;
    case 'lemo-6':           return <Lemo6Body device={device} def={def} />;
    default: return null;
  }
}

// ── Shared pin renderer for symbols ─────────────────────────────────
function SymbolPins({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  return (
    <>
      {def.pins.map((sp) => {
        const pin = device.pinCatalog[sp.index];
        if (!pin) return null;
        return (
          <Pin
            key={pin.id}
            pin={pin}
            deviceId={device.deviceId}
            tipX={sp.tipX}
            tipY={sp.tipY}
            outwardDir={sp.outwardDir}
          />
        );
      })}
    </>
  );
}

// ── Ground ──────────────────────────────────────────────────────────
function GroundBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const cx = def.width / 2;
  // Stem from pin (y=0) down to the top ground bar at y=8.
  return (
    <g>
      <line x1={cx} y1={0} x2={cx} y2={8} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <line x1={cx - 14} y1={8}  x2={cx + 14} y2={8}  stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      <line x1={cx - 10} y1={14} x2={cx + 10} y2={14} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      <line x1={cx - 6}  y1={20} x2={cx + 6}  y2={20} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Circuit breaker ────────────────────────────────────────────────
// Compact symbol: two terminal dots joined by an upward arc, with a short
// stem and a small horizontal "button" cap on top — the panel-breaker look.
function BreakerBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const rating = device.attributes?.rating ?? '';
  const cy = 18;
  const leftDot  = { x: 10, y: cy };
  const rightDot = { x: def.width - 10, y: cy };
  const arcRadius = (rightDot.x - leftDot.x) / 2;
  const arcPeakY  = cy - arcRadius;                 // top of arc
  const buttonY   = Math.max(arcPeakY - 3, 1);      // short stem above peak
  const buttonHalfW = 4;
  const arcD = `M ${leftDot.x} ${leftDot.y} A ${arcRadius} ${arcRadius} 0 0 1 ${rightDot.x} ${rightDot.y}`;
  return (
    <g>
      {/* Terminal stubs inside the body connecting the outer pin tips to the arc dots */}
      <line x1={0} y1={cy} x2={leftDot.x} y2={leftDot.y} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <line x1={def.width} y1={cy} x2={rightDot.x} y2={rightDot.y} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      {/* Terminals */}
      <circle cx={leftDot.x}  cy={leftDot.y}  r={2.5} fill="hsl(var(--foreground))" stroke="hsl(var(--foreground))" strokeWidth={1} />
      <circle cx={rightDot.x} cy={rightDot.y} r={2.5} fill="hsl(var(--foreground))" stroke="hsl(var(--foreground))" strokeWidth={1} />
      {/* Arc (the actuator) */}
      <path d={arcD} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      {/* Stem + button cap */}
      <line x1={def.width / 2} y1={arcPeakY} x2={def.width / 2} y2={buttonY} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <line x1={def.width / 2 - buttonHalfW} y1={buttonY} x2={def.width / 2 + buttonHalfW} y2={buttonY} stroke="hsl(var(--foreground))" strokeWidth={1.6} />
      {/* Designator label ABOVE */}
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {/* Rating label BELOW */}
      {rating && (
        <text
          x={def.width / 2} y={def.height + 2}
          fontSize={10}
          textAnchor="middle" fill="hsl(var(--foreground))"
          style={{ pointerEvents: 'none' }}
          dominantBaseline="hanging"
        >
          {rating}
        </text>
      )}
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Resistor ────────────────────────────────────────────────────────
function ResistorBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const value = device.attributes?.value ?? '';
  // Classic IEC rectangle body, inset slightly so stubs poke out.
  const bodyX = 10;
  const bodyW = def.width - 20;
  return (
    <g>
      {/* Stub segments */}
      <line x1={0}        y1={10} x2={bodyX}          y2={10} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <line x1={bodyX + bodyW} y1={10} x2={def.width} y2={10} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <rect x={bodyX} y={4} width={bodyW} height={12} fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {value && (
        <text
          x={def.width / 2} y={def.height + 2}
          fontSize={10}
          textAnchor="middle" fill="hsl(var(--foreground))"
          style={{ pointerEvents: 'none' }}
          dominantBaseline="hanging"
        >
          {value}
        </text>
      )}
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Switches ────────────────────────────────────────────────────────
//
// Conventions:
//   * Drawn in the OPEN position (schematic standard) — arm lifted clear of
//     the "on" terminal for SPST/DPST, or resting against the NC terminal for
//     SPDT/DPDT.
//   * DPST / DPDT share a mechanical actuator rendered as a dashed line
//     connecting the two arm midpoints.
//   * Stubs extend inward from each pin tip to the terminal dot so connector
//     wires look continuous.

const FG = 'hsl(var(--foreground))';
const BG = 'hsl(var(--background))';

interface TerminalDotProps { x: number; y: number; }
function TerminalDot({ x, y }: TerminalDotProps) {
  return <circle cx={x} cy={y} r={2.5} fill={BG} stroke={FG} strokeWidth={1.2} />;
}

/**
 * Draws a single-pole single-throw contact segment:
 * left dot → arm lifted to the upper-right → right dot.
 * Returns the arm-midpoint (used by DPST to anchor the mechanical link).
 */
function SpstContact({ leftX, rightX, y, width }: { leftX: number; rightX: number; y: number; width: number }) {
  const armEndX = rightX - 3;
  const armEndY = y - 12;
  return (
    <g>
      <line x1={0}     y1={y} x2={leftX}  y2={y} stroke={FG} strokeWidth={1.2} />
      <line x1={rightX} y1={y} x2={width} y2={y} stroke={FG} strokeWidth={1.2} />
      <TerminalDot x={leftX}  y={y} />
      <TerminalDot x={rightX} y={y} />
      <line x1={leftX} y1={y} x2={armEndX} y2={armEndY} stroke={FG} strokeWidth={1.4} />
    </g>
  );
}

/** Draw an SPDT contact: common on left, NO on upper-right, NC on lower-right.
 *  Arm rests on NC (default). Returns hinge point for DPDT actuator linkage. */
function SpdtContact({ commonX, rightX, commonY, noY, ncY, leftStubX, width }: {
  commonX: number; rightX: number; commonY: number; noY: number; ncY: number;
  leftStubX: number; width: number;
}) {
  return (
    <g>
      <line x1={0}     y1={commonY} x2={leftStubX ?? commonX} y2={commonY} stroke={FG} strokeWidth={1.2} />
      <line x1={rightX} y1={noY} x2={width} y2={noY} stroke={FG} strokeWidth={1.2} />
      <line x1={rightX} y1={ncY} x2={width} y2={ncY} stroke={FG} strokeWidth={1.2} />
      <TerminalDot x={commonX} y={commonY} />
      <TerminalDot x={rightX}  y={noY} />
      <TerminalDot x={rightX}  y={ncY} />
      {/* Arm resting on NC */}
      <line x1={commonX} y1={commonY} x2={rightX - 3} y2={ncY - 2} stroke={FG} strokeWidth={1.4} />
    </g>
  );
}

function SwitchHeaderLabel({ device, width }: { device: PlacedDevice; width: number }) {
  return (
    <text
      x={width / 2} y={-2}
      fontSize={11} fontWeight={600}
      textAnchor="middle" fill={FG}
      style={{ pointerEvents: 'none' }}
    >
      {device.name}
    </text>
  );
}

function SwitchSpstBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const y = def.height / 2;
  const leftX = 10, rightX = def.width - 10;
  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />
      <SpstContact leftX={leftX} rightX={rightX} y={y} width={def.width} />
      <SymbolPins device={device} def={def} />
    </g>
  );
}

function SwitchSpdtBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const commonX = 10, rightX = def.width - 10;
  const commonY = 25, noY = 10, ncY = 40;
  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />
      <SpdtContact commonX={commonX} rightX={rightX} commonY={commonY} noY={noY} ncY={ncY}
                   leftStubX={commonX} width={def.width} />
      {/* Tiny NO / NC hints */}
      <text x={rightX - 4} y={noY - 4} fontSize={7} textAnchor="end" fill="hsl(var(--muted-foreground))" style={{ pointerEvents: 'none' }}>NO</text>
      <text x={rightX - 4} y={ncY + 10} fontSize={7} textAnchor="end" fill="hsl(var(--muted-foreground))" style={{ pointerEvents: 'none' }}>NC</text>
      <SymbolPins device={device} def={def} />
    </g>
  );
}

function SwitchDpstBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const leftX = 10, rightX = def.width - 10;
  const y1 = 15, y2 = 45;
  // Mechanical linkage: dashed line between the two arm midpoints.
  // SpstContact's arm goes from (leftX, y) to (rightX-3, y-12). Midpoint ≈ ((leftX+rightX-3)/2, y-6).
  const linkX = (leftX + rightX - 3) / 2;
  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />
      <SpstContact leftX={leftX} rightX={rightX} y={y1} width={def.width} />
      <SpstContact leftX={leftX} rightX={rightX} y={y2} width={def.width} />
      <line
        x1={linkX} y1={y1 - 6}
        x2={linkX} y2={y2 - 6}
        stroke={FG} strokeWidth={0.9} strokeDasharray="3 2"
      />
      <SymbolPins device={device} def={def} />
    </g>
  );
}

function SwitchDpdtBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const commonX = 10, rightX = def.width - 10;
  // Upper SPDT at rows 10/25/40, lower at 60/75/90.
  const u = { commonY: 25, noY: 10, ncY: 40 };
  const l = { commonY: 75, noY: 60, ncY: 90 };
  // Arm rests on NC → midpoint ≈ ((commonX + rightX-3)/2, (commonY + ncY-2)/2).
  const linkX = (commonX + rightX - 3) / 2;
  const upperLinkY = (u.commonY + u.ncY - 2) / 2;
  const lowerLinkY = (l.commonY + l.ncY - 2) / 2;
  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />
      <SpdtContact commonX={commonX} rightX={rightX} commonY={u.commonY} noY={u.noY} ncY={u.ncY}
                   leftStubX={commonX} width={def.width} />
      <SpdtContact commonX={commonX} rightX={rightX} commonY={l.commonY} noY={l.noY} ncY={l.ncY}
                   leftStubX={commonX} width={def.width} />
      <line
        x1={linkX} y1={upperLinkY}
        x2={linkX} y2={lowerLinkY}
        stroke={FG} strokeWidth={0.9} strokeDasharray="3 2"
      />
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Capacitor (polar + non-polar share most geometry) ──────────────
function CapacitorBody({ device, def, polar }: { device: PlacedDevice; def: SymbolDef; polar: boolean }) {
  const value = device.attributes?.value ?? '';
  const cx = def.width / 2;
  const cy = def.height / 2;
  const leftPlateX  = cx - 4;
  const rightPlateX = cx + 4;
  const plateHalfH  = 9;

  return (
    <g>
      {/* Stubs */}
      <line x1={0}        y1={cy} x2={leftPlateX}  y2={cy} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      <line x1={rightPlateX} y1={cy} x2={def.width} y2={cy} stroke="hsl(var(--foreground))" strokeWidth={1.2} />
      {/* Left plate (always straight) */}
      <line x1={leftPlateX} y1={cy - plateHalfH} x2={leftPlateX} y2={cy + plateHalfH} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      {/* Right plate: straight for non-polar, curved inward for polar (electrolytic convention) */}
      {polar ? (
        <path
          d={`M ${rightPlateX} ${cy - plateHalfH} Q ${rightPlateX + 5} ${cy} ${rightPlateX} ${cy + plateHalfH}`}
          fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5}
        />
      ) : (
        <line x1={rightPlateX} y1={cy - plateHalfH} x2={rightPlateX} y2={cy + plateHalfH} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
      )}
      {polar && (
        <text
          x={leftPlateX - 5} y={cy - plateHalfH - 1}
          fontSize={10} fontWeight={700}
          textAnchor="end" fill="hsl(var(--foreground))"
          style={{ pointerEvents: 'none' }}
        >
          +
        </text>
      )}
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill="hsl(var(--foreground))"
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {value && (
        <text
          x={def.width / 2} y={def.height + 2}
          fontSize={10}
          textAnchor="middle" fill="hsl(var(--foreground))"
          style={{ pointerEvents: 'none' }}
          dominantBaseline="hanging"
        >
          {value}
        </text>
      )}
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Diodes (junction, Zener, Schottky, LED) ──────────────────────────
// Shared body: triangle pointing right → cathode bar. Variants change the
// cathode-bar shape (and LED adds emission arrows above).
type DiodeVariant = 'junction' | 'zener' | 'schottky' | 'led';

function DiodeBody({ device, def, variant }: { device: PlacedDevice; def: SymbolDef; variant: DiodeVariant }) {
  const cy = variant === 'led' ? 18 : def.height / 2;
  const triLeftX = 15;
  const triRightX = 30;
  const triHalf = 6;
  const below =
    variant === 'zener' ? (device.attributes?.voltage    ?? device.attributes?.partNumber ?? '') :
    variant === 'led'   ? (device.attributes?.color      ?? '') :
                          (device.attributes?.partNumber ?? '');

  return (
    <g>
      <line x1={0} y1={cy} x2={triLeftX} y2={cy} stroke={FG} strokeWidth={1.2} />
      <line x1={triRightX} y1={cy} x2={def.width} y2={cy} stroke={FG} strokeWidth={1.2} />
      <path
        d={`M ${triLeftX} ${cy - triHalf} L ${triRightX} ${cy} L ${triLeftX} ${cy + triHalf} Z`}
        fill={FG} stroke={FG} strokeWidth={1}
      />
      <DiodeCathodeBar variant={variant} x={triRightX} cy={cy} half={triHalf} />
      {variant === 'led' && (
        <g stroke={FG} strokeWidth={1} fill="none">
          <line x1={triLeftX + 4}  y1={cy - triHalf - 3}  x2={triLeftX + 10} y2={cy - triHalf - 10} />
          <path d={`M ${triLeftX + 10} ${cy - triHalf - 10} L ${triLeftX + 8}  ${cy - triHalf - 9}  M ${triLeftX + 10} ${cy - triHalf - 10} L ${triLeftX + 9}  ${cy - triHalf - 12}`} />
          <line x1={triLeftX + 10} y1={cy - triHalf - 3}  x2={triLeftX + 16} y2={cy - triHalf - 10} />
          <path d={`M ${triLeftX + 16} ${cy - triHalf - 10} L ${triLeftX + 14} ${cy - triHalf - 9}  M ${triLeftX + 16} ${cy - triHalf - 10} L ${triLeftX + 15} ${cy - triHalf - 12}`} />
        </g>
      )}
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill={FG}
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {below && (
        <text
          x={def.width / 2} y={def.height + 2}
          fontSize={10}
          textAnchor="middle" fill={FG}
          style={{ pointerEvents: 'none' }}
          dominantBaseline="hanging"
        >
          {below}
        </text>
      )}
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Momentary pushbutton (NO and NC variants) ──────────────────────
// IEC-style drawing — rest state shown.
//   NO: bar sits ABOVE the terminal line with an air gap below. Pressing the
//       actuator pushes the bar DOWN into the terminals → contact MAKES.
//   NC: bar sits BELOW the terminal line, with two short vertical legs
//       reaching UP to touch each terminal. Pressing the actuator pushes
//       the bar DOWN, legs lose contact with the terminals → contact BREAKS.
function MomentaryBody({ device, def, variant }: { device: PlacedDevice; def: SymbolDef; variant: 'no' | 'nc' }) {
  const termY  = 22;                 // terminal contact line (matches pin tipY)
  const capY   = 2;                  // button cap y
  const leftX  = 10;
  const rightX = def.width - 10;
  const cx     = def.width / 2;
  const barLeftX  = leftX  - 2;
  const barRightX = rightX + 2;
  const capHalfW  = 9;

  // Variant-specific bar position. NO's bar hovers above; NC's bar sits
  // below with legs up to the terminals.
  const barY = variant === 'no' ? 10 : 28;
  // Stem reaches from the cap down to the bar (NO) or to just above the
  // terminal plane (NC — the air gap is intentional; pressing closes it).
  const stemBottomY = variant === 'no' ? barY : termY - 2;

  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />

      {/* Terminal stubs — from body edge inward to each terminal dot */}
      <line x1={0}          y1={termY} x2={leftX}     y2={termY} stroke={FG} strokeWidth={1.2} />
      <line x1={rightX}     y1={termY} x2={def.width} y2={termY} stroke={FG} strokeWidth={1.2} />
      <TerminalDot x={leftX}  y={termY} />
      <TerminalDot x={rightX} y={termY} />

      {/* Bridge bar — above terminals for NO, below for NC */}
      <line x1={barLeftX} y1={barY} x2={barRightX} y2={barY} stroke={FG} strokeWidth={1.4} />

      {/* NC only: legs from the bar UP to each terminal dot, showing the
          circuit is made at rest. On NO these are omitted — the air gap
          between bar and terminals represents the open contact. */}
      {variant === 'nc' && (
        <>
          <line x1={leftX}  y1={termY} x2={leftX}  y2={barY} stroke={FG} strokeWidth={1.2} />
          <line x1={rightX} y1={termY} x2={rightX} y2={barY} stroke={FG} strokeWidth={1.2} />
        </>
      )}

      {/* Actuator: cap + stem */}
      <line x1={cx - capHalfW} y1={capY} x2={cx + capHalfW} y2={capY} stroke={FG} strokeWidth={1.6} />
      <line x1={cx} y1={capY} x2={cx} y2={stemBottomY} stroke={FG} strokeWidth={1.2} />

      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Thermocouple ────────────────────────────────────────────────────
// Two dissimilar-metal leads converge at a junction bead. Polar variant
// marks upper lead as "−" and lower as "+" (type-K convention).
function ThermocoupleBody({ device, def, polar }: { device: PlacedDevice; def: SymbolDef; polar: boolean }) {
  const type = device.attributes?.type ?? '';
  const junctionX = def.width - 18;
  const junctionY = def.height / 2;
  const upperY = 10, lowerY = 30;
  return (
    <g>
      {/* Leads converging from the left onto the junction bead */}
      <line x1={0} y1={upperY} x2={junctionX} y2={junctionY} stroke={FG} strokeWidth={1.4} />
      <line x1={0} y1={lowerY} x2={junctionX} y2={junctionY} stroke={FG} strokeWidth={1.4} />
      {/* Junction bead */}
      <circle cx={junctionX} cy={junctionY} r={3} fill={FG} stroke={FG} strokeWidth={1} />
      {/* Short hot-junction stub to the right */}
      <line x1={junctionX} y1={junctionY} x2={def.width} y2={junctionY} stroke={FG} strokeWidth={1} strokeDasharray="2 2" />
      {polar && (
        <>
          <text x={-3} y={upperY - 2} fontSize={10} fontWeight={700} textAnchor="end" fill={FG} style={{ pointerEvents: 'none' }}>−</text>
          <text x={-3} y={lowerY + 8} fontSize={10} fontWeight={700} textAnchor="end" fill={FG} style={{ pointerEvents: 'none' }}>+</text>
        </>
      )}
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill={FG}
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      {type && (
        <text
          x={def.width / 2} y={def.height + 2}
          fontSize={10}
          textAnchor="middle" fill={FG}
          style={{ pointerEvents: 'none' }}
          dominantBaseline="hanging"
        >
          Type {type}
        </text>
      )}
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Solenoid / relay (SPST, SPDT, DPST, DPDT) ──────────────────────
// Geometry follows the standard schematic convention from the reference
// image: vertical coil on the left, vertical switch contacts on the right
// with pins exiting the TOP and BOTTOM edges. Multi-pole variants draw two
// contacts side by side, linked by a dashed mechanical actuator line.
//
// Contact convention (per SPST cell):
//   top-of-body   ●─────  terminal B (upper)
//                 │
//                 ╱ ← arm (drawn open, lifted off the top)
//                 ●  ← pivot = lower terminal A
//   bottom-of-body ──────
//
// The dashed linkage runs from the middle of the coil to the arm pivot; for
// multi-pole, it also runs between arm pivots so poles move together.
type SolenoidVariant = 'spst' | 'spdt' | 'dpst' | 'dpdt';

function SolenoidBody({ device, def, variant }: { device: PlacedDevice; def: SymbolDef; variant: SolenoidVariant }) {
  // Shared coil on the left (same geometry for all variants so the mental
  // model "this is a relay coil" reads consistently). Drawn as the standard
  // schematic coil: a vertical backing line with a series of right-bulging
  // half-circle humps — looks like a spring viewed from the side.
  const coilLeftX   = 12;
  const coilTopY    = 25;
  const coilBottomY = 75;
  const coilMidY    = (coilTopY + coilBottomY) / 2;
  const humpCount   = 4;
  const humpHeight  = (coilBottomY - coilTopY) / humpCount;   // 12.5
  const humpRadius  = humpHeight / 2;                          // 6.25
  // Visual right-edge of the coil (where the mechanical linkage anchors).
  const coilRightX  = coilLeftX + humpRadius;

  // Vertical span of each contact cell (same top/bottom for all variants so
  // they line up visually when dropped next to each other).
  const topEdgeY    = 10;
  const bottomEdgeY = 90;

  // Pin tip X positions for each contact cell come from the symbol def —
  // this is the authority so the stub lines up with the pin. Each "cell"
  // uses those to place its terminal dots and arm.

  return (
    <g>
      <SwitchHeaderLabel device={device} width={def.width} />

      {/* Coil leads: short horizontal runs from the body edge to the top
          and bottom of the coil's vertical backing line. */}
      <line x1={0} y1={30} x2={coilLeftX} y2={coilTopY}    stroke={FG} strokeWidth={1.2} />
      <line x1={0} y1={70} x2={coilLeftX} y2={coilBottomY} stroke={FG} strokeWidth={1.2} />

      {/* Coil: vertical backing line (iron-core / spool edge) + a continuous
          path of half-circle humps bulging right. Matches the IEC-style
          schematic coil symbol. */}
      <line x1={coilLeftX} y1={coilTopY} x2={coilLeftX} y2={coilBottomY}
            stroke={FG} strokeWidth={1.2} />
      <path
        d={(() => {
          let d = `M ${coilLeftX} ${coilTopY}`;
          for (let i = 0; i < humpCount; i++) {
            const yEnd = coilTopY + (i + 1) * humpHeight;
            d += ` A ${humpRadius} ${humpRadius} 0 0 1 ${coilLeftX} ${yEnd}`;
          }
          return d;
        })()}
        fill="none" stroke={FG} strokeWidth={1.2}
      />

      {/* Contact cells. Each cell is drawn around one "column X" — these come
          from the symbol def's pin tip Xs so the switch arms sit right above
          / below the exit pins. */}
      {(() => {
        const armMidY = (topEdgeY + bottomEdgeY) / 2;

        if (variant === 'spst') {
          // One SPST column at the body's midline.
          const colX = 50;
          return (
            <g>
              <SpstCell colX={colX} topY={topEdgeY} bottomY={bottomEdgeY} />
              {/* Mechanical linkage from coil to arm pivot (bottom terminal) */}
              <line x1={coilRightX} y1={coilMidY} x2={colX} y2={bottomEdgeY}
                    stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
            </g>
          );
        }

        if (variant === 'spdt') {
          const colX = 55;     // common column (bottom pin)
          const throwL = 47;   // top-left throw
          const throwR = 63;   // top-right throw
          return (
            <g>
              <SpdtCell commonX={colX} throwLX={throwL} throwRX={throwR}
                        topY={topEdgeY} bottomY={bottomEdgeY} />
              <line x1={coilRightX} y1={coilMidY} x2={colX} y2={bottomEdgeY}
                    stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
            </g>
          );
        }

        if (variant === 'dpst') {
          const col1 = 55, col2 = 85;
          return (
            <g>
              <SpstCell colX={col1} topY={topEdgeY} bottomY={bottomEdgeY} />
              <SpstCell colX={col2} topY={topEdgeY} bottomY={bottomEdgeY} />
              {/* Linkage: coil → first pivot → second pivot (dashed across) */}
              <line x1={coilRightX} y1={coilMidY} x2={col1} y2={armMidY}
                    stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
              <line x1={col1} y1={armMidY} x2={col2} y2={armMidY}
                    stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
            </g>
          );
        }

        // DPDT — two SPDTs side by side.
        const c1 = 60, l1 = 52, r1 = 68;
        const c2 = 100, l2 = 92, r2 = 108;
        return (
          <g>
            <SpdtCell commonX={c1} throwLX={l1} throwRX={r1}
                      topY={topEdgeY} bottomY={bottomEdgeY} />
            <SpdtCell commonX={c2} throwLX={l2} throwRX={r2}
                      topY={topEdgeY} bottomY={bottomEdgeY} />
            <line x1={coilRightX} y1={coilMidY} x2={c1} y2={armMidY}
                  stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
            <line x1={c1} y1={armMidY} x2={c2} y2={armMidY}
                  stroke={FG} strokeWidth={0.9} strokeDasharray="3 2" />
          </g>
        );
      })()}

      <SymbolPins device={device} def={def} />
    </g>
  );
}

// One SPST contact: top-terminal dot, bottom-terminal dot (pivot), arm
// lifted up-right from the pivot (drawn open).
function SpstCell({ colX, topY, bottomY }: { colX: number; topY: number; bottomY: number }) {
  const armEndX = colX + 6;
  const armEndY = topY + 10;
  return (
    <g>
      <TerminalDot x={colX} y={topY} />
      <TerminalDot x={colX} y={bottomY} />
      {/* Arm starts at pivot (bottom) and lifts up-right, open. */}
      <line x1={colX} y1={bottomY} x2={armEndX} y2={armEndY}
            stroke={FG} strokeWidth={1.4} />
    </g>
  );
}

// One SPDT contact: common dot at bottom, two throw dots at top; arm rests
// against the LEFT throw by default (like NC on standard relay symbols).
function SpdtCell({ commonX, throwLX, throwRX, topY, bottomY }: {
  commonX: number; throwLX: number; throwRX: number; topY: number; bottomY: number;
}) {
  return (
    <g>
      <TerminalDot x={throwLX} y={topY} />
      <TerminalDot x={throwRX} y={topY} />
      <TerminalDot x={commonX} y={bottomY} />
      {/* Arm from common up-left resting on the LEFT throw */}
      <line x1={commonX} y1={bottomY} x2={throwLX + 1} y2={topY + 2}
            stroke={FG} strokeWidth={1.4} />
    </g>
  );
}

// ── Loudspeaker ─────────────────────────────────────────────────────
// Small driver rectangle on the left with a flared cone opening right.
function SpeakerBody({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const driverW = 10, coneStartX = driverW, coneEndX = def.width - 2;
  const topY = 4, bottomY = def.height - 4;
  const midY = def.height / 2;
  return (
    <g>
      {/* Lead stubs to pins */}
      <line x1={0} y1={12} x2={5} y2={12} stroke={FG} strokeWidth={1.2} />
      <line x1={0} y1={28} x2={5} y2={28} stroke={FG} strokeWidth={1.2} />
      {/* Driver rectangle */}
      <rect x={5} y={midY - 8} width={driverW - 2} height={16} fill={BG} stroke={FG} strokeWidth={1.2} />
      {/* Cone: triangle fanning out to the right */}
      <path
        d={`M ${coneStartX} ${midY - 8} L ${coneEndX} ${topY} L ${coneEndX} ${bottomY} L ${coneStartX} ${midY + 8} Z`}
        fill={BG} stroke={FG} strokeWidth={1.2}
      />
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill={FG}
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Headphone jack (TRS stereo / TS mono) ───────────────────────────
// Schematic side-view of a phone jack. A solid barrel on the right
// represents the insulated plug sleeve; each contact on the left is a
// horizontal line that terminates at the barrel. The upper contacts (Tip,
// and Ring on stereo) have a small spring-contact zigzag — this is the
// spring finger that presses against the plug. The Sleeve contact runs
// straight to the barrel since it mates with the outer shell, not a spring.
//
//   stereo: Tip (spring) — Ring (spring, lowered) — Sleeve (straight)
//   mono:   Tip (spring)                          — Sleeve (straight)
function HeadphoneJackBody({ device, def, variant }: {
  device: PlacedDevice;
  def: SymbolDef;
  variant: 'stereo' | 'mono';
}) {
  const barrelX = def.width - 12;
  const barrelW = 8;
  const barrelY1 = 2;
  const barrelY2 = def.height - 2;

  // Contact rows come straight from the symbol def's pin tipYs so they
  // always align with the external stub drawn by SymbolPins — changing a
  // pin's Y only needs editing one place.
  const contactRows = def.pins.map((p, i) => {
    const isLast = i === def.pins.length - 1;
    return { y: p.tipY, hasSpring: !isLast };   // Sleeve (last) is straight
  });

  // Spring-contact shape (relative to y). Starts at the terminal, runs
  // horizontally, then a single __/\__ zigzag whose free end stops BEFORE
  // the barrel — the physical gap into which the plug's tip/ring slides.
  // That air gap is the whole point of the symbol, so the line must not
  // touch the barrel (otherwise it reads as shorted to sleeve).
  const springPoints = (y: number) => [
    [ 0,  y],         // start of line at left body edge
    [30,  y],         // run out to the start of the zigzag
    [38,  y - 5],     // up-right peak
    [46,  y + 5],     // down-right — ends here in mid-air
  ].map(([x, yy]) => `${x},${yy}`).join(' ');

  return (
    <g>
      {/* Solid barrel on the right (represents the insulated plug sleeve). */}
      <rect
        x={barrelX} y={barrelY1}
        width={barrelW} height={barrelY2 - barrelY1}
        fill={FG} stroke={FG} strokeWidth={1}
      />

      {/* Contacts */}
      {contactRows.map((c, i) => (
        c.hasSpring ? (
          <polyline
            key={i}
            points={springPoints(c.y)}
            fill="none" stroke={FG} strokeWidth={1.2}
          />
        ) : (
          <line
            key={i}
            x1={0} y1={c.y}
            x2={barrelX} y2={c.y}
            stroke={FG} strokeWidth={1.2}
          />
        )
      ))}

      {/* Designator above the body */}
      <text
        x={def.width / 2} y={-2}
        fontSize={10} fontWeight={600}
        textAnchor="middle" fill={FG}
        style={{ pointerEvents: 'none' }}
      >
        {variant === 'mono' ? `${device.name} (TS)` : device.name}
      </text>
      <SymbolPins device={device} def={def} />
    </g>
  );
}

// ── Lemo-style 6-pin circular connector ─────────────────────────────
// Layout: circular body on the LEFT, six pin-labels stacked on the RIGHT.
// Pin numbers inside the body sit in a hexagon at the 2 / 12 / 10 / 8 / 6 / 4
// o'clock positions (matches the physical connector). Each internal pin
// circle has a lead line to its stub root at the right-edge label column.
// The keying notch sits on the right between pins 1 and 6.
function Lemo6Body({ device, def }: { device: PlacedDevice; def: SymbolDef }) {
  const bodyCx = 50;
  const bodyCy = def.height / 2;
  const bodyR  = 42;
  const pinR   = 5.5;
  const orbit  = 26; // hexagonal pin orbit inside the body

  // Internal pin positions, index 0..5 = pin numbers 1..6 (CCW from 2 o'clock).
  // Angles are spaced 60° apart for a true regular hexagon; the keying notch
  // sits in the +x gap between pin 1 (2 o'clock, −30°) and pin 6 (4 o'clock,
  // +30°). Earlier values clustered three pins near 12 and three near 6 —
  // that read as two half-circles rather than a ring.
  const internalAngles = [
    -Math.PI /  6,       // Pin 1 — 2 o'clock  (−30°)
    -Math.PI /  2,       // Pin 2 — 12 o'clock (−90°)
    -5 * Math.PI / 6,    // Pin 3 — 10 o'clock (−150°)
     5 * Math.PI / 6,    // Pin 4 — 8 o'clock  (+150°)
     Math.PI /  2,       // Pin 5 — 6 o'clock  (+90°)
     Math.PI /  6,       // Pin 6 — 4 o'clock  (+30°)
  ];

  const PIN_STUB = 10; // matches constants.ts PIN_STUB_LENGTH

  return (
    <g>
      {/* Body outline */}
      <circle cx={bodyCx} cy={bodyCy} r={bodyR} fill={BG} stroke={FG} strokeWidth={1.4} />

      {/* Keying notch: small outward nub on the right between pins 1 and 6
          (at the 3 o'clock position, angle 0). Drawn as a short arc bump
          that sits on the body outline. */}
      {(() => {
        const notchCenterX = bodyCx + bodyR;
        const halfArc = 6;
        return (
          <path
            d={`M ${notchCenterX} ${bodyCy - halfArc}
                A ${halfArc} ${halfArc} 0 0 1 ${notchCenterX} ${bodyCy + halfArc}`}
            fill={BG} stroke={FG} strokeWidth={1.4}
          />
        );
      })()}

      {/* Leads from each internal pin circle to its stub root on the right.
          We draw to (tipX − PIN_STUB) so the Pin's own stub continues cleanly
          for the last 10 px to the tip. */}
      {def.pins.map((sp, i) => {
        const a = internalAngles[i];
        const px = bodyCx + orbit * Math.cos(a);
        const py = bodyCy + orbit * Math.sin(a);
        return (
          <line
            key={`lead-${i}`}
            x1={px} y1={py}
            x2={sp.tipX - PIN_STUB} y2={sp.tipY}
            stroke={FG} strokeWidth={1}
          />
        );
      })}

      {/* Pin circles + pin-number glyphs inside the body */}
      {def.pins.map((_, i) => {
        const a = internalAngles[i];
        const px = bodyCx + orbit * Math.cos(a);
        const py = bodyCy + orbit * Math.sin(a);
        return (
          <g key={`pin-${i}`}>
            <circle cx={px} cy={py} r={pinR} fill={BG} stroke={FG} strokeWidth={1} />
            <text x={px} y={py + 1} fontSize={8} textAnchor="middle" fill={FG}
                  dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
              {i + 1}
            </text>
          </g>
        );
      })}

      {/* Pin-name labels to the RIGHT of each tip. We skip drawing anything
          here if the device's pin has no name (shouldn't happen for the
          stock template, but guards against edits). */}
      {def.pins.map((sp, i) => {
        const pin = device.pinCatalog[sp.index];
        if (!pin?.name) return null;
        return (
          <text
            key={`name-${i}`}
            x={sp.tipX + 6}
            y={sp.tipY}
            fontSize={9}
            fill={FG}
            dominantBaseline="middle"
            textAnchor="start"
            style={{ pointerEvents: 'none' }}
          >
            {pin.name}
          </text>
        );
      })}

      {/* Designator label above the body */}
      <text
        x={bodyCx} y={-2}
        fontSize={11} fontWeight={600}
        textAnchor="middle" fill={FG}
        style={{ pointerEvents: 'none' }}
      >
        {device.name}
      </text>
      <SymbolPins device={device} def={def} />
    </g>
  );
}

function DiodeCathodeBar({ variant, x, cy, half }: { variant: DiodeVariant; x: number; cy: number; half: number }) {
  switch (variant) {
    case 'zener':
      return (
        <path
          d={`M ${x - 3} ${cy - half - 2} L ${x} ${cy - half} L ${x} ${cy + half} L ${x + 3} ${cy + half + 2}`}
          fill="none" stroke={FG} strokeWidth={1.4}
        />
      );
    case 'schottky':
      return (
        <g stroke={FG} strokeWidth={1.4} fill="none">
          <line x1={x} y1={cy - half} x2={x} y2={cy + half} />
          <polyline points={`${x - 3},${cy - half + 3} ${x - 3},${cy - half} ${x},${cy - half}`} />
          <polyline points={`${x + 3},${cy + half - 3} ${x + 3},${cy + half} ${x},${cy + half}`} />
        </g>
      );
    case 'junction':
    case 'led':
    default:
      return <line x1={x} y1={cy - half} x2={x} y2={cy + half} stroke={FG} strokeWidth={1.4} />;
  }
}
