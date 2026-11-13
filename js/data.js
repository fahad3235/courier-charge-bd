/* Courier Charge BD - example rate cards.
   These are FICTIONAL examples with round-number rates, shipped only so the
   calculator and comparison work out of the box. They are NOT real courier
   rates. Replace them with the rates from a courier's current rate card.
   Works in Node (module.exports) and in the browser (window.COURIER_DATA). */

const EXAMPLE_COURIERS = [
  {
    id: 'example-a',
    name: 'Example Courier A',
    insideBase: 60,
    outsideBase: 120,
    perKg: 20,
    codPercent: 1,
    freeAbove: 0,
    maxWeight: 10,
    active: true,
    example: true,
  },
  {
    id: 'example-b',
    name: 'Example Courier B',
    insideBase: 70,
    outsideBase: 130,
    perKg: 15,
    codPercent: 0,
    freeAbove: 5000,
    maxWeight: 20,
    active: true,
    example: true,
  },
  {
    id: 'example-c',
    name: 'Example Courier C',
    insideBase: 50,
    outsideBase: 100,
    perKg: 30,
    codPercent: 1.5,
    freeAbove: 0,
    maxWeight: 5,
    active: true,
    example: true,
  },
];

const DATA_API = { EXAMPLE_COURIERS };

if (typeof module !== 'undefined' && module.exports) module.exports = DATA_API;
if (typeof window !== 'undefined') window.COURIER_DATA = DATA_API;
