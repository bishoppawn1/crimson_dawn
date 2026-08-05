# Crimson Dawn — Game Specification

Status: Early implementation. The target platform is the modern web browser using
JavaScript and Canvas. Exact balance values and faction roster remain undecided.

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

Two-player field tests provide five selectable 5,200-by-3,200 battlefields. Every
player count from three through eight provides three additional maps sized and
arranged for that exact number of commanders, for 23 maps total. Single-player lets
the human choose any map valid for the selected player count. Larger maps scale from
5,960 by 4,480 to 8,560 by 6,280 world units, with evenly distributed starting
positions, nearby expansion deposits, contested central deposits, and terrain
arranged around the full battlefield rather than a two-sided lane.

Each three- through eight-player catalog contains three materially different layout
families: layered inner and outer crag rings, dense ancient ruin complexes, and long
fault walls that divide the battlefield into spokes. These maps place two substantial
outer landmarks between each neighboring pair of starting sectors, so expansion
routes, flanks, and perimeter travel have terrain decisions instead of leaving most
structures clustered around the center. The three-player **Ancient Triad** is
especially ruin-heavy, with collapsed arches, pillar fields, courtyards, a broken
central sanctuary, and ancient districts extending into the outer battlefield.

Multiplayer does not provide a map veto or manual picker. When the host starts the
match, it randomly selects one of the maps valid for the current lobby size. The
chosen map identity and complete map state are included in the authoritative
snapshot sent to the guest.

- **Broken Frontier** contains 27 Metal Mine deposits, fortified starting bases,
  central divides, and two distant five-deposit frontier clusters.
- **Ashen Divide** uses 19 deposits and a broken vertical spine that creates two
  major contested attack lanes.
- **Iron Crossings** uses 21 deposits and four central iron masses that create
  narrow horizontal and vertical crossroads, with additional outcrops guarding the
  outer approaches.
- **Ruined Meridian** uses dense ancient walls and shattered arches around a rich
  central vault.
- **Twin Calderas** encloses two large basins around a fractured central pass and
  places fracture spires along its outer routes.

Every map preserves the standard starting package at every commander position.
Map identities, terrain, starts, and deposits are data-driven and all current
layouts remain provisional for balance testing.

A tactical minimap occupies the top-right corner of the battlefield. It always
shows the complete map at a fixed overview scale, including terrain, deposits,
living structures, and every living mobile unit. Friendly and opposing units use
their team colors as compact dots, while the current camera view appears as a white
rectangle. Left-clicking the minimap recenters the battlefield camera.

The battlefield ground uses muted olive vegetation and broad earthen-brown patches
with a subtle fixed mottled texture. Construction-grid lines remain visible across
both surfaces. This brighter natural palette separates neutral gray unit armor from
the ground while preserving the readability of team markings, range overlays, and
placement indicators.

Buildings use a detailed top-down industrial style rather than abstract geometric
icons. Cast foundations, roof bevels, shadows, vents, fasteners, access panels,
hazard markings, and team-colored powered components provide a shared visual
language. Each family retains recognizable working machinery: generators expose
turbine cores, batteries show cell banks and charge levels, relay towers use braced
masts, chargers use copper induction coils, mines show excavation and conveyor
equipment, and each factory branch has a distinct production-bay layout. Unfinished
structures display foundation framing and construction rails instead of appearing
as translucent copies of completed buildings.

Grid-aligned ridges, shelves, and crags form impassable terrain. Their visible
rectangular boundaries use the same 40-unit grid as construction. Buildings and
upgrades cannot overlap them, and player units, enemy units, and reclamation drones
must travel around them. A move or rally command issued inside impassable terrain
resolves to its nearest reachable edge. Player construction and enemy AI placement
use the same terrain validation.

Each starting location also has four thin, grid-aligned wall segments arranged as
a shallow defensive enclosure. Two broken forward segments leave a central gate,
while short upper and lower segments leave the rear and corners open. These walls
are symmetrical, impassable to ground units, and unavailable for construction
overlap. Aircraft and hovering reclamation drones pass directly over them. The
walls slow a direct ground rush without sealing either side into its base.

## 2. Resources

### 2.1 Metal

Metal is the primary construction material for units and buildings.

Metal can be obtained from:

- Metal mines.
- Converting energy into metal.
- Reclaiming the wreckage of destroyed units.

