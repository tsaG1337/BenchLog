// Shared geometry constants. Kept in their own module to break the circular
// import chain between layout.ts and symbols.ts.
//
// Values are tuned so that EVERY pin Y in the connector-based layout lands on
// a multiple of 10 in device-local coordinates (and therefore also in world
// coords, since devices snap to a 10-grid). This matches the wire-drag snap
// granularity so a user dragging a wire can always line it up exactly with
// a pin.
//
// Math:   first_pin_y = DEVICE_HEADER + CONN_PAD         // cursorY_init
//                     + CONN_HEADER + CONN_PAD           // header + inner pad
//                     + PIN_SPACING / 2                  // first slot centre
//       = 30 + 0 + 20 + 0 + 10 = 60 (mult of 10 ✓)
//       pin N  =  first_pin_y + N * PIN_SPACING          // still mult of 10 ✓

export const PIN_SPACING     = 20;   // was 22 — now on the 10-grid
export const PIN_STUB_LENGTH = 10;   // was 14 — keeps ground symbol anchors on 10-grid
export const CONN_HEADER     = 20;   // was 14 — bumped so header + pin centre is on 10-grid
export const CONN_PAD        = 0;    // was 4  — inner padding rolled into CONN_HEADER
export const DEVICE_HEADER   = 30;   // unchanged
export const SIDE_MARGIN     = 20;   // was 24 — on the 10-grid
export const MIN_DEV_WIDTH   = 180;
export const MIN_DEV_HEIGHT  = 120;
