# Crimson Dawn — Game Specification

Status: Early implementation. The target platform is the modern web browser using
JavaScript and Canvas. Exact balance values, faction roster, and networking model
remain undecided.

## 1. High Concept

Crimson Dawn is a real-time strategy game set in the future. Its central strategic
idea is that energy is required not only to run a base but also to keep an army
mobile and combat-capable. Players expand to secure metal, construct power
infrastructure, move energy toward the front, destroy enemy supply assets, and
recover metal from wrecked units.

The intended pressure is logistical rather than primarily mechanical: players
should make meaningful decisions about range, reserves, supply, and retreat without
having to babysit every ordinary unit.

## 2. Resources

### 2.1 Metal

Metal is the primary construction material for units and buildings.

Metal can be obtained from:

- Metal mines.
- Converting energy into metal.
- Reclaiming the wreckage of destroyed units.

### 2.2 Energy

Energy powers the base and military. It is required for:

- Buildings to operate.
- Units to move.
- Units to attack.
- Certain units to activate special abilities.
- Other future energy-consuming operations defined by unit or building data.

Energy can be obtained from power generators and high-output structures such as
nuclear reactors. Metal atomizers can convert metal into energy.

Generated energy is not automatically retained in a global pool. A player must
construct Grid Batteries to store surplus energy. The energy display reports total
stored energy against the combined capacity of all completed, surviving batteries.
Surplus generation is discarded when no connected battery has available capacity.

### 2.3 Resource Conversion

Converters transform energy into metal. Atomizers transform metal into energy.
Both processes must be lossy. Converting a resource and then converting the result
back must always return less than the original amount, preventing a closed
conversion loop from creating resources.

Conversion exists to let a player rebalance an economy, not to replace expansion,
mining, generation, or salvage.

## 3. Power and Energy Logistics

### 3.1 Building Power

Power-supply buildings provide energy to nearby buildings through local grids.
Generators, Grid Batteries, and powered relay towers connect nearby structures.
Relay towers extend a grid; ordinary consumers do not relay power through
themselves. A building outside an energized grid is disconnected and cannot perform
its normal function. The battlefield marks disconnected structures with a red
broken-grid indicator. A connected building that cannot receive enough energy is
shown as having no power.

Generators provide constant live energy to their connected grid and never consume
fuel or run out. Their energy-per-second output continues indefinitely, even when
there is nowhere to store surplus power. After current operational demand is met,
remaining generation charges connected batteries up to their individual charge
rates and storage capacities. A charged battery can energize its
local grid without a generator and counts as a power source while it discharges.
Battery discharge is rate-limited, so stored energy does not guarantee that an
arbitrarily large instantaneous demand can be served. Destroying a battery destroys
its stored energy and immediately removes its capacity from the player's total.

The current Grid Battery capacity, charge rate, discharge rate, cost, build time,
and distribution radius are provisional balance values.

The building roster may include:

- Standard power generators.
- High-output, high-risk reactors that can explode.
- Power relays or other local distribution buildings.
- Grid Batteries that provide finite energy storage and act as local power sources
  while discharging.
- Charging structures that replenish nearby units.

Power Relay Towers may chain together, allowing distant structures to connect only
when there is an unbroken powered path back to a generator or charged Grid
Battery. Destroying a relay can disconnect every downstream structure.

While the player is placing any building, the battlefield displays the coverage
areas of the player's completed, energized generators, Grid Batteries, and Power
Relay Towers. A placement preview for a generator, Grid Battery, or Power Relay
Tower also displays a static circle for the coverage it would provide from the
snapped construction location. The proposed circle remains visible in the invalid
placement color when the footprint cannot be built, so its range and placement
error can be evaluated together.

The Induction Charger displays a static circle marking its unit-recharge radius.
It must not show animated electrical fields or moving energy effects throughout
that circle.

The exact grid, radius, connection, and prioritization rules remain to be tested.

### 3.2 Unit Energy

Every mobile combat unit has an internal energy reserve. Moving, attacking, and
using an available special ability deduct energy. Different unit types may have
different battery capacity, movement efficiency, weapon costs, and reserve
behavior.

Units can replenish energy from:

- Friendly charging structures.
- Mobile energy-carrying units.
- Other explicitly defined supply sources.

Mobile energy suppliers carry a large reserve and transfer it to other units. They
are vulnerable logistical assets and should be valuable targets.

### 3.3 Shutdown and Stasis

When a unit no longer has enough energy to function or return to a supply source,
it shuts down and enters stasis.

While in stasis, the unit:

- Cannot move, attack, or use abilities.
- Cannot be controlled normally.
- Remains vulnerable to enemy attack and capture/reclamation rules that may be
  designed later.
- Slowly regenerates emergency energy.

Once it reaches a defined minimum reactivation threshold, it powers back on and
can be ordered toward a friendly energy source. Reactivation provides a recovery
chance, not a free return to full combat readiness.

The UI must warn players before units cross a dangerous reserve threshold and make
low-energy, stasis, and reactivated states visually distinct.

