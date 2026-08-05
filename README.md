# Crimson Dawn

Crimson Dawn is a browser-based real-time strategy game about battlefield energy
logistics. Metal constructs armies and bases; energy keeps structures operating and
units moving, attacking, and using selected special abilities.

[Play Crimson Dawn on GitHub Pages](https://bishoppawn1.github.io/crimson_dawn/)

The current build is the first playable field test. It includes:

- A start menu for two- through eight-player single-player matches and hosted
  multiplayer lobbies with a shared player roster and host-managed AI slots.
- AI commanders that expand their economy, progress through Tier 2 and Tier 3 Mech
  Factories, produce advanced workers, and construct higher-tier infrastructure.
- Host-authoritative WebRTC multiplayer with one 10-character lobby code,
  explicit host start, randomized count-compatible maps,
  team-validated commands, and no gameplay server or account.
- Selectable mechs with movement and weapon energy costs.
- Realistic role-specific top-down Canvas sprites with directional lighting,
  articulated machinery, functional equipment, target-aware facing, and clearly
  separated rear legs and feet on every mech.
- A muted olive-and-earth battlefield palette with subtle fixed ground texture
  that keeps neutral gray units readable.
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
- Multiple reclamation drones can harvest the same wreck or scrap pile concurrently,
  then chain directly to nearby piles until their cargo is full. Their hovering
  chassis passes over starting walls while rocky terrain still redirects them.
- Automatic attacks against hostile units entering weapon range.
- Player and enemy combat units retaliate against and pursue hostile aggressors.
- Fast, long-endurance Raiders deal 1.75× damage to structures and automatically
  prioritize exposed economic and power infrastructure.
- Compact unit silhouettes with physical unit-to-unit separation for dense groups.
- Drag-box unit selection plus matching factory-group selection, stop, and hold-position commands.
- Metal mines, relay-tower power networks, and static sentry defenses.
- Grid-charged sentry capacitors with visible range, charge, and targeting status.
- Map-defined metal deposits that restrict mine construction locations.
- Five selectable 5,200×3,200 duel battlefields plus three distinct layouts for
  every total player count from three through eight: 23 maps in total.
- Edge-to-edge ancient-ruin, layered-crag, and fractured-spoke map families, with
  substantial outer landmarks in every sector and a ruin-heavy three-player
  Ancient Triad stretching from its central sanctuary to outlying districts.
- Neutral-colored ordinary deposits at every distance plus yellow Rich Metal
  Deposits that provide a provisional 1.5× Metal Mine output multiplier.
- Visible impassable ridges, shelves, crags, and broken starting walls that block
  ground movement and construction for both players and AI while leaving open gates.
- Tier 1–3 mech factories, each offering matching-tier Worker, Vanguard, Bulwark,
  and Arc Energy Carrier production lines.
- Tier 1–3 Vehicle Factories producing Scout Vehicles, Battle Tanks, Mobile
  Artillery, and Grid Tankers, plus Tier 2–3 Air Factories producing Interceptors,
  Gunships, Bombers, and Energy Tenders. Aircraft fly over terrain and structures.
- A Tier 3 Experimental Factory producing the multi-weapon Arsenal Colossus,
  structure-striding six-legged Hexapod Landship, and laser-firing Zenith Doughnut.
- Tier 1–3 worker construction inheritance and a three-category build menu;
  Tier 1 and Tier 2 workers can construct the next Mech Factory to advance.
- Tiered generator, storage, relay, charger, mine, sentry, and salvage-yard
  variants with progressively stronger role-specific output and visible statistics.
- Higher-tier factories produce at provisional 1.25× and 1.5× throughput, while
  Tier 2 and Tier 3 sentries gain substantial damage, range, and reload upgrades.
- Completed Tier 2 and Tier 3 Mech Factories globally unlock one-step, in-place
  upgrades for existing tiered structures.
- A massive supply system with role- and tier-specific unit costs, queue
  reservations, and powered 8×6 Strategic Supply Complexes that upgrade from
  5,000 to 10,000 and 20,000 added capacity.
- Worker-driven building placement and construction.
- Active construction animation with rapidly working drone arms, a tool beam, and
  impact sparks that appear only while a worker is contributing build progress.
- Shift-queued building placement, with workers completing foundations in order.
- Collision-safe factory exits and spread rally formations for player and enemy units.
- Resumable and cancellable construction with abandoned-project recovery for AI workers.
- Elimination victory and defeat screens with a one-click fresh-match restart.
- A visible 40-unit construction grid with valid/blocked footprint previews and
  shared no-overlap rules for player and AI building placement.
- Edge-adjacent buildings can share grid boundaries without invisible placement gaps.
- Footprint-aware snapping and distinct one-cell through five-cell-wide building
  sizes, with every ordinary foundation edge aligned to a grid line.
- Compact Tier 1 infrastructure with 1×1 Generator and Battery footprints, 2×2
  Tier 1 factories, and progressively larger Tier 2 and Tier 3 buildings.
- Exact structure collision boundaries without extra invisible movement padding.
- Pulse Generators with visible, constant per-second output that never depletes.
- A concise HUD energy readout showing net building power per second and combined
  stored grid energy against capacity.
- Independent AI economies that continually expand, accelerate map control against
  fortified opponents, defend remote mines with sentries and local garrisons, and
  attack any opposing commander in grouped waves using the same rules as the player.
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

## Multiplayer

1. Both players choose **Multiplayer** from the start menu.
2. The host selects **Create lobby** and copies the 10-character lobby code.
3. The guest enters that code and selects **Join lobby** (or presses Enter).
4. The host adjusts the shared human-and-AI roster and map options.
5. The host selects **Start match** when the roster is ready.

The host commands the western base and the guest commands the eastern base. The
game connection is direct and requires internet access; PeerJS Cloud brokers the
initial handshake, with no account or dedicated gameplay server required. The host
owns the match state; guest commands appear immediately as predictions and are then
confirmed or corrected by ordered host updates. If a connection stalls, delayed
snapshots are replaced by the newest state instead of accumulating a stale backlog.

## Controls

- Use `WASD` to pan the camera and the mouse wheel to zoom around the cursor.
- Left-click a friendly unit or structure to select it.
- Left-click and drag to box-select units, or matching factories of the same type and tier; hold Shift to add compatible selections.
- Right-click terrain to move selected units.
- Press `G`, then right-click to force-move without engaging enemies en route.
- Right-click a hostile unit to attack it.
- Right-click an unfinished friendly building with selected workers to resume construction.
- Select an unfinished building and press `C` to cancel it for a partial refund.
- Press `Q` to use Overdrive with selected Bulwark Mechs.
- Select a worker to place buildings, or select a mech factory to queue units.
- Hold Shift while placing buildings to queue multiple foundations for the selected workers.
- With one production building or a matching factory group selected, right-click terrain to set the attack-move rally point for newly produced units.
- Press Space to pause or resume.

See `spec.md` for the game design and `AGENTS.md` for project implementation rules.
