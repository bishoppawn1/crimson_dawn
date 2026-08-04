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

### 1.1 Battlefield Layout

The provisional field-test battlefield is 5,200 by 3,200 world units. It contains
27 map-defined Metal Mine deposits: 17 deposits distributed through the ordinary
expansion lanes and two distant frontier clusters containing five deposits each.
The Northern Frontier and Southern Frontier clusters sit near the far map edges,
well away from both starting bases, so controlling their concentrated metal
requires a substantial logistics commitment.

Grid-aligned ridges, shelves, and crags form impassable terrain. Their visible
rectangular boundaries use the same 40-unit grid as construction. Buildings and
upgrades cannot overlap them, and player units, enemy units, and reclamation drones
must travel around them. A move or rally command issued inside impassable terrain
resolves to its nearest reachable edge. Player construction and enemy AI placement
use the same terrain validation.

Each starting location also has four thin, grid-aligned wall segments arranged as
a shallow defensive enclosure. Two broken forward segments leave a central gate,
while short upper and lower segments leave the rear and corners open. These walls
are symmetrical, impassable, and unavailable for construction overlap. They slow a
direct opening rush without sealing either side into its base.

## 2. Resources

### 2.1 Metal

Metal is the primary construction material for units and buildings.

Metal can be obtained from:

- Metal mines.
- Converting energy into metal.
- Reclaiming the wreckage of destroyed units.

Most deposits are individually distributed, while remote frontier locations group
several deposits into high-value expansion objectives.

### 2.2 Energy

Energy powers the base and military. It is required for:

- Buildings to operate.
- Units to move.
- Units to attack.
- Certain units to activate special abilities.
- Other future energy-consuming operations defined by unit or building data.

Energy can be obtained from power generators and high-output structures such as
nuclear reactors. Metal atomizers can convert metal into energy.

Generated energy is not automatically retained in a global pool. Grid Batteries
provide the largest reserves, while Pulse Generators and Power Relay Towers include
smaller local buffers. Surplus generation is discarded only when every connected
storage structure is full or cannot accept more energy at its charge rate.

The main HUD energy readout displays the player's current net continuous building
balance, in energy per second, followed by the total stored grid energy and total
storage capacity. Net balance subtracts the current passive and active-production
demands of powered buildings from gross generation. A selected storage structure
also reports its own stored energy and capacity.

### 2.3 Resource Conversion

Converters transform energy into metal. Atomizers transform metal into energy.
Both processes must be lossy. Converting a resource and then converting the result
back must always return less than the original amount, preventing a closed
conversion loop from creating resources.

Conversion exists to let a player rebalance an economy, not to replace expansion,
mining, generation, or salvage.

### 2.4 Supply

Mobile units consume a data-defined amount of supply according to their role and
tier. Worker Drones use 1, 2, and 3 supply across Tiers 1–3; Vanguards use 4, 6,
and 8; Bulwarks use 8, 12, and 16; and Arc Energy Carriers use 6, 9, and 12.
Production orders reserve their full supply as soon as they enter a factory queue.
An order that would exceed capacity is rejected without spending metal. Destroyed
units and queues lost with a destroyed factory release their supply reservation.

Each side has a large baseline capacity of 1,000 supply. Completed, powered
Strategic Supply Complexes add capacity independently, so constructing multiple
complexes remains useful and there is no separate global hard cap. A Level 1
complex adds 5,000 supply. Its two powered upgrades increase that building's
contribution to 10,000 and then 20,000 supply. Losing power or destroying a complex
removes its contribution immediately; existing units remain alive when over
capacity, but new production cannot be queued until capacity recovers. All supply
costs, capacities, upgrade costs, and upgrade times are provisional balance values.

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
remaining generation charges connected storage structures up to their individual
charge rates and capacities. Dedicated Grid Batteries charge first, followed by
Power Relay Tower buffers and Pulse Generator buffers. Any charged storage
structure can energize its local grid while discharging. Discharge is rate-limited,
so stored energy does not guarantee that an arbitrarily large instantaneous demand
can be served. Destroying a storage structure destroys its stored energy and
immediately removes its capacity from the player's total.