## 4. Units and Abilities

Most units are straightforward combat units with a clear role. The roster should
not be dominated by specialist units that perform unrelated or overly unusual
tasks.

A minority of units may have one or more special abilities. Each ability must:

- Consume energy when used or while maintained.
- Fit and deepen the unit's primary battlefield role.
- Present a meaningful timing or energy-reserve decision.
- Be clearly communicated to the opposing player when counterplay requires it.

Some abilities are available by default; others may be unlocked through a relevant
research building such as a Mech Lab.

Combat-capable units automatically attack hostile units that enter their weapon
range. Explicit movement, attack, stop, and hold-position commands remain
available. Commands are contextual rather than limited to special-ability buttons.
An explicit terrain move takes priority over an automatically acquired target:
units continue toward the destination while firing at enemies within range. A
force move, armed with `G` before right-clicking, ignores enemies until the units
reach their destination. Direct attack commands still pursue their chosen target.

Ground units treat completed buildings and unfinished foundations as solid
obstacles. Movement resolves against structure footprints and slides around them;
units cannot pass through buildings to reach a destination.

## 5. Production Branches and Technology Tiers

Production categories are parallel branches, not consecutive steps in a single
ladder.

| Production building | Available tiers | Produces |
| --- | --- | --- |
| Mech Factory | Tier 1, Tier 2, Tier 3 | Mechs and related ground units |
| Vehicle Plant | Tier 1, Tier 2, Tier 3 | Tanks, artillery, transports, and other vehicles |
| Aerospace Facility | Tier 2, Tier 3 | Air units; no Tier 1 aerospace facility exists |
| Experimental Facility | Tier 3 only | The most powerful experimental units |

A player may pursue mech and vehicle technology at the same tier. Advancing one
production branch does not inherently replace or advance another branch.

The precise method for moving a branch between tiers—upgrading an existing
building, constructing a higher-tier version, or unlocking it globally—remains
undecided.

There is no fixed cap on the number of factories or equivalent production
buildings a player may construct.

### 5.1 Worker Drones and Construction

Worker drones construct the player's primary buildings. Tier 1, Tier 2, and Tier 3
Mech Factories produce increasingly capable Tier 1, Tier 2, and Tier 3 Worker
Drones respectively. Advanced workers construct faster and may later gain access
to advanced building options.

Workers receive a placement order, travel to the site, and build the structure over
time. Metal is spent when placement is confirmed. Incomplete buildings remain
visible and vulnerable. Factories maintain production queues and consume power
while operating.

Completed units deploy to the nearest valid factory exit that does not overlap a
living structure or the battlefield boundary. If all factory exits are blocked,
the completed production order waits inside the factory until an exit becomes
available rather than creating an immobilized unit inside a building.

The player can select a production building and right-click terrain to set its
rally point. The interface displays the rally point and its path from the selected
building. Newly completed units automatically attack-move toward that point,
engaging hostile units they encounter along the way before continuing toward the
rally destination.

A new ordinary foundation snaps to footprint-aware centers on the visible 40-unit
construction grid, with every footprint edge aligned to a grid line, and must fit
inside the battlefield. Buildings use visibly different rectangular footprints,
from compact one-cell towers and turrets to multi-cell factories. A foundation
cannot overlap a living building, unfinished
foundation, worker, combat unit, or reclamation drone. Metal Mines instead snap to
their required deposit location. Invalid placement does not spend metal and reports
the reason to the player. The player sees a green or red footprint preview before
confirming placement, and the enemy AI searches nearby grid cells when its preferred
site is blocked.

An incomplete friendly building is a contextual construction target. Right-clicking
it with one or more selected workers assigns those workers to continue construction,
including when the original builder was destroyed or given another order. A worker
that enters energy stasis keeps its construction assignment and resumes traveling or
building after reactivation. An unfinished building with no surviving assigned
worker is visibly marked as paused and explains the right-click recovery command.

Selecting an unfinished friendly building exposes a Cancel Construction command,
also available with the `C` shortcut. Cancellation removes the foundation, releases
its assigned workers, and refunds 75% of the metal represented by its unbuilt
progress. Metal already represented by completed progress is not refundable. The
75% refund rate is provisional.

### 5.2 Economy and Static Defense Buildings

Metal Mines provide continuous income while connected to a functioning power
network. Static defenses automatically engage hostile targets within range,
consume grid energy when firing, and stop functioning when disconnected or
unpowered.

Static defenses charge an internal weapon capacitor continuously from their local
grid. A shot spends capacitor energy, allowing normal generator output to build up
between shots without requiring a Grid Battery to satisfy the entire weapon cost
in one simulation tick. The selected-defense interface displays weapon range,
capacitor charge, and current behavior such as charging, ready, tracking, or firing.

Metal Mines are location-constrained. They may only be constructed on unused,
map-defined metal deposits and snap to the selected deposit. A second mine cannot
occupy the same deposit while the existing mine remains alive. Power generators
and other energy-production buildings are not deposit-constrained and may be
constructed on any otherwise valid terrain.