Most deposits are individually distributed, while remote frontier locations group
several deposits into expansion objectives. Distance from a starting base does not
change a deposit's yield or color. Explicit **Rich Metal Deposits** provide a
provisional 1.5× multiplier to any Metal Mine built on them and are marked yellow;
ordinary deposits use the same neutral appearance whether nearby or remote.

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

The Tier 2 Power Relay Tower keeps the Tier 1 tower's compact 1×1 footprint while
improving every relay function: its provisional relay reach is 285 world units, its
buffer stores 55 energy, and it charges/discharges at 14/22 energy per second. On
the 40-unit power grid its valid 1×1 placement centers produce a 15×15-cell coverage
field, compared with the Tier 1 tower's 13×13 cells. Selected relays display these
range and buffer-transfer values directly in the structure details.

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
Firing is presented as a short physical sequence with a fixed muzzle origin,
weapon recoil, a visible moving tracer or shell, and a brief impact flash. Heavy
cannons and artillery use slower, weightier projectiles and larger impacts than
rapid weapons. These effects use the authoritative attack event's firing-time
positions; they do not stretch from a shooter or target that moves after the shot,
and they do not change deterministic hit resolution or established damage timing.
Surviving combat units on either team retaliate when damaged: unless they are
force-moving or already following an explicit attack order, they abandon their
current automatic target and pursue the aggressor. Retaliation may carry them beyond
their normal automatic-acquisition range. If the unit was following an ordinary
movement route, that destination remains saved while it retaliates and resumes after
the aggressor is destroyed or is no longer a valid target.
Explicit movement, attack, stop, and hold-position commands remain available.
Commands are contextual rather than limited to special-ability buttons.
An explicit terrain move remains as a resumable route when a unit acquires a hostile
in weapon range. The unit stops in place, attacks while stationary—including between
shots during its weapon cooldown—and continues toward the saved destination after
the enemy is destroyed or leaves the engagement. A unit never fires and translates
under its own movement in the same simulation tick. A force move, armed with `G`
before right-clicking, ignores enemies until the units reach their destination.
Direct attack commands still pursue their chosen target, stopping once they enter
weapon range before firing.

Raiders are fast, long-endurance harassment units rather than line fighters. Their
provisional profile uses 108 movement speed, 105 integrity, efficient movement, and
a 1.75× damage multiplier against structures. When acquiring targets automatically,
they prefer exposed generators, batteries, relay towers, chargers, mines, salvage
yards, supply complexes, and factories over units or static defenses in the same
area. Explicit attack orders and retaliation remain higher priority. Their ordinary
anti-unit damage remains deliberately weaker than a Tier 1 Vanguard's.

Ground units treat completed buildings and unfinished foundations as solid
obstacles. Movement uses deterministic multi-corner routing around compound terrain
and exact structure footprints, with collision-time sliding retained as a safety
fallback. Routes may use multiple corners to escape concave obstacle arrangements
and are recomputed when a moving target shifts or a route becomes blocked. Group
orders stagger those route computations across simulation ticks so large armies do
not rebuild every visibility graph in the same frame. At most four full visibility
searches run in one simulation tick; units waiting for a search continue using
collision sliding until their deterministic turn. Route searches first use cached
obstacle bounds near the movement corridor and deterministically fall back to the
complete obstacle set when the local graph cannot find a valid path. Units
cannot pass through buildings to reach a destination, and move orders placed inside
a structure resolve to the nearest reachable edge of its visible footprint.

Aircraft use a separate air movement layer. They fly directly over impassable
terrain, completed structures, and foundations, but remain constrained by the map
boundary, their movement-energy cost, and physical separation from other living
units. Aircraft emphasize speed over survivability: the standard air roster moves
at 105–200 world units per second and has lower provisional integrity than its
previous profiles. The experimental Zenith Doughnut likewise trades part of its
integrity for a higher 52-unit movement speed.

Ordinary weapons deal a provisional 0.55× damage multiplier against aircraft.
Dedicated anti-air weapons instead deal 2× damage and automatically prefer an
aircraft when both air and ground targets are in range. Skyguard Mechs, Flak
Crawler vehicles, and Flak Turrets are the current dedicated counters. They may
still fire at ground targets for their listed base damage, but an incidental ground
target never pulls their automatic targeting away from an aircraft in range.

Mobile units use compact battlefield footprints so armies remain visually smaller
than bases and defensive structures. All living units, friendly or hostile,
maintain physical separation. Dense formations spread around one another instead
of occupying an unlimited stack at one position.

