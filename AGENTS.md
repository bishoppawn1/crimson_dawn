# Crimson Dawn Project Instructions

## Product Direction

Crimson Dawn is a future-set real-time strategy game built around two connected
resources: metal and energy. Energy is both an economic resource and battlefield
logistics constraint. Armies that outrun their energy supply can become stranded,
while wrecked armies create metal-rich salvage opportunities.

The game is being built for modern web browsers using JavaScript and Canvas. Treat
this as the final game platform, not a temporary prototype intended for a later
engine port. Maintain clean simulation, presentation, and input boundaries because
they support testing, replays, multiplayer synchronization, and long-term web-game
development.

Treat `spec.md` as the authoritative design document. Update it whenever an
implementation decision establishes or changes player-facing behavior.

## Design Principles

- Make energy logistics strategically meaningful without turning ordinary unit
  control into constant micromanagement.
- Most units should have a clear, conventional battlefield role. Do not fill the
  roster with novelty specialists or unrelated gimmicks.
- Give special abilities to only a minority of units. Every ability must reinforce
  the unit's normal role and consume energy.
- Preserve meaningful counterplay. Mobile energy suppliers, reclamation drones,
  reactors, power relays, and other economic infrastructure must be attackable.
- Active units below the narrow emergency-energy threshold regenerate a slow
  trickle capped at that threshold. Keep it inside the broader low-energy warning
  band and high enough for every basic weapon, preventing sub-stasis units from
  permanently stalling without replacing the role of chargers and carriers.
- Player combat units automatically engage hostile units that enter weapon range
  unless a future stance rule explicitly prevents it.
- Surviving combat units on both teams retaliate against their aggressor and pursue
  it beyond automatic-acquisition range. Preserve force-move and existing explicit
  attack orders as higher-priority commands.
- Keep mobile units visually compact relative to buildings. Living units on either
  team maintain physical separation and may not stack at the same position.
- Mech silhouettes must read as upright bipedal machines from above: keep a visible
  rear hip bar, two articulated rear legs, and separated feet protruding beyond the
  torso rather than allowing the sprite to resemble a prone soldier.
- The enemy AI must use the same resource, power, construction, production,
  energy, combat, and salvage rules available to the player. Do not grant hidden
  free units or functional immunity to normal requirements.
- Multiplayer remains host-authoritative. A guest may predict and replay its
  unacknowledged commands for responsiveness, but it must not advance a separate
  canonical simulation between ordered host states. Coalesce delayed snapshots so
  network backpressure can never build an ever-older state queue.
- The enemy AI must establish and replenish a basic combat force before reserving
  metal for expensive infrastructure, and available defenders must respond
  immediately to player units or structures rushed near enemy infrastructure.
- After retreating from an outmatched engagement, an AI field force must complete a
  timed regroup and receive reinforcements before another ordinary assault. Do not
  let arrival at its fallback point immediately recycle the same units into a new
  wave; urgent defense inside the base-response radius remains exempt.
- A stable AI economy must deliberately progress through Tier 2 and Tier 3 Mech
  Factories, produce the matching advanced workers, and use those workers to add
  higher-tier economy, defense, support, and parallel-branch production buildings.
  Low-metal recovery and immediate defense may delay, but not permanently replace,
  this technology path.
- Worker drones construct the player's buildings. Mech factories produce the
  worker generation matching the factory tier.
- Worker drones carry weak, short-range defensive weapons, but an active build
  assignment takes strict priority over automatic targeting, retaliation, and
  firing. Do not count armed workers as combat units when forming AI armies.
- Holding Shift while placing foundations appends them to each selected worker's
  construction queue and keeps placement mode active. Preserve placement order;
  ordinary placement and explicit non-build commands replace the queued orders.
- Worker construction animation plays only while an active worker is in build
  range and contributing progress. Keep travel, stasis, paused, and completed
  states visually distinct from active construction.
- Do not impose an arbitrary cap on the number of production buildings a player
  may construct.
- Standard match starts give each side exactly three Tier 1 Worker Drones, one
  Tier 1 Mech Factory, one generator, and one completed Metal Mine on a nearby
  deposit within the starting power network. Do not pre-place other units or
  buildings.
- Metal Mines may only be constructed on unused map-defined metal deposits and
  snap to the deposit location. Energy-production buildings remain freely
  placeable on ordinary valid terrain.
- Ordinary buildings snap to the 40-unit construction grid. Player and AI
  construction must use the same footprint validation and may not overlap living
  structures, unfinished foundations, hostile units, or reclamation drones.
  Friendly player-controlled units do not block placement; move any overlapping
  friendly units outside the new foundation when construction is confirmed.
- Building-to-building placement uses exact visible grid footprints with no hidden
  collision padding. Adjacent footprints may share a grid edge.
- Do not add extra structure collision padding. Unit centers stop at their own
  physical radius from the exact structure footprint.
