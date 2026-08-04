# Crimson Dawn

Crimson Dawn is a browser-based real-time strategy game about battlefield energy
logistics. Metal constructs armies and bases; energy keeps structures operating and
units moving, attacking, and using selected special abilities.

The current build is the first playable field test. It includes:

- Selectable mechs with movement and weapon energy costs.
- Simple role-specific Canvas sprites with clearly bipedal mech silhouettes.
- Energy-dependent shutdown, stasis regeneration, and reactivation.
- Greatly expanded internal batteries for every worker, combat unit, carrier, and
  enemy unit.
- Capped emergency regeneration for active low-energy units so stalled weapons and
  movement can recover without replacing normal energy logistics.
- Finite Grid Battery storage plus smaller generator and relay reserves, with
  visible charging and discharging states.
- Net building-power accounting, including passive Metal Mine demand and extra
  demand from active factory queues.
- Local generator, battery, and relay networks with disconnected-building warnings.
- A powered charging radius and visible mobile carriers that spend their own
  reserves to recharge nearby friendly units.
- Simultaneous Induction Charger fields that fairly share scarce grid power among
  every in-range unit across a large 260-world-unit radius.
- An energy-consuming Overdrive ability on one mech type.
- Hostile units and wreck creation.
- A powered reclamation yard with three autonomous salvage drones.
- Free, delayed replacement of destroyed reclamation drones in the simulation.
- Multiple reclamation drones can harvest the same wreck or scrap pile concurrently.
- Automatic attacks against hostile units entering weapon range.
- Compact unit silhouettes with physical unit-to-unit separation for dense groups.
- Drag-box unit selection plus stop and hold-position commands.
- Metal mines, relay-tower power networks, and static sentry defenses.
- Grid-charged sentry capacitors with visible range, charge, and targeting status.
- Map-defined metal deposits that restrict mine construction locations.
- Tier 1–3 mech factories, each offering matching-tier Worker, Vanguard, Bulwark,
  and Arc Energy Carrier production lines.
- A massive supply system with role- and tier-specific unit costs, queue
  reservations, and powered 8×6 Strategic Supply Complexes that upgrade from
  5,000 to 10,000 and 20,000 added capacity.
- Worker-driven building placement and construction.
- Collision-safe factory exits and spread rally formations for player and enemy units.
- Resumable and cancellable construction with abandoned-project recovery for AI workers.
- A visible 40-unit construction grid with valid/blocked footprint previews and
  shared no-overlap rules for player and AI building placement.
- Footprint-aware snapping and distinct one-cell through five-cell-wide building
  sizes, with every ordinary foundation edge aligned to a grid line.
- Pulse Generators with visible, constant per-second output that never depletes.
- A concise HUD energy readout showing net building power per second and combined
  stored grid energy against capacity.
- An enemy economy that mines, builds, produces units, defends, and attacks in grouped waves using
  the same simulation rules as the player.
- Scrap piles dropped when a loaded reclamation drone is destroyed.
- Symmetrical starts containing three workers, one Tier 1 Mech Factory, one
  generator, and one powered Metal Mine on a nearby deposit per side.

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

- Use `WASD` to pan the camera and the mouse wheel to zoom around the cursor.
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