The Canvas battlefield uses role-readable, top-down mechanical sprites rather than
generic diamonds or side-view silhouettes. A mech's cockpit roof, shoulder deck,
dorsal armor, compact rear hip machinery, and forward-pointing weapons are visible
from above. The torso occludes the lower walking assembly while stationary. During
movement, only small alternating rear actuator and foot tips briefly emerge from
beneath the chassis; they travel along the direction of movement rather than
swinging laterally, so the mech never reads as swimming, paddling, prone, or
crawling. The Vanguard uses a narrow arrowhead chassis and long canopy, while the
Bulwark uses a broad slab-sided hull, short wide canopy, shield, and twin cannon so
the two roles remain distinct without relying mainly on scale.
Vanguard, Bulwark, Skyguard, Carrier, and hostile combat silhouettes remain distinct at
gameplay scale through their overhead equipment profiles. Layered armor plates,
panel seams, joints, cooling vents, fasteners, and weapon or support housings add
detail without enlarging unit footprints. Directional lighting, offset ground
shadows, sparse edge wear, articulated movement, and units turning toward movement,
construction, transfer, or combat targets give the machinery a grounded physical
presence. Vehicles expose wheels or track rollers, engine grilles, exhausts, and
complete turret assemblies; aircraft expose engine nacelles, control surfaces,
hardpoints, and navigation lights. Skyguards expose paired shoulder missile racks
and a central tracking dish, Flak Crawlers use four short autocannons and a rear
tracking dish, and Flak Turrets use compact multi-barrel mounts. Worker Drones use articulated multi-arm tool
machinery, while Arc Energy Carriers use a bipedal support frame with a visible
dorsal energy core. Player blue and enemy red appear only on restrained
identification panels, cockpit trim, and tier markings. Stasis state, health, and
energy remain separately visible.

Aircraft roles use independent silhouettes rather than one shared airframe with
minor attachments. Interceptors have needle noses, swept delta wings, and twin tail
fins; Gunships use short armored fuselages, straight weapon wings, large paired
engine nacelles, and visible cannons; Bombers are broad tailless flying wings with
recessed payload bays; and Energy Tenders use narrow transport bodies dominated by
two long external energy cylinders and illuminated transfer conduits. Tier 3 models
retain their role silhouette while adding extra control surfaces, exhausts, armor,
or energy-system markings.

## 5. Production Branches and Technology Tiers

Production categories are parallel branches, not consecutive steps in a single
ladder.

| Production building | Available tiers | Produces |
| --- | --- | --- |
| Mech Factory | Tier 1, Tier 2, Tier 3 | Mechs and related ground units |
| Vehicle Factory | Tier 1, Tier 2, Tier 3 | Scout Vehicles, Battle Tanks, Mobile Artillery, Flak Crawlers, and Grid Tankers |
| Air Factory | Tier 2, Tier 3 | Interceptors, Gunships, Bombers, and Energy Tenders |
| Experimental Factory | Tier 3 only | Arsenal Colossus, Hexapod Landship, and Zenith Doughnut |

A player may pursue mech and vehicle technology at the same tier. Advancing one
production branch does not inherently replace or advance another branch.

A completed Tier 2 Mech Factory globally unlocks Tier 2 upgrades for that team's
existing tiered structures. A completed Tier 3 Mech Factory does the same for Tier
3. Unlocks require a fully constructed factory; an unfinished foundation does not
count. Once earned, the team keeps the unlock even if that factory is later
destroyed. Higher-tier factories may still be constructed separately. The current
field test includes complete provisional Vehicle, Air, and Experimental Factory
rosters.

There is no fixed cap on the number of factories or equivalent production
buildings a player may construct.

### 5.1 Tiered Mech Factory Roster

Every Mech Factory exposes five consistent production lines at its own tier:

| Production line | Battlefield role |
| --- | --- |
| Worker Drone | Construction and economic expansion |
| Vanguard Mech | Fast, efficient general-purpose combat and scouting |
| Bulwark Mech | Slower, durable frontline combat with the energy-consuming Overdrive ability |
| Skyguard Mech | Mobile missile defense with extra damage against aircraft |
| Arc Energy Carrier | Unarmed mobile energy storage and transfer support |

A Tier 1 Mech Factory produces the Tier 1 version of all five units. Tier 2 and
Tier 3 factories each produce a stronger version of the same five roles at their
matching tier rather than mixing lower-tier units into their menus. Higher-tier
copies improve the statistics relevant to their role: workers build faster,
Vanguards, Bulwarks, and Skyguards become more combat-capable, and Arc Energy
Carriers store and transfer more energy. All current unit costs, production times,
and tier-to-tier stat increases are provisional balance values.