The provisional storage values are: Pulse Generator, 80 capacity, 14 charge per
second, and 40 discharge per second; Grid Battery, 360 capacity, 48 charge per
second, and 180 discharge per second; Power Relay Tower, 30 capacity, 8 charge per
second, and 12 discharge per second. Their costs, build times, and distribution
radii are also provisional balance values.

The building roster may include:

- Standard power generators.
- High-output, high-risk reactors that can explode.
- Power relays or other local distribution buildings.
- Grid Batteries that provide finite energy storage and act as local power sources
  while discharging.
- Charging structures that replenish nearby units.

Power Relay Towers may chain together, allowing distant structures to connect only
when there is an unbroken powered path back to a generator or charged storage
structure. A charged relay can temporarily sustain its local downstream grid after
the live path is broken. Destroying a relay can disconnect every downstream
structure and loses that relay's stored reserve.

While the player is placing any building, the battlefield displays the coverage
areas of the player's completed, energized generators, Grid Batteries, and Power
Relay Towers. A placement preview for a generator, Grid Battery, or Power Relay
Tower also displays the coverage it would provide from the snapped construction
location. Grid-power coverage is represented exclusively as filled 40-world-unit
construction-grid cells with a square, grid-aligned boundary, never as a smooth
circle. A consumer connects when the grid cell containing its snapped building
center is one of those covered cells. Power-node connections use the same cells,
including when either node's field reaches the other node. The placement preview
explicitly reports whether the proposed building is inside or outside the power
grid, and invalid power-node previews retain the invalid-placement color so range
and placement errors can be evaluated together.

The Induction Charger displays a static circle marking its 260-world-unit
unit-recharge radius. This large field lets one charger support a broad staging
area without adding animated electrical-field effects.
It must not show animated electrical fields or moving energy effects throughout
that circle.

The exact grid reach and connection values remain to be tested.

### 3.2 Unit Energy

Every mobile unit has an internal energy reserve. Moving, attacking, and using an
available special ability deduct energy. Different unit types may have different
battery capacity, movement efficiency, weapon costs, and reserve behavior. The
current vertical-slice maximum energy capacity for every unit is six times its
original field-test value; these enlarged capacities remain provisional balance
values.

Units can replenish energy from:

- Friendly charging structures.
- Mobile energy-carrying units.
- Other explicitly defined supply sources.

The Induction Charger's current transfer rate is 112 energy per second, four times
its earlier field-test rate. Its transfer remains limited by the energy actually
available from the connected grid, and the value remains provisional. Every
eligible unit inside the field charges during the same simulation tick. When grid
power is scarce, the charger shares the available energy fairly among all eligible
units instead of charging them sequentially or allowing the first unit to consume
the entire supply.

Mobile energy suppliers carry a large reserve and automatically transfer energy to
nearby friendly non-carrier units that are not full. Their per-second output is
shared fairly among all eligible units in range, and every point delivered is
deducted from the supplier's own reserve. A supplier stops transferring at its
protected reserve and does not refill another mobile supplier. Selecting an Arc
Energy Carrier shows its transfer radius, and active supply links identify the
units currently receiving energy. Mobile suppliers are vulnerable logistical
assets and should be valuable targets.

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

An active unit below the emergency-energy threshold passively regenerates a small
reserve. This narrower threshold sits inside the broader low-energy warning band,
is high enough to fund every basic weapon, and prevents a unit that cannot afford
its next shot or movement from remaining permanently stalled. The regeneration is
slower than stasis recovery and stops at the emergency threshold. Chargers and
mobile suppliers are still required to restore normal combat endurance or a full
reserve.

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

