import type { DeviceTemplate } from '../types';

// Ray Allen electric trim servo — covers the entire family of pitch / roll /
// rudder trim actuators (T2-7A, T3-12A, T3-6A, T4-7A, etc.) that share the
// same five-wire pigtail and position-sensor interface.
//
// Pinout per the Ray Allen wiring diagrams (e.g. T2-7A install drawing):
//   Orange = position sensor (paired with Blue)
//   Blue   = position sensor (paired with Orange)
//   Green  = position sensor signal (wiper output)
//   Gray   = motor direction 1
//   White  = motor direction 2
//
// Reversing Gray and White swaps the actuator travel direction — useful when
// the geometry of the install ends up driving the trim "backwards".
//
// The position-sensor wires (Orange / Blue / Green) typically connect to the
// position-indicator dimmer in the panel or to the SV-AP-PANEL position
// sensor inputs. The motor wires (Gray / White) connect to the trim driver
// outputs of the SV-AP-PANEL / SV-AP-TRIMAMP, or a manual trim rocker.
const device: DeviceTemplate = {
  id: 'ray-allen-trim-servo',
  manufacturer: 'Ray Allen',
  partNumber: 'T2-7A / T3-12A / T3-6A / T4-7A',
  name: 'Ray Allen Trim Servo',
  category: 'autopilot',
  description: 'Ray Allen electric trim actuator family. Five-wire flying-lead pigtail — 3 position-sensor + 2 motor leads. Reverse Gray/White to flip motor direction.',
  width: 220,
  height: 220,
  manuals: [
    { label: 'Ray Allen Company', url: 'https://www.rayallencompany.com/' },
  ],
  connectors: [
    {
      name: 'LEADS',
      connectorType: 'pigtail',
      pins: [
        { pinNumber: 'GY', name: 'MOTOR DIRECTION 1', side: 'right', current: '0.5A', comment: 'Gray — reverse with White to flip travel direction' },
        { pinNumber: 'WH', name: 'MOTOR DIRECTION 2', side: 'right', current: '0.5A', comment: 'White — reverse with Gray to flip travel direction' },
        { pinNumber: 'OR', name: 'POSITION SENSOR +', side: 'left',  comment: 'Orange — position sensor reference (paired with Blue)' },
        { pinNumber: 'BL', name: 'POSITION SENSOR -', side: 'left',  comment: 'Blue — position sensor reference (paired with Orange)' },
        { pinNumber: 'GN', name: 'POSITION SIGNAL',   side: 'right', comment: 'Green — sensor wiper output' },
      ],
    },
  ],
};

export default device;