### 5.2 Vehicle and Air Factory Rosters

Every Vehicle Factory produces five conventional ground and logistics roles at the
factory's matching tier:

| Production line | Battlefield role |
| --- | --- |
| Scout Vehicle | Fast ground reconnaissance and light combat |
| Battle Tank | Durable direct-fire frontline combat |
| Mobile Artillery | Long-range fire support |
| Flak Crawler | Mobile rapid-fire anti-air defense |
| Grid Tanker | Armored mobile energy storage and transfer support |

Air production begins at Tier 2; there is no Tier 1 Air Factory. Tier 2 and Tier 3
Air Factories each produce matching-tier versions of four aircraft roles:

| Production line | Battlefield role |
| --- | --- |
| Interceptor | Fast aerial combat |
| Gunship | Durable aerial assault |
| Bomber | Heavy aerial strikes |
| Energy Tender | Airborne mobile energy storage and transfer support |

The Grid Tanker and Energy Tender automatically and fairly distribute energy to
nearby eligible allies without crossing their protected reserve, using the same
resource-conserving transfer rules as the Arc Energy Carrier. Aircraft fly over
terrain and buildings. Every higher-tier vehicle or aircraft
improves the integrity, energy storage, and combat statistics relevant to its role.
All current unit costs, production times, energy budgets, and tier-to-tier stat
increases are provisional balance values.

#### Experimental Factory roster

The Tier 3 Experimental Factory produces exactly three enormous strategic units:

| Production line | Battlefield role |
| --- | --- |
| Arsenal Colossus | Huge assault mech carrying eight visible weapon systems and firing a converging multi-projectile salvo |
| Hexapod Landship | Six-legged walking battleship with three siege cannons, extreme durability, and the ability to stride across living building footprints |
| Zenith Doughnut | Giant circular toroidal aircraft whose central aperture projects a sustained high-energy laser straight down; its player-facing description is “Mmm, tasty!” |

The Hexapod Landship remains a ground unit: impassable terrain and living units
still constrain it, but buildings are excluded from its destination validation,
path planning, and movement collisions. Its three cannons fire a converging shell
salvo. Shell damage resolves when the visible projectiles reach their target, not
when the firing order begins. Its six legs use a deliberate pull-step gait: each
pair reaches toward the travel direction, plants its feet against the ground, and
pulls the hull forward before releasing and reaching again. The Zenith Doughnut
ignores terrain and structures. Its laser has no horizontal firing range, remains
centered beneath the aircraft, and automatically damages every hostile ground unit
or structure inside its small footprint without stopping movement. Players attack
by routing the aircraft over enemy assets; attack commands on ground targets are
interpreted as movement to the target position. The laser cannot damage aircraft
and consumes energy continuously while it is damaging at least one target. All
three use ordinary paid production, supply, movement-energy, weapon-energy, damage,
destruction, and salvage rules. The Zenith's current provisional movement speed is
58 world units per second. All experimental balance values remain provisional.

### 5.3 Worker Drones and Construction

Worker drones construct the player's primary buildings. Tier 1, Tier 2, and Tier 3
Mech Factories produce increasingly capable Tier 1, Tier 2, and Tier 3 Worker
Drones respectively. Construction options are grouped into persistent Tier 1,
Tier 2, and Tier 3 interface categories. Options above the selected worker's
capability remain visible but locked, making the route to the next construction
tier explicit.

Every Worker Drone carries a weak, energy-consuming, short-range defensive weapon.
Its provisional range and damage improve slightly with worker tier but remain well
below dedicated combat units. Provisional damage per shot is 4, 5, and 6 for Tier
1, Tier 2, and Tier 3 workers respectively. Workers automatically defend themselves
when idle, but a worker assigned to a living unfinished structure does not acquire
targets, retaliate, or fire until that construction assignment ends. Defensive
armament does not make workers members of AI attack waves or expansion garrisons.

Worker construction capability is cumulative:

- A Tier 1 Worker Drone constructs every Tier 1 building, including Tier 1 Mech
  and Vehicle Factories. It also constructs the Tier 2 Mech Factory, which
  produces the Tier 2 Worker Drone.
- A Tier 2 Worker Drone inherits every Tier 1 option, constructs every Tier 2
  production, economy, logistics, and defense building, and constructs the Tier 3
  Mech Factory.
- A Tier 3 Worker Drone inherits every Tier 1 and Tier 2 option, constructs every
  Tier 3 building, and constructs the Experimental Factory.