Combat-capable units automatically attack hostile units, reclamation drones, and
structures—including unfinished foundations—that enter their weapon range.
Surviving combat units on either team retaliate when damaged: unless they are
force-moving or already following an explicit attack order, they abandon their
current automatic target or ordinary movement and pursue the aggressor. Retaliation
may carry them beyond their normal automatic-acquisition range.
Explicit movement, attack, stop, and hold-position commands remain available.
Commands are contextual rather than limited to special-ability buttons.
An explicit terrain move takes priority over an automatically acquired target:
units continue toward the destination while firing at enemies within range. A
force move, armed with `G` before right-clicking, ignores enemies until the units
reach their destination. Direct attack commands still pursue their chosen target.

Ground units treat completed buildings and unfinished foundations as solid
obstacles. Movement resolves against structure footprints and slides around them;
units cannot pass through buildings to reach a destination.

Mobile units use compact battlefield footprints so armies remain visually smaller
than bases and defensive structures. All living units, friendly or hostile,
maintain physical separation. Dense formations spread around one another instead
of occupying an unlimited stack at one position.

The Canvas battlefield uses role-readable, top-down mechanical sprites rather than
generic diamonds or side-view silhouettes. A mech's cockpit roof, shoulder deck,
dorsal armor, rearward legs, and forward-pointing weapons are visible from above.
Vanguard, Bulwark, Carrier, and hostile combat silhouettes remain distinct at
gameplay scale through their overhead equipment profiles. Worker Drones use a
compact multi-arm tool silhouette, while Arc Energy Carriers use a bipedal support
frame with a visible dorsal energy core. Player blue and enemy red appear only on
restrained identification panels, cockpit trim, and tier markings. Stasis state,
health, and energy remain separately visible.

## 5. Production Branches and Technology Tiers

Production categories are parallel branches, not consecutive steps in a single
ladder.

| Production building | Available tiers | Produces |
| --- | --- | --- |
| Mech Factory | Tier 1, Tier 2, Tier 3 | Mechs and related ground units |
| Vehicle Plant | Tier 1, Tier 2, Tier 3 | Tanks, artillery, transports, and other vehicles |
| Air Factory | Tier 1, Tier 2, Tier 3 | Air units |
| Experimental Facility | Tier 3 only | The most powerful experimental units |

A player may pursue mech and vehicle technology at the same tier. Advancing one
production branch does not inherently replace or advance another branch.

A completed Tier 2 Mech Factory globally unlocks Tier 2 upgrades for that team's
existing tiered structures. A completed Tier 3 Mech Factory does the same for Tier
3. Unlocks require a fully constructed factory; an unfinished foundation does not
count. Once earned, the team keeps the unlock even if that factory is later
destroyed. Higher-tier factories may still be constructed separately, and the current
field test includes constructible Vehicle, Air, and Experimental factories whose unit
rosters remain an unresolved design and implementation task.

There is no fixed cap on the number of factories or equivalent production
buildings a player may construct.

### 5.1 Tiered Mech Factory Roster

Every Mech Factory exposes four consistent production lines at its own tier:

| Production line | Battlefield role |
| --- | --- |
| Worker Drone | Construction and economic expansion |
| Vanguard Mech | Fast, efficient general-purpose combat and scouting |
| Bulwark Mech | Slower, durable frontline combat with the energy-consuming Overdrive ability |
| Arc Energy Carrier | Unarmed mobile energy storage and transfer support |

A Tier 1 Mech Factory produces the Tier 1 version of all four units. Tier 2 and
Tier 3 factories each produce a stronger version of the same four roles at their
matching tier rather than mixing lower-tier units into their menus. Higher-tier
copies improve the statistics relevant to their role: workers build faster,
Vanguards and Bulwarks become more combat-capable, and Arc Energy Carriers store
and transfer more energy. All current unit costs, production times, and tier-to-tier
stat increases are provisional balance values.

### 5.2 Worker Drones and Construction

Worker drones construct the player's primary buildings. Tier 1, Tier 2, and Tier 3
Mech Factories produce increasingly capable Tier 1, Tier 2, and Tier 3 Worker
Drones respectively. Construction options are grouped into persistent Tier 1,
Tier 2, and Tier 3 interface categories. Options above the selected worker's
capability remain visible but locked, making the route to the next construction
tier explicit.

