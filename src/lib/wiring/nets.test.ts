import { describe, it, expect } from 'vitest';
import { wiresInNet } from './nets';
import type { Wire, NetLabel } from './types';

// Minimal wire builder — only id, fromPin, toPin matter for wiresInNet.
function w(id: string, fromPin: string, toPin: string): Wire {
  return { id, fromPin, toPin, color: '#000', sheetId: 's1' } as Wire;
}

// Minimal net-label builder.
function nl(id: string, text: string, attachedTo: string): NetLabel {
  return { id, text, attachedTo, sheetId: 's1' } as NetLabel;
}

describe('wiresInNet', () => {
  it('two wires sharing a direct pin key → wiresInNet of either returns both ids', () => {
    const wires = [
      w('w1', 'U1:P1', 'U2:P1'),
      w('w2', 'U2:P1', 'U3:P1'),
    ];
    expect(wiresInNet('w1', wires, [])).toEqual(['w1', 'w2']);
    expect(wiresInNet('w2', wires, [])).toEqual(['w1', 'w2']);
  });

  it('two wires meeting at the same junction key → both ids', () => {
    const wires = [
      w('w1', 'U1:P1', 'junction:j1'),
      w('w2', 'junction:j1', 'U2:P1'),
    ];
    expect(wiresInNet('w1', wires, [])).toEqual(['w1', 'w2']);
    expect(wiresInNet('w2', wires, [])).toEqual(['w1', 'w2']);
  });

  it('two wires whose junctions carry net labels with the same text → both ids', () => {
    // w1 ends at junction:j1 which has label "GND"; w2 ends at junction:j2
    // which also has label "GND". The same-text labels union the two junctions.
    const wires = [
      w('w1', 'U1:P1', 'junction:j1'),
      w('w2', 'U2:P1', 'junction:j2'),
    ];
    const labels = [
      nl('lbl1', 'GND', 'junction:j1'),
      nl('lbl2', 'GND', 'junction:j2'),
    ];
    expect(wiresInNet('w1', wires, labels)).toEqual(['w1', 'w2']);
    expect(wiresInNet('w2', wires, labels)).toEqual(['w1', 'w2']);
  });

  it('two completely unrelated wires → each seed returns only its own id', () => {
    const wires = [
      w('w1', 'U1:P1', 'U2:P1'),
      w('w2', 'U3:P1', 'U4:P1'),
    ];
    expect(wiresInNet('w1', wires, [])).toEqual(['w1']);
    expect(wiresInNet('w2', wires, [])).toEqual(['w2']);
  });

  it('a wireId not in wires → returns []', () => {
    const wires = [w('w1', 'U1:P1', 'U2:P1')];
    expect(wiresInNet('missing', wires, [])).toEqual([]);
  });

  it('returned array is sorted (deterministic)', () => {
    // Wire ids chosen so alphabetical order differs from insertion order.
    const wires = [
      w('wire-c', 'U1:P1', 'junction:j1'),
      w('wire-a', 'junction:j1', 'U2:P1'),
      w('wire-b', 'U2:P1', 'U3:P1'),
    ];
    const result = wiresInNet('wire-c', wires, []);
    expect(result).toEqual(['wire-a', 'wire-b', 'wire-c']);
  });

  it('net-label bridge via same-text merges two otherwise disconnected chains', () => {
    // Chain 1: w1 — w2 (connected via U2:P1)
    // Chain 2: w3 — w4 (connected via U4:P1)
    // Label "PWR" attached to U1:P1 (w1's fromPin) and U3:P1 (w3's fromPin)
    // bridges the two chains.
    const wires = [
      w('w1', 'U1:P1', 'U2:P1'),
      w('w2', 'U2:P1', 'U2:P2'),
      w('w3', 'U3:P1', 'U4:P1'),
      w('w4', 'U4:P1', 'U4:P2'),
    ];
    const labels = [
      nl('la', 'PWR', 'U1:P1'),
      nl('lb', 'PWR', 'U3:P1'),
    ];
    const result = wiresInNet('w1', wires, labels);
    expect(result).toEqual(['w1', 'w2', 'w3', 'w4']);
  });
});