The worker construction interface presents exactly three independently collapsible
boxes labeled Tier 1, Tier 2, and Tier 3. Players may open or close each box at any
time. Within an open box, structures the current worker selection can build and
afford are displayed brightly, while structures blocked by worker tier or current
metal are dimmed but remain visible so the progression path stays clear.

Pulse Generators, Grid Batteries, Power Relay Towers, Induction Chargers, Metal
Mines, Sentry Turrets, Mortar Turrets, Flak Turrets, and Salvage Reclamation Yards
currently have separate Tier 1, Tier 2, and Tier 3 construction definitions.
Higher-tier versions have larger provisional costs, footprints, durability,
demand, and role-specific output or capacity. The Strategic Supply Complex remains
a Tier 1 construction option with
its own internal upgrade levels rather than separate tiered foundations. All new
factory and building-variant balance values are provisional.

Every higher tier must provide a visible functional improvement, not merely a
larger model or more durability. Generators improve output and grid reach;
batteries improve storage and transfer throughput; relays improve reach and
buffering; chargers improve field size and recharge throughput; mines improve
metal income; reclamation yards field more drones with faster replacement; and
factories gain provisional production-speed multipliers of 1.0×, 1.25×, and 1.5×.
Sentry Turrets scale especially clearly: provisional Tier 1/Tier 2/Tier 3 weapon
profiles are 18/34/60 damage, 185/265/360 range, and 0.75/0.68/0.55-second reloads.
Mortar Turrets provide slower indirect fire at 140–420, 160–550, and 180–700
minimum-to-maximum range across the three tiers. A Mortar Turret never acquires or
fires on a target whose center is inside its minimum range, creating a deliberate
close-range dead zone. Its selected range display shows both boundaries.
Flak Turrets scale from 8/13/20 base damage, 225/285/360 range, and
0.38/0.32/0.27-second reloads while retaining their 2× aircraft multiplier.
Build controls, upgrade controls, and selected-structure details display the
role-defining statistics so these advantages are apparent before metal is spent.

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
time. Holding Shift while confirming additional foundations appends them to every
selected worker's construction queue without interrupting the current project, and
keeps placement mode active for further orders. Workers advance through valid
foundations in placement order. Ordinary non-Shift placement replaces the current
construction order and clears its queue, as do explicit move, attack, stop, and
hold-position commands. A cancelled queued foundation is skipped. Metal is spent
when each placement is confirmed. Incomplete buildings remain visible and vulnerable.
When one or more workers with construction orders are selected, the interface shows
each worker's active foundation and its shared live construction percentage, followed
by the remaining foundations in placement order.
Factories have an idle passive demand and add production
demand while the first queued unit is actively building. Provisional production
demands are 6 energy per second for Tier 1, 10 for Tier 2, and 16 for Tier 3, in
addition to their respective idle demands of 3, 5, and 8. Production pauses when
the local grid cannot supply the combined demand.

An active Worker Drone visibly accelerates its articulated tool arms and projects a
short construction beam with impact sparks while it is in build range and actively
contributing progress. The effect stops while the worker is traveling, paused, in
stasis, or after the foundation completes, so the animation communicates actual
construction state rather than merely the presence of a build order.

Worker Drones also repair damaged friendly mobile units and completed buildings.
Right-clicking a damaged friendly target with workers selected replaces their
current orders, sends them into repair range, and suppresses automatic combat until
the repair finishes or receives a replacement command. Workers are valid repair
targets for other workers, but a worker can never repair itself. Multiple workers
may repair the same target. Repairs consume no metal and provisionally restore
8/13/20 integrity per second at Tiers 1/2/3, spending 0.5 worker energy per point of
integrity restored; a worker that exhausts its battery enters ordinary stasis and
keeps the repair assignment for when it reactivates. Active repair uses a green
tool beam distinct from construction.

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
rally point. Dragging a selection box around two or more friendly factories of the
same branch and tier selects them as a factory group; other factory types and tiers
are not mixed into that group. Right-clicking terrain then assigns one shared rally
point atomically to every selected factory. Their formation slots are interleaved so
combined production does not assign duplicate rally destinations. The interface
displays the rally point and a path from every selected factory. Newly completed
units automatically move toward that point, stopping to engage hostile units they
encounter along the way before continuing toward the rally destination.
For a selected factory, the interface identifies the unit currently in production,
shows its live completion percentage and power or deployment wait state, and lists
every later order in queue order. When a matching factory group is selected, each
factory's independent queue appears as a separate status card.

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
Induction Chargers, Metal Mines, Power Relay Towers, Sentry Turrets, and Mortar
Turrets use 1×1 footprints. Tier 1 factories use 2×2 footprints. Equivalent Tier 2
infrastructure uses 2×2 footprints except for the Tier 2 Power Relay Tower, which
remains 1×1. Metal Mines are permanently capped at 2×2: both their Tier 2 and Tier 3
versions use that footprint, with higher mining output represented through their
machinery and stats rather than a larger occupied area. Tier 2 factories use 3×3
footprints; other Tier 3 infrastructure uses 3×3 footprints and Tier 3 factories use
4×4 footprints. Exceptional strategic or experimental structures may use larger
bespoke footprints.

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
Sentry and Mortar Turrets have no separate passive power demand: a full, idle
turret consumes no grid energy, and it draws power only when its capacitor needs to
replace energy spent firing. Mortars launch a visibly arcing projectile and report
`TARGET TOO CLOSE` when hostile targets exist only inside their dead zone.

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