Worker construction capability is cumulative:

- A Tier 1 Worker Drone constructs every Tier 1 building, including Tier 1 Mech,
  Vehicle, and Air factories. It also constructs the Tier 2 Mech Factory, which
  produces the Tier 2 Worker Drone.
- A Tier 2 Worker Drone inherits every Tier 1 option, constructs every Tier 2
  production, economy, logistics, and defense building, and constructs the Tier 3
  Mech Factory.
- A Tier 3 Worker Drone inherits every Tier 1 and Tier 2 option, constructs every
  Tier 3 building, and constructs the Experimental Factory.

Pulse Generators, Grid Batteries, Power Relay Towers, Induction Chargers, Metal
Mines, Sentry Turrets, and Salvage Reclamation Yards currently have separate Tier
1, Tier 2, and Tier 3 construction definitions. Higher-tier versions have larger
provisional costs, footprints, durability, demand, and role-specific output or
capacity. The Strategic Supply Complex remains a Tier 1 construction option with
its own internal upgrade levels rather than separate tiered foundations. All new
factory and building-variant balance values are provisional.

A player upgrades one selected completed structure at a time. Each upgrade advances
only one tier and costs the provisional difference between the target tier's metal
cost and the structure's current-tier metal cost. The conversion is immediate,
preserves the building's integrity percentage and retained energy up to the new
capacity, and keeps factory queues and rally orders. The larger target footprint
snaps to the nearest compatible grid center and must fit within the battlefield
without overlapping another structure, hostile unit, or reclamation drone. Friendly
units are moved clear. The Strategic Supply Complex continues to use its separate
internal supply-level upgrades rather than this structure-tier system.

Workers receive a placement order, travel to the site, and build the structure over
time. Metal is spent when placement is confirmed. Incomplete buildings remain
visible and vulnerable. Factories have an idle passive demand and add production
demand while the first queued unit is actively building. Provisional production
demands are 6 energy per second for Tier 1, 10 for Tier 2, and 16 for Tier 3, in
addition to their respective idle demands of 3, 5, and 8. Production pauses when
the local grid cannot supply the combined demand.

Completed units deploy to the nearest valid factory exit that does not overlap a
living structure, another living unit, or the battlefield boundary. If all factory exits are blocked,
the completed production order waits inside the factory until an exit becomes
available rather than creating an immobilized unit inside a building.

Each factory assigns successive completed units to distinct, deterministic
formation slots around its rally point. This applies equally to player and enemy
factories and prevents repeated output from continually converging on one coordinate.
Changing the rally point resets the formation sequence. Physical separation remains
active during movement as a fallback for dense groups and mixed orders.

The player can select a production building and right-click terrain to set its
rally point. The interface displays the rally point and its path from the selected
building. Newly completed units automatically attack-move toward that point,
engaging hostile units they encounter along the way before continuing toward the
rally destination.

A new ordinary foundation snaps to footprint-aware centers on the visible 40-unit
construction grid, with every footprint edge aligned to a grid line, and must fit
inside the battlefield. Buildings use visibly different rectangular footprints,
from compact one-cell towers and turrets to multi-cell factories. A foundation
cannot overlap a living building, unfinished foundation, hostile unit, or
reclamation drone. Friendly player-controlled units do not block placement. When a
foundation is confirmed beneath friendly workers or combat units, those units are
moved to the nearest clear edge outside its collision footprint; assigned builders
then begin construction from outside the foundation. Metal Mines instead snap to
their required deposit location. Invalid placement does not spend metal and reports
the reason to the player. The player sees a green or red footprint preview before
confirming placement, and the enemy AI searches nearby grid cells when its preferred
site is blocked.

Building-to-building validation uses the exact visible grid footprints. It adds no
invisible movement padding, so adjacent footprints—including compact one-cell
turrets and towers—may share an edge without overlapping. Unit movement still
stops at the moving unit's own physical radius from the exact structure footprint;
there is no additional structure-clearance padding.