- Snap building centers according to footprint parity so every footprint edge lands
  on a grid line. Preserve distinct cell footprints for compact defenses, economy
  structures, and increasingly large factory tiers.
- Tier 1 generators, batteries, chargers, mines, towers, and turrets use compact
  1×1 footprints. Tier 2 Power Relay Towers also remain 1×1 so their value comes
  from improved grid reach and buffering rather than added placement burden. Tier
  1 factories use 2×2 footprints; other corresponding Tier 2 and Tier 3 buildings
  scale upward to 2×2/3×3 infrastructure and 3×3/4×4 factories.
- Every higher-tier structure must visibly improve the function that defines its
  role, not merely footprint size or durability. Surface those improvements in
  build, upgrade, and selected-structure UI text.
- Pulse Generators produce their stated energy-per-second rate continuously and
  never deplete or consume fuel. Battery capacity limits storage, not generation.
- The main HUD energy value shows total live production per second only. Keep
  stored energy and capacity in battery-specific details; do not restore a global
  `stored / capacity` counter.
- Keep the current expanded unit batteries at six times the original field-test
  capacities across workers, combat units, carriers, and enemy units unless a later
  balance instruction changes the multiplier.
- Keep the Induction Charger's recharge-radius circle static. Do not add animated
  electrical-field effects around its operating area. Its current large recharge
  radius is 260 world units.
- Induction Chargers charge every eligible unit in their field simultaneously.
  Divide scarce grid power fairly across recipients; never let unit iteration order
  cause one unit to monopolize the tick's available energy.
- Static defenses use an internal grid-charged weapon capacitor. Never require a
  generator to provide an entire per-shot energy cost inside one simulation tick.
- Full, idle Sentry Turrets consume no grid energy. They draw power only to refill
  capacitor energy spent by firing.
- Treat wreckage and disabled units as battlefield objectives, not merely visual
  remains.
- Allow multiple reclamation drones to harvest the same wreck or scrap pile at the
  same time. Partially loaded drones proceed directly to nearby piles and return
  only when full or no salvage remains. Preserve finite salvage and never collect
  more metal than remains.
- Keep metal/energy conversion lossy so reciprocal conversion cannot generate
  unlimited resources.
- Do not interpret factory categories as a linear tier ladder. Mech, vehicle, and
  aerospace production are parallel branches with their own available tech tiers.
- Keep the Zenith Doughnut circular in top-down view. Its continuous laser projects
  only into a small footprint directly beneath it, damages ground targets while the
  aircraft keeps moving, and never becomes a conventional ranged target-lock weapon.
- Avoid silently inventing factions, setting lore, or final balance numbers. Record
  unresolved decisions in the spec until they are tested or explicitly decided.

## Production Tiers

- Mech Factory: Tier 1, Tier 2, and Tier 3.
- Vehicle Plant: Tier 1, Tier 2, and Tier 3.
- Aerospace Facility: Tier 2 and Tier 3 only; there is no Tier 1 aerospace facility.
- Experimental Facility: Tier 3 only.

These branches may coexist at the same technological tier. A Vehicle Plant is not
an upgrade from a Mech Factory, and an Aerospace Facility is not an upgrade from a
Vehicle Plant.

## Implementation Priorities

When implementation begins, prove the core loop before expanding the roster:

1. Resource storage and income for metal and energy.
2. Building power demand, supply, and powered/unpowered behavior.
3. Per-unit energy storage plus movement, attack, and ability costs.
4. Unit shutdown, stasis regeneration, reactivation, and recovery.
5. Charging buildings and mobile energy transfer.
6. Wreck creation, salvage value, and automated reclamation drones.
7. Parallel production branches and tier prerequisites.
8. Research structures, upgrades, and selected unit abilities.
9. Worker-driven construction, factories, metal mines, and static defenses.
10. Enemy economic and military AI using player-equivalent simulation commands.

## Working Conventions

- Every completed change must be committed and pushed to `origin/main` before
  handoff. Do not leave completed task-scoped changes only in the local worktree.
- After each completed change request, run `npm test`, `npm run check`, and
  `git diff --check`. If validation passes, commit only the task-scoped files and
  push the commit to `origin/main`.
- Never force-push or destructively rewrite repository history. If validation or
  the push fails, report the blocker instead of pushing a knowingly failing change.
- Prefer data-driven definitions for units, buildings, weapons, abilities, costs,
  and upgrade effects.
- Separate simulation rules from presentation so economy and combat behavior can
  be tested deterministically.
- Keep the browser build dependency-light and runnable from a clean checkout.
- Prefer Canvas for the battlefield and accessible HTML controls for commands,
  menus, and information panels.
- Add tests for resource conservation, conversion loss, power loss/recovery,
  shutdown/reactivation thresholds, and reclamation-drone replacement.
- Use explicit placeholder values when tuning numbers are not yet decided, and
  label them as provisional in data or documentation.