Every human or AI commander begins with exactly:

- Three Tier 1 Worker Drones.
- One Tier 1 Mech Factory.
- One power generator.
- One completed Metal Mine on a nearby map-defined metal deposit, within the
  starting generator's power network.

The starting mine provides a guaranteed metal income so spending the initial metal
cannot leave a commander unable to construct anything. No battery, relay, charger,
reclamation yard, static defense, energy carrier, or combat unit is pre-built. Both
commanders use their workers and starting metal income to expand their economy and
military.

### 5.5 Match End and Restart

A player wins when every AI opponent has no living units and no living buildings.
The same elimination rule causes defeat when the player has no living units and no
living buildings, even if multiple AI commanders remain. Active, stasis, and
unfinished entities count while they remain alive; wrecks and reclamation drones do
not postpone elimination. If the human and final AI opponent are eliminated by the
same resolution, the player receives a defeat.

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

Reclamation drones hover over starting-wall segments instead of routing through
their gates. Rocky ridges, shelves, and crags remain impassable to the drones, so
those larger terrain features still shape salvage routes. Drones use deterministic
visibility-path routing around impassable terrain on trips to wrecks and back to
their yard, and recalculate when their target changes or an existing route becomes
blocked. Path searches are budgeted across simulation ticks so several active
yards cannot cause a single large frame-time spike.

Reclamation drones can be targeted and destroyed. A yard automatically rebuilds a
destroyed drone at no metal or energy cost to the player. Replacement should take
a defined amount of time, preventing instant replacement while preserving the
building's low-maintenance automation role. A yard can never have more than three
active or rebuilding drones.

If a reclamation drone is destroyed while carrying scrap, all carried metal drops
at the destruction location as a reclaimable scrap pile. Its replacement begins
empty.

Carrying capacity, collection time, replacement time, and behavior when the yard
loses power remain tuning decisions. Multiple drones may harvest the same wreck
concurrently, but the implementation must preserve its finite metal and prevent
them from collecting more than the pile contains.

## 8. Enemy AI

Each enemy AI performs the same categories of action as the player: gathering
metal, generating and relaying power, storing grid energy, constructing buildings
with workers, producing units, maintaining defenses, supplying unit energy,
fighting, and reclaiming wreckage. It uses the same simulation commands and pays
the same costs; it does not receive hidden free units or buildings.

In matches with multiple AI opponents, each AI is a separate free-for-all
commander. It owns independent metal, power, supply, technology unlocks, workers,
production queues, expansion choices, strategic decision state, and decision timing.
AI commanders may attack one another as well as the human, claim any currently
unused deposit, and are subject to the same placement and occupancy checks. They do
not share resources, vision-derived decisions, construction projects, or armies.

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

The AI makes its first decision after one second and reevaluates every second. It
does not follow a fixed or map-specific building sequence. Instead, it scores its
current strategic needs, including nearby threats, missing production, grid
storage, static defense, army charging, metal income, relay coverage, reclaimable
wreckage, supply pressure, and production capacity. A rush can therefore move a
defensive turret ahead of an economic choice, low metal can promote expansion once
the base can protect it, and larger economies naturally request additional
batteries, relays, defenses, chargers, salvage capacity, and factories. The
decision counter varies valid placement lanes but never dictates the next
structure type. These relative priorities are provisional tuning values.