Tier 1 infrastructure is deliberately compact. Pulse Generators, Grid Batteries,
Induction Chargers, Metal Mines, Power Relay Towers, and Sentry Turrets use 1×1
footprints. Tier 1 factories use 2×2 footprints. Equivalent Tier 2 infrastructure
uses 2×2 footprints and Tier 2 factories use 3×3 footprints; Tier 3 infrastructure
uses 3×3 footprints and Tier 3 factories use 4×4 footprints. Exceptional strategic
or experimental structures may use larger bespoke footprints.

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

### 5.3 Economy and Static Defense Buildings

Metal Mines provide continuous income while connected to a functioning power
network and passively consume 2 energy per second while operating. Other powered
economic buildings likewise apply their data-defined passive demand continuously.
Static defenses automatically engage hostile units, reclamation drones, and
structures within range and stop functioning when disconnected from an energized
network. These demand values remain provisional.

Static defenses charge an internal weapon capacitor continuously from their local
grid. A shot spends capacitor energy, allowing normal generator output to build up
between shots without requiring a Grid Battery to satisfy the entire weapon cost
in one simulation tick. The selected-defense interface displays weapon range,
capacitor charge, and current behavior such as charging, ready, tracking, or firing.
Sentry Turrets have no separate passive power demand: a full, idle turret consumes
no grid energy, and it draws power only when its capacitor needs to replace energy
spent firing.

The Strategic Supply Complex is an exceptionally large 8-by-6-grid-cell economic
building. It costs 1,200 metal, takes 40 seconds to construct, and passively draws
6 energy per second. Its Level 2 upgrade costs 800 metal and takes 25 powered
seconds; its Level 3 upgrade costs 1,600 metal and takes 40 powered seconds. An
upgrade adds another 6 energy per second of demand while progressing and pauses
without adequate local-grid power. The enemy AI constructs and upgrades the same
building through the same paid commands available to the player.

Metal Mines are location-constrained. They may only be constructed on unused,
map-defined metal deposits and snap to the selected deposit. A second mine cannot
occupy the same deposit while the existing mine remains alive. Power generators
and other energy-production buildings are not deposit-constrained and may be
constructed on any otherwise valid terrain.

### 5.4 Standard Match Start

The player and enemy each begin with exactly:

- Three Tier 1 Worker Drones.
- One Tier 1 Mech Factory.
- One power generator.
- One completed Metal Mine on a nearby map-defined metal deposit, within the
  starting generator's power network.

The starting mine provides a guaranteed metal income so spending the initial metal
cannot leave either side unable to construct anything. No battery, relay, charger,
reclamation yard, static defense, energy carrier, or combat unit is pre-built. Both
sides use their workers and starting metal income to expand their economy and
military.

### 5.5 Match End and Restart

A player wins when the opposing side has no living units and no living buildings.
The same elimination rule causes defeat when the player has no living units and no
living buildings. Active, stasis, and unfinished entities count while they remain
alive; wrecks and reclamation drones do not postpone elimination. If both sides are
eliminated by the same resolution, the player receives a defeat.

The simulation stops advancing once the result is decided. The battlefield displays
`You win.` or `You lose.` with an explanation and a restart button. Restarting creates
a fresh standard match with its normal starting forces, resources, terrain, and AI.

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

1. Find the nearest eligible unit wreck or scrap pile with metal remaining. More
   than one drone may choose the same pile.
2. Dispatch an available drone to the wreck.
3. Mine or collect metal from that wreck.
4. If the drone still has carrying capacity when the pile is exhausted, travel
   directly to the nearest remaining eligible pile and continue collecting.
5. Return the recovered metal to the yard only when the drone is full or no
   eligible salvage remains.
6. Repeat while eligible wreckage remains.

Reclamation drones can be targeted and destroyed. A yard automatically rebuilds a
destroyed drone at no metal or energy cost to the player. Replacement should take
a defined amount of time, preventing instant replacement while preserving the
building's low-maintenance automation role. A yard can never have more than three
active or rebuilding drones.

