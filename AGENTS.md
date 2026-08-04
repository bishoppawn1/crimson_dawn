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
- Treat wreckage and disabled units as battlefield objectives, not merely visual
  remains.
- Keep metal/energy conversion lossy so reciprocal conversion cannot generate
  unlimited resources.
- Do not interpret factory categories as a linear tier ladder. Mech, vehicle, and
  aerospace production are parallel branches with their own available tech tiers.
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

## Working Conventions

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