After establishing its first Grid Battery, an AI whose stored grid energy falls to
20% or less of live storage capacity treats the condition as a generation shortage
rather than a storage shortage. It suppresses requests for additional Grid
Batteries and constructs a matching-tier Pulse Generator instead. It waits for an
unfinished recovery generator rather than queueing another generator or battery,
and resumes ordinary battery expansion only after stored grid energy rises above
the low-energy threshold.

Aircraft observed near an AI base add a Flak Turret request to that same strategic
scoring system. AI mech and vehicle factories also produce Skyguards and Flak
Crawlers through the same role-balancing production logic used for other combat
units; none are spawned or granted for free.

Once its opening battery, sentry, charger, first combat wave, and paid expansion
are established, an AI with metal above its low-economy recovery threshold
deliberately constructs a Tier 2 Mech Factory. It then produces a Tier 2 Worker
Drone before adding Tier 2 generators, batteries, defenses, chargers, mines, and
vehicle or aerospace production. After reaching three mines, the same stable
economy reserves for a Tier 3 Mech Factory, produces a Tier 3 Worker Drone, and
begins making Tier 3 infrastructure. Immediate defense and low-metal expansion may
temporarily outrank technology, but ordinary Tier 1 growth must not permanently
crowd Tier 2 or Tier 3 out of the strategy scorer. All advanced factories, workers,
and structures use the same prerequisites, metal costs, build times, power
requirements, and vulnerable construction process as the player's equivalents.
The two- and three-mine technology thresholds are provisional.

The AI still maintains a battery, local static defense, charger support, and a
three-unit combat reserve before committing to ordinary expansion. The Strategic
Supply Complex is constructed only when remaining supply falls to 10 percent of
current capacity or less, and each later capacity upgrade is purchased only when
supply becomes that constrained again. Once the initial force is secured, the AI
reserves enough metal for its highest-scoring current building need before queueing
ordinary combat units. Replacing a missing worker and rebuilding a deployed or
destroyed combat reserve take priority over that building reserve. Factories
balance their available combat roles by current and queued roster counts, then add
an energy carrier once a field army is large enough to need mobile support; they do
not repeatedly produce only the first unit in the factory roster.

After establishing its opening battery, defense, and charger, the AI begins paid
economic expansion instead of relying indefinitely on its starting mine. It seeks
the nearest unused non-frontier deposit first, constructs a normally vulnerable
generator outpost within power range when needed, and then has a worker construct
the mine. Expansion has no mine-count cap or fixed deposit sequence: after the
basic opening is covered, the AI maintains at least two mines and raises that
minimum by one every 55 seconds. Encountering a cluster of at least three player
Sentry Turrets immediately raises the current expansion target by one, allowing a
fortified player to trade early safety for an AI that takes map control faster. The
AI also seeks another mine whenever its available metal is at or below 400 or
reaches a 900-metal expansion surplus. There is no upper mine limit, so time,
recurring economic pressure, or later surpluses can carry expansion across the
entire map. It prefers non-frontier
deposits before farther frontier deposits and reevaluates ownership and placement
on every decision, so deposits already claimed by either side or temporarily
blocked by hostile units are skipped. Construction costs, travel, construction
time, power demand, and destruction all use normal simulation rules. The metal
decision thresholds are provisional.

Enemy combat units stage until three active attackers are ready, then launch as a
coordinated wave toward one target. Advancing formations retain that strategic
destination while stopping to fire at any hostile unit or structure that enters
weapon range; they resume the advance after the local target is gone, and nearby
targets do not pull the formation into a chase. Newly produced
attackers wait for a later wave instead of crossing the map individually. Automatic
attacks within weapon range still allow staged units to defend themselves locally.
If a player unit or structure appears within 800 world units of enemy infrastructure,
available defenders respond immediately without waiting for a complete wave. If at
least three completed player Sentry Turrets are clustered within 420 world units of
one another, ordinary assault waves grow from three to five units. An assault force
more than 800 world units from its generator fallback retreats toward that generator
when hostile combat strength
within 520 world units exceeds its nearby strength by a factor of 1.5. Retreat uses
a strategic fallback move: units stop to fire at hostiles in range, then continue
toward their regroup point without abandoning the retreat to pursue them. A
retreated field force then regroups for at least 15 seconds and waits for two
additional non-garrison combat units before it may launch another ordinary wave.
This recovery state prevents the same outmatched force from immediately repeating
an energy-wasting advance after reaching home. A player rush inside the normal base
response radius still overrides regrouping so available units defend immediately.
The cadence, response radius, strength estimate, defense cluster, retreat, regroup,
reinforcement, and wave-size values are provisional.