If a reclamation drone is destroyed while carrying scrap, all carried metal drops
at the destruction location as a reclaimable scrap pile. Its replacement begins
empty.

Drone pathing, carrying capacity, collection time, replacement time, and behavior
when the yard loses power remain tuning decisions. Multiple drones may harvest the
same wreck concurrently, but the implementation must preserve its finite metal and
prevent them from collecting more than the pile contains.

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

Before spending metal on a consumer, battery, or relay, the AI verifies that the
finished building can attach to an existing energized power node. A relay whose
preferred position is beyond the current grid is moved to the connected edge of
the network so it extends the grid toward the intended destination. The AI also
budgets factories at their active-production demand; when a planned building would
raise projected steady demand above completed generator output, it constructs and
finishes another generator beside that expansion before resuming the original
plan. It does not knowingly place disconnected consumers or expand demand beyond
its steady generation capacity.

The AI makes its first decision after one second and reevaluates every second. Its
opening prioritizes a battery, local static defense, a charger, and a three-unit
combat force before expensive infrastructure. The Strategic Supply Complex is not
part of a fixed build sequence: the AI constructs one only when its remaining
supply falls to 10 percent of current capacity or less, and it purchases each
later capacity upgrade only when supply becomes that constrained again. Once the
initial force is secured, the AI reserves enough metal for its next currently
needed building before queueing ordinary combat units. Replacing a missing worker
and rebuilding a deployed or destroyed combat reserve take priority over that
building reserve.

After establishing its opening battery, defense, and charger, the AI begins paid
economic expansion instead of relying indefinitely on its starting mine. It seeks
the nearest unused non-frontier deposit first, constructs a normally vulnerable
generator outpost within power range when needed, and then has a worker construct
the mine. Expansion has no mine-count cap or fixed deposit sequence: after the
basic opening is covered, the AI maintains at least two mines and seeks another
whenever its available metal is at or below 400 or reaches a 900-metal expansion
surplus. There is no upper mine limit, so recurring economic pressure or later
surpluses can carry expansion across the entire map. It prefers non-frontier
deposits before farther frontier deposits and reevaluates ownership and placement
on every decision, so deposits already claimed by either side or temporarily
blocked by hostile units are skipped. Construction costs, travel, construction
time, power demand, and destruction all use normal simulation rules. The metal
decision thresholds are provisional.

Enemy combat units stage until three active attackers are ready, then launch as a
coordinated wave against one target. Newly produced attackers wait for a later wave
instead of crossing the map individually. Automatic attacks within weapon range
still allow staged units to defend themselves locally. If a player unit or structure
appears within 800 world units of enemy infrastructure, available defenders respond
immediately without waiting for a complete wave. If at least three completed player
Sentry Turrets are clustered within 420 world units of one another, ordinary assault
waves grow from three to five units. An assault force more than 800 world units from
its generator fallback retreats toward that generator when hostile combat strength
within 520 world units exceeds its nearby strength by a factor of 1.5. Retreat uses
a normal force-move command, so the units disengage and regroup rather than continuing
an obviously losing attack. The cadence, response radius, strength estimate, defense
cluster, retreat, and wave-size values are provisional.

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

The standard battlefield is currently 3200 by 1800 world units, four times the
area of the original 1600-by-900 field test. The 1600-by-900 Canvas is a movable
viewport rather than the full map. `WASD` pans the camera, and the mouse wheel
zooms from 50% to 200% around the world position beneath the pointer. Camera
movement remains available while the simulation is paused, and the camera is
clamped so it cannot expose space beyond the battlefield boundary.

## 10. Open Design Questions

- How does a player choose whether a mobile supplier transfers energy, and how is
  its reserve protected from accidental depletion?
- Can enemies capture or reclaim units in stasis?
- Can reclamation drones enter dangerous territory automatically, or can the player
  constrain their operating radius?
- What happens to drones and carried salvage if their yard is destroyed?
- Are attack and defense upgrades global, branch-specific, or local to a command
  area?
- What factions, visual style, match length, and army scale best support the energy
  logistics loop?
