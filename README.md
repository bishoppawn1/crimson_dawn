# Crimson Dawn

Crimson Dawn is a browser-based real-time strategy game about battlefield energy
logistics. Metal constructs armies and bases; energy keeps structures operating and
units moving, attacking, and using selected special abilities.

The current build is the first playable field test. It includes:

- Selectable mechs with movement and weapon energy costs.
- Energy-dependent shutdown, stasis regeneration, and reactivation.
- A powered charging radius and a mobile energy carrier.
- An energy-consuming Overdrive ability on one mech type.
- Hostile units and wreck creation.
- A powered reclamation yard with three autonomous salvage drones.
- Free, delayed replacement of destroyed reclamation drones in the simulation.

## Run locally

Requirements: Node.js 20 or newer.

```sh
npm run dev
```

Open <http://127.0.0.1:4173>.

## Validate

```sh
npm test
npm run check
```

No package installation or external runtime is required.

## Controls

- Left-click a friendly unit to select it; Shift-click adds or removes units.
- Right-click terrain to move selected units.
- Right-click a hostile unit to attack it.
- Press `Q` to use Overdrive with selected Bulwark Mechs.
- Press Space to pause or resume.

See `spec.md` for the game design and `AGENTS.md` for project implementation rules.