Every completed AI mine at least 480 world units from its starting command point is
treated as an outpost rather than an unprotected income structure. The building AI
prioritizes a powered Sentry Turret within 300 world units of each undefended
outpost. Two combat units are assigned to each outpost, excluded from ordinary
attack waves, and ordered to remain near the mine. They immediately attack hostile
units or structures within 520 world units and return to their guard positions once
the local threat is gone. Production counts these garrisons in addition to the
field army, so protecting expansions does not permanently consume the next assault
wave. All defense and garrison values remain provisional.

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
Canvas passes cull off-screen units, structures, deposits, terrain details, and grid
segments so match cost scales primarily with what the camera can actually show.
The static-page bootstrap gives every local JavaScript module in a page load the
same fresh version token. This prevents the hosting cache from mixing an older map
or simulation module with a newly deployed menu after reload.
Combat acquisition uses a spatial index rather than all-to-all scans. Physical unit
separation stops as soon as a solver pass finds no overlap and is capped at four
passes per tick, allowing unusually dense formations to finish spreading over
successive ticks instead of monopolizing one frame. The HTML status interface
refreshes at ten updates per second, while Canvas motion still renders every frame.
After an interrupted frame, the main loop runs at most two fixed simulation steps
before yielding to rendering, then catches up over following frames.

Battlefields currently range from 5,200 by 3,200 world units for two commanders to
8,560 by 6,280 for eight. The 1,600-by-900 Canvas is a movable viewport rather than
the full map. `WASD` pans the camera, and the mouse wheel zooms from 50% to 200%
around the world position beneath the pointer. Camera movement remains available
while the simulation is paused, and the camera is clamped to the active map's
dimensions so it cannot expose space beyond the battlefield boundary.

### 9.2 Match Menu and Multiplayer

The game opens on a mode menu. Single Player lets the human choose two through eight
total players and then choose among every map supporting that player count. All AI
opponents run their full commander logic. The local human is blue,
and up to seven opponents receive distinct red, orange, yellow, purple, green,
magenta, and pale-gray accents so ownership remains readable.

Multiplayer uses a visible pre-match roster shared by the host and guest. The roster
always identifies the host and lists the connected guest and every AI bot. The host
may add or remove bots up to the eight-commander match maximum and explicitly
starts the match. A lobby can start with the host and AI bots even when no guest is
connected. When a guest is present, the host controls the first team, the guest
controls the second team, and any remaining slots are independent AI commanders.
If a guest joins a host-plus-seven-AI lobby, the final AI slot is removed to honor
the eight-player maximum.

Multiplayer uses a host-authoritative WebRTC data channel suitable for the static
browser build. Creating a lobby reserves a temporary, randomly generated
10-character code containing uppercase letters and numbers. The host can copy that
code directly; the guest enters it once and selects Join Lobby. There is no manual
offer/answer exchange. The first guest to connect occupies the lobby's single guest
slot, and the code, roster, and player count remain visible to both players while
they are in setup. The lobby reports how many maps support that roster size; the
actual map is randomized only when the host starts the match and then synchronized
to the guest.

PeerJS Cloud brokers the WebRTC handshake associated with the short code; game
commands and snapshots still travel directly between the players. No game account
or dedicated Crimson Dawn gameplay server is required. A public STUN service
assists peer discovery, so both players need internet access and some highly
restricted or symmetric-NAT networks may still prevent a direct connection.

The host owns the canonical simulation, validates incoming commands against the
guest's team, applies the lobby's randomized map and AI configuration, and sends versioned
simulation snapshots to the guest ten times per second. Every host state carries a
monotonically increasing sequence number, and the guest ignores older state. The
guest never advances a second canonical simulation between snapshots. Instead, it
predicts its own submitted commands against the latest host state, replays still-unacknowledged
commands when a newer state arrives, and removes or corrects them when the host
acknowledges the result. This keeps placement and other commands responsive without
allowing the peers to become split-brained. When the outgoing channel is congested,
the host retains only the newest waiting snapshot; stale snapshots may not build an
ever-older delivery backlog. Transport send failures are contained and surfaced to
the player rather than escaping the animation loop and stopping the game.
Movement, attack, construction, production, rally, stop, ability, cancellation,
and upgrade commands all use the same simulation APIs as single player. Pausing and
match resets are disabled during multiplayer; either player may leave the match and
return to the mode menu. Automatic reconnection and spectators are not yet
implemented.

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
