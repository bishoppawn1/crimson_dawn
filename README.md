# Crimson Dawn

Crimson Dawn is a browser-based real-time strategy game about battlefield energy
logistics. Metal constructs armies and bases; energy keeps structures operating and
units moving, attacking, and using selected special abilities.

The current build is the first playable field test. It includes:

- Selectable mechs with movement and weapon energy costs.
- Energy-dependent shutdown, stasis regeneration, and reactivation.
- Finite Grid Battery storage with visible charging and discharging states.
- Local generator, battery, and relay networks with disconnected-building warnings.
- A powered charging radius and a mobile energy carrier.
- An energy-consuming Overdrive ability on one mech type.
- Hostile units and wreck creation.
- A powered reclamation yard with three autonomous salvage drones.
- Free, delayed replacement of destroyed reclamation drones in the simulation.
- Automatic attacks against hostile units entering weapon range.
- Drag-box unit selection plus stop and hold-position commands.
- Metal mines, relay-tower power networks, and static sentry defenses.
- Grid-charged sentry capacitors with visible range, charge, and targeting status.
- Map-defined metal deposits that restrict mine construction locations.
- Tier 1–3 mech factories with matching worker generations.
- Worker-driven building placement and construction.
- Resumable and cancellable construction with abandoned-project recovery for AI workers.
- A visible 40-unit construction grid with valid/blocked footprint previews and
  shared no-overlap rules for player and AI building placement.
- Footprint-aware snapping and distinct one-cell through five-cell-wide building
  sizes, with every ordinary foundation edge aligned to a grid line.
- Pulse Generators with visible, constant per-second output that never depletes.
- An enemy economy that mines, builds, produces units, defends, and attacks in grouped waves using
  the same simulation rules as the player.
- Scrap piles dropped when a loaded reclamation drone is destroyed.
- Symmetrical starts containing only three workers, one Tier 1 Mech Factory, and
  one generator per side.

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

- Left-click a friendly unit or structure to select it.
- Left-click and drag to box-select units; hold Shift to add to the selection.
- Right-click terrain to move selected units.
- Press `G`, then right-click to force-move without engaging enemies en route.
- Right-click a hostile unit to attack it.
- Right-click an unfinished friendly building with selected workers to resume construction.
- Select an unfinished building and press `C` to cancel it for a partial refund.
- Press `Q` to use Overdrive with selected Bulwark Mechs.
- Select a worker to place buildings, or select a mech factory to queue units.
- With a production building selected, right-click terrain to set the attack-move rally point for newly produced units.
- Press Space to pause or resume.

See `spec.md` for the game design and `AGENTS.md` for project implementation rules.