### 5.3 Standard Match Start

The player and enemy each begin with exactly:

- Three Tier 1 Worker Drones.
- One Tier 1 Mech Factory.
- One power generator.

No mine, battery, relay, charger, reclamation yard, static defense, energy carrier,
or combat unit is pre-built. Both sides must use their workers and starting metal
to establish an economy and military.

## 6. Research and Military Improvements

Dedicated research or support buildings improve groups of units. Intended effects
include:

- Increased ground-unit attack.
- Increased ground-unit defense.
- Unlocking selected special abilities.
- Branch-specific improvements, such as mech upgrades from a Mech Lab.

Research buildings should reinforce strategic specialization while keeping unit
roles readable. Upgrade stacking, global versus local effects, research cost, and
research duration require later specification.

Potential research-building families include Mech Labs, Vehicle Labs, aerospace
research facilities, and broader ground-combat upgrade structures. These names are
descriptive placeholders until the factions and visual language are established.

## 7. Wreckage and Salvage

Destroyed units leave wreckage containing a portion of their original metal value.
Wreck fields turn locations of major battles into economic objectives.

### 7.1 Salvage Reclamation Yard

The Salvage Reclamation Yard is an optional economy building intended to become
more useful later in a match, when enough wreckage exists to justify automated
recovery. It is not an essential early-game economy structure.

Each yard controls three reclamation drones. Its default behavior is:

1. Find the nearest eligible unit wreck that is not already fully claimed by the
   yard's drones.
2. Dispatch an available drone to the wreck.
3. Mine or collect metal from that wreck.
4. Return the recovered metal to the yard.
5. Repeat while eligible wreckage remains.

Reclamation drones can be targeted and destroyed. A yard automatically rebuilds a
destroyed drone at no metal or energy cost to the player. Replacement should take
a defined amount of time, preventing instant replacement while preserving the
building's low-maintenance automation role. A yard can never have more than three
active or rebuilding drones.

If a reclamation drone is destroyed while carrying scrap, all carried metal drops
at the destruction location as a reclaimable scrap pile. Its replacement begins
empty.

Drone pathing, carrying capacity, collection time, replacement time, target
reservation, and behavior when the yard loses power remain tuning decisions. The
implementation must prevent multiple drones from indefinitely blocking one another
or collecting more metal than a wreck contains.

## 8. Enemy AI

The enemy AI performs the same categories of action as the player: gathering
metal, generating and relaying power, storing grid energy, constructing buildings
with workers, producing units, maintaining defenses, supplying unit energy,
fighting, and reclaiming wreckage. It uses the same simulation commands and pays
the same costs; it does not receive hidden free units or buildings.

The AI reassigns an available worker to an unfinished enemy foundation when its
original builder is destroyed or otherwise lost. If a preferred ordinary build
cell is blocked, it searches nearby valid grid cells; if a planned Metal Mine
deposit is unavailable, it searches the remaining deposits rather than abandoning
its construction plan.

The AI reserves enough metal for its next planned building before queueing ordinary
combat units. Replacing a missing worker takes priority over that reserve so the AI
cannot permanently lose its ability to construct.

Enemy combat units stage until four active attackers are ready, then launch as a
coordinated wave against one target. Newly produced attackers wait for a later wave
instead of crossing the map individually. Automatic attacks within weapon range
still allow staged units to defend themselves locally. The four-unit wave size is
provisional.

## 9. Initial Playable Scope

The first vertical slice should validate energy logistics and automated salvage,
not attempt the final unit roster. It should include:

- Metal storage and battery-limited energy storage.
- One metal mine and one generator.
- A local building-power rule.
- One charging structure.
- One Tier 1 production branch with a basic combat unit.
- One mobile energy supplier.
- Unit movement and weapon energy consumption.
- Stasis, emergency regeneration, and reactivation.
- Destroyed-unit wreckage.
- One Salvage Reclamation Yard with three destructible, freely replaced drones.
- At least one energy-consuming special ability, used to validate the ability
  framework without making abilities universal.

### 9.1 Technical Direction

The browser game is the production foundation, not a temporary prototype for a
future dedicated-engine port. Simulation rules remain separate from rendering and
input to enable deterministic tests, replay recording, future multiplayer
synchronization, and rendering optimizations within the web platform.

The battlefield uses Canvas rendering. Menus, command panels, accessibility
features, and other interface elements may use HTML and CSS where appropriate.

## 10. Open Design Questions

- How does a player choose whether a mobile supplier transfers energy, and how is
  its reserve protected from accidental depletion?
- Can enemies capture or reclaim units in stasis?
- Can reclamation drones enter dangerous territory automatically, or can the player
  constrain their operating radius?
- What happens to drones and carried salvage if their yard is destroyed?
- How are production tiers unlocked and represented?
- Are attack and defense upgrades global, branch-specific, or local to a command
  area?
- What factions, visual style, match length, and army scale best support the energy
  logistics loop?
