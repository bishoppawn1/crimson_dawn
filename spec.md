# Crimson Dawn — Game Specification

Status: Early implementation. The target platform is the modern web browser using
JavaScript and Canvas. Exact balance values and faction roster remain undecided.

## 1. High Concept

Crimson Dawn is a real-time strategy game set in the future. Its central strategic
idea is that energy is required not only to run a base but also to keep an army
mobile and combat-capable. Players expand to secure crystal, construct power
infrastructure, move energy toward the front, destroy enemy supply assets, and
recover crystal from wrecked units and buildings.

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

- **Broken Frontier** contains 27 crimson crystal deposits, fortified starting bases,
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

A compact tactical minimap occupies the top-right corner of the battlefield. It
always shows the complete terrain and deposit layout at a fixed overview scale.
Every unoccupied crystal deposit is drawn as a bright-red diamond above the minimap
fog, with rich deposits using a larger, lighter scarlet marker; an occupied deposit
defers to its harvester marker.
Friendly contacts and currently visible opposing contacts use their team colors as
compact dots, while opposing contacts outside current vision are hidden. The current
camera view appears as a white rectangle. Left-clicking the minimap recenters the battlefield camera.
Right-clicking a point inside the map area with units selected issues the same
formation move command at the corresponding world position without moving the
camera; an armed force-move modifier is preserved for this command. With one
production building or a valid matching factory group selected instead, the same
minimap right-click sets the factory selection's rally point at that world position.
The main battlefield camera also supports a seamless strategic zoom. Its dynamic
minimum scale fits the complete active map inside the Canvas, while its maximum
remains 200%. Zoom stays anchored beneath the mouse cursor. At 45% scale and below,
fine terrain decoration, health bars, and detailed sprites give way to
strategic symbols whose world-space geometry remains proportional: larger units use
their actual radius, and buildings use their actual grid footprint. Mobile units use
small circles or aircraft triangles followed by a persistent role-and-tier code such
as `W1` for a Tier 1 Worker, `TK2` for a Tier 2 Battle Tank, or `BM3` for a Tier 3
Bomber. The code remains screen-readable while the marker scales with the world.
At the dynamic whole-map minimum, mobile markers may use a provisional 3.5-pixel
screen-radius floor so small workers and drones remain visible; larger units keep
their true relative size above that floor. Buildings have no such floor and always
shrink or grow with their actual footprint.
Hovering a mobile symbol shows its complete unit name. Selection uses a thin outer
ring without enlarging the underlying marker. Each Headquarters retains a ringed
diamond inside its actual footprint. Team colors, selection highlighting, forgiving
hit testing, movement orders, and combat targeting remain usable in this whole-map
view.
Every non-strategic zoom level uses the same full-detail unit, structure, wreck, and
terrain artwork regardless of how many entities are visible. The game does not
silently switch to simplified silhouettes or expose a separate performance-detail
mode when the camera zooms out or a battle becomes crowded.
On desktop displays, the battlefield expands across the available browser width;
outer padding and the command column remain narrow enough to prioritize the play
surface.

Fog of war is live and team-specific. Terrain, impassable landmarks, and the
construction grid remain dimly readable outside vision so navigation does not
become blind guesswork. Every unoccupied map-defined crystal deposit retains a
fixed-screen-size, bright-red beacon above the fog overlay at every zoom level;
occupied deposits defer to their visible harvester rather than obscuring it. Enemy units, structures, unfinished foundations, reclamation
drones, wrecks, power links, shield fields, command indicators, and combat effects are
not drawn or targetable outside current friendly vision. Friendly assets remain visible
to their owner. Fog is derived deterministically from current authoritative entity
positions and definitions, so single-player presentation, multiplayer presentation,
and command validation use the same visibility result without a separate
presentation-only truth.

Every living unit and every completed structure supplies vision. Ordinary ground units
have at least 320 world units of vision, aircraft have at least 400, and buildings have
at least 340; long-range weapons receive enough sight to use their complete weapon
range. Reclamation drones provide 300 vision. Entity radii count at the edge of a vision
circle, and direct attack commands against unseen hostile entities are rejected.

Radar Arrays form a tiered powered building family. Tier 1, Tier 2, and Tier 3 arrays
provide provisional 950/1,250/1,600-world-unit vision while complete and powered, use
1×1/2×2/2×2 footprints, draw 3/5/8 energy per second, and cost 140/270/500 crystal.
An incomplete array supplies no vision. A completed but disconnected or energy-starved
array retains only the ordinary 340-world-unit building sight range. Selecting a radar
asset displays its current coverage circle, and the minimap applies the same coverage.

The Tier 3 **Overseer Spire** is a separate strategic reconnaissance building. While
completed and powered, it projects up to five remote orbital vision circles, each
75 percent of the Tier 1 Radar Array's radius: 712.5 world units under the current
provisional radar value. Every 60 powered seconds, all of its circles relocate
deterministically. At relocation time, each new circle first seeks a center at least
356.25 world units inside the battlefield where the whole reveal circle overlaps
neither conventional allied vision nor another allied Overseer circle. A previous
circle's replacement also moves at least 356.25 world units from that old position.
If no completely non-overlapping position exists for the next circle, that slot
instead uses deterministic uniform area sampling to choose the position whose
in-bounds circle contains the most currently undiscovered area. Fallback circles
may overlap existing vision or one another, but never reuse the same candidate
center. Circle edges may extend beyond the battlefield boundary, where they have no
effect. Losing power hides every orbital circle and pauses the relocation timer;
restoring power returns the same circles until their remaining timer expires.
Orbital coverage is authoritative vision shared with allies, so it affects fog,
targeting, the tactical minimap, snapshots, and multiplayer exactly like other
vision sources. Selecting the Spire displays its active circles and relocation
countdown. Its provisional profile is a 3×3 footprint, 900 integrity, 12 energy per
second, 750 crystal, and a 30-second base construction time before the global
construction-duration multiplier.

Each map has a data-defined environmental theme that is preserved in multiplayer
snapshots. **Grassland** maps use green fields, varied olive clearings, and sparse
deterministic grass tufts without ambient crystal remnants. **Apocalypse** maps retain
the rust-red earth, dusty rose clearings, burgundy patches, and scattered decorative
crimson crystal remnants. Harvestable deposits remain crimson and mechanically
identical in both environments. Broken Frontier, Iron Crossings, and Ruined Meridian
are grassland duel maps; Ashen Divide and Twin Calderas are apocalyptic duel maps.
For three through eight players, crown and ancient-ruin layouts are grassland maps,
while fracture layouts are apocalyptic. The single-player picker labels each map as
`Green Grassland` or `Red Wasteland`, while multiplayer continues to select randomly
from both themes. Construction-grid lines use theme-specific colors while preserving
the readability of team markings, range overlays, and placement indicators.

Buildings use a detailed top-down industrial style rather than abstract geometric
icons. Cast foundations, roof bevels, shadows, vents, fasteners, access panels,
hazard markings, and team-colored powered components provide a shared visual
language. Each family retains recognizable working machinery: generators expose
turbine cores, batteries show cell banks and charge levels, relay towers use braced
masts, chargers use copper induction coils, harvesters show cutting and conveyor
equipment, and each factory branch has a distinct production-bay layout. Unfinished
structures display foundation framing and construction rails instead of appearing
as translucent copies of completed buildings.

Grid-aligned ridges, shelves, and crags form impassable terrain. Their visible
rectangular boundaries use the same 40-unit grid as construction. Rendering gives
them raised top planes, directional drop shadows, beveled rock faces, face
striations, deterministic surface facets, and strong upper lips. Grassland cliffs
carry a moss-green rim; apocalyptic fractures expose bright fault cracks; ruins and
starting walls use distinct masonry or panel details. These presentation layers do
not change the exact collision rectangle. Buildings and upgrades cannot overlap
terrain, and player units, enemy units, and reclamation drones must travel around
it. A move or rally command issued inside impassable terrain resolves to its nearest
reachable edge. Player construction and enemy AI placement use the same terrain
validation.

Each starting location also has four thin, grid-aligned wall segments arranged as
a shallow defensive enclosure. Two broken forward segments leave a central gate,
while short upper and lower segments leave the rear and corners open. These walls
are symmetrical, impassable to ground units, and unavailable for construction
overlap. Aircraft and hovering reclamation drones pass directly over them. The
walls slow a direct ground rush without sealing either side into its base.

## 2. Resources

### 2.1 Crystal

Crimson crystal is the primary construction material for units and buildings.

Crystal can be obtained from:

- Crystal Harvesters built on map-defined crimson crystal deposits.
- Converting energy into crystal.
- Reclaiming crystal scrap from the wreckage of destroyed units and buildings.

Most deposits are individually distributed, while remote frontier locations group
several deposits into expansion objectives. Distance from a starting base does not
change a deposit's yield or color. Explicit **Rich Crystal Deposits** provide a
provisional 1.5× multiplier to any Crystal Harvester built on them and appear as
brighter scarlet crystal clusters; ordinary deposits remain visibly crimson whether
nearby or remote.

### 2.2 Energy

Energy powers the base and military. It is required for:

- Buildings to operate.
- Units to move.
- Units to attack.
- Certain units to activate special abilities.
- Other future energy-consuming operations defined by unit or building data.

Energy can be obtained from power generators and high-output structures such as
nuclear reactors. Crystal atomizers can convert crystal into energy.

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

Converters transform energy into crystal. Atomizers transform crystal into energy.
Both processes must be lossy. Converting a resource and then converting the result
back must always return less than the original amount, preventing a closed
conversion loop from creating resources.

Conversion exists to let a player rebalance an economy, not to replace expansion,
crystal harvesting, generation, or salvage.

### 2.4 Supply

Mobile units consume a data-defined amount of supply according to their role and
tier. Worker Drones use 1, 2, and 3 supply across Tiers 1–3; Vanguards use 4, 6,
and 8; Bulwarks use 8, 12, and 16; and Arc Energy Carriers use 6, 9, and 12.
Production orders reserve their full supply as soon as they enter a factory queue.
An order that would exceed capacity is rejected without spending crystal. Destroyed
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

Mobile energy suppliers carry a large reserve, mount a modest defensive weapon,
and automatically transfer energy to
nearby friendly non-carrier units that are not full. Their per-second output is
shared fairly among all eligible units in range, and every point delivered is
deducted from the supplier's own reserve. A supplier stops transferring at its
protected reserve and does not refill another mobile supplier. Selecting an Arc
Energy Carrier shows its transfer radius, and active supply links identify the
units currently receiving energy. Arc Energy Carriers, Grid Tankers, and Energy
Tenders all improve their defensive weapon across tiers, but those weapons remain
deliberately weak so the suppliers are logistical assets and valuable targets rather
than efficient combat units. Their provisional damage per shot is 5/7/10 for Tier
1/2/3 Arc Energy Carriers, 5/8/11 for Tier 1/2/3 Grid Tankers, and 6/9 for Tier 2/3
Energy Tenders.

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

Every active mobile unit, regardless of role, tier, or commander, passively
regenerates energy whenever it is below 20% of its own maximum capacity. This slow
recovery stops exactly at 20% and prevents a depleted unit from remaining
permanently unable to move or fire. Stasis retains its faster emergency recovery to
the reactivation threshold; after reactivation, the ordinary slow regeneration
continues until the unit reaches 20%. Chargers and mobile suppliers are still
required to restore normal combat endurance or a full reserve.

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
rapid weapons. Ordinary projectile effects use the authoritative attack event's
firing-time positions; they do not stretch from a shooter or target that moves
after the shot. Mortar shells are the exception: their arc continually adjusts
toward the chosen target's current presented position so a moving unit is struck
where it is now rather than where it was when the turret fired. If that target is
destroyed before impact, the remaining visual flight ends at the target's
destruction location instead of following a rebuilding reclamation drone back to
its yard. Every weapon
represented by a moving tracer, missile, or shell applies its damage only when that
projectile arrives. Projectile speed and minimum travel time are shared by the
simulation and renderer so damage cannot precede the visible hit.
Attack events remain available through their entire flight and impact effect, even
for long-range artillery whose travel time exceeds the ordinary event lifetime.
Instant and sustained beam weapons apply damage while their beam is active.
Surviving combat units on either team retaliate when damaged: unless they are
force-moving or already following an explicit attack order, they abandon their
current automatic target and pursue the aggressor. Retaliation may carry them beyond
their normal automatic-acquisition range. If the unit was following an ordinary
movement route, that destination remains saved while it retaliates and resumes after
the aggressor is destroyed or is no longer a valid target.
Explicit movement, attack, stop, hold-position, transport loading, and transport
unloading commands remain available.
Commands are contextual rather than limited to special-ability buttons.
Unit selection and movement commands have no fixed 200-unit ceiling: every living,
owned unit in a legitimate selection can receive the same formation command. The
host bounds incoming multiplayer unit lists by the current simulation population
before validating ownership, so malformed payloads remain finite without truncating
real armies.
Double-clicking a living owned unit selects every living, deployed unit with that
exact unit type within a 700-world-unit radius centered on the clicked unit. This
large local area gathers a nearby formation without also selecting distant groups.
Tier variants are separate types: double-clicking a Tier 1 unit does not select its
Tier 2 or Tier 3 counterparts. Carried units are excluded, and holding Shift adds
the nearby exact-type group to the current unit selection.
An explicit terrain move remains as a resumable route when a unit acquires a hostile
in weapon range. The unit stops in place, attacks while stationary—including between
shots during its weapon cooldown—and continues toward the saved destination after
the enemy is destroyed or leaves the engagement. The Hexapod Landship is the sole
exception: its three independent cannons can fire while its hull continues walking.
No other unit fires and translates under its own movement in the same simulation
tick. Holding Shift while issuing
additional terrain move commands appends those destinations to the selected units'
movement queues; each waypoint starts after the previous one is reached. A non-Shift
move replaces the active destination and clears the queued waypoints. A force move,
armed with `G`
before right-clicking, ignores enemies until the units reach their destination.
Selecting a unit with a movement queue immediately displays its complete connected
route and every destination marker, including waypoints it has not reached yet.
The unit command panel also provides Patrol for any selection containing active
units. Pressing `P` or clicking Patrol begins route recording without moving the units; each
terrain or tactical-minimap right-click adds another point, and players may add as
many points as they want. Pressing `P` or clicking Patrol again with at least two recorded points
starts a repeating, formation-aware route through every point in order and then
back from the final point to the first. Selected patrolling units display that
complete closed route immediately. Escape or changing the unit selection cancels
an unfinished recording. A new explicit movement, attack, stop, hold-position,
construction, repair, production-assist, transport-loading, or transport-unloading
command replaces an active patrol.
Direct attack commands still pursue their chosen target, stopping once they enter
weapon range before firing.

Ground units treat completed buildings and unfinished foundations as solid
obstacles. Movement uses deterministic multi-corner routing around compound terrain
and exact structure footprints, with collision-time sliding retained as a safety
fallback. Routes may use multiple corners to escape concave obstacle arrangements
and are recomputed when a moving target shifts or a route becomes blocked. Group
orders stagger those route computations across simulation ticks so large armies do
not rebuild every visibility graph in the same frame. At most four full visibility
searches run in one simulation tick; units waiting for a search continue using
collision sliding until their deterministic turn. Route searches widen a corridor
around the movement line, while each visibility graph uses a deterministic bounded
set of the nearest relevant obstacle corners. Every proposed route segment is still
collision-tested against the complete obstacle set, so the bound cannot permit a
unit to route through an omitted building or terrain obstacle. If no bounded
visibility path is available, collision-time sliding and later staggered replanning
remain the fallback. If a ground unit has no valid route and makes no meaningful
progress toward its destination for two continuous seconds, it relocates
deterministically to the nearest clear position that has a route to that destination
and continues its current order. This lets units escape pockets closed around them
by later construction without teleporting units that are merely taking a valid
detour. Move orders placed inside a structure resolve to the nearest reachable edge
of its visible footprint.

Aircraft use a separate air movement layer. They fly directly over impassable
terrain, completed structures, and foundations, but remain constrained by the map
boundary, their movement-energy cost, and physical separation from other aircraft.
Air and ground units do not push one another apart, allowing aircraft to pass over
ground formations without displacing them. Aircraft emphasize speed over
survivability: the standard air roster moves at 160–300 world units per second and
has lower provisional integrity than its previous profiles. Interceptors remain the
fastest standard aircraft and serve as dedicated air-superiority fighters, while
gunships, bombers, dropships, and energy tenders retain their relative role
differences. The experimental Zenith Doughnut is a much larger
72-radius aircraft with a provisional movement speed of 375 world units per second.

Ordinary weapons deal a provisional 0.55× damage multiplier against aircraft.
Dedicated anti-air weapons instead deal 2× damage and automatically prefer an
aircraft when both air and ground targets are in range. Skyguard Mechs, Flak
Crawler vehicles, Flak Turrets, and Interceptors are the current dedicated counters.
Ground-based anti-air weapons may still fire at ground targets for their listed base
damage. Interceptors instead deal only a provisional 0.5× damage against ground
units, structures, and other non-air targets, keeping them effective in dogfights
without making them efficient ground-attack aircraft. An incidental ground target
never pulls any dedicated anti-air unit's automatic targeting away from an aircraft
in range.

Mobile units use compact battlefield footprints so armies remain visually smaller
than bases and defensive structures. Living units on the same movement layer,
friendly or hostile, maintain physical separation. Dense ground formations and
dense air formations spread around one another instead of occupying an unlimited
stack at one position; units on different layers may overlap.

Conventional vehicles use a larger physical and visual footprint than every
same-tier conventional mech. Scout Vehicles, Pathfinder Radars, and Flak Crawlers
form the smallest vehicle silhouettes; Mobile Artillery and Grid Tankers occupy the
middle of the range; and Battle Tanks are the largest conventional vehicles at each
tier. The provisional radii are 12/13/14 for the smallest vehicle group,
13/14/15 for artillery and tankers, and 15/16/17 for battle tanks across Tiers 1–3.

The Canvas battlefield uses role-readable, top-down mechanical sprites rather than
generic diamonds or side-view silhouettes. A mech's cockpit roof, shoulder deck,
dorsal armor, compact rear hip machinery, and forward-pointing weapons are visible
from above. The torso occludes the lower walking assembly while stationary. During
movement, the walking assembly remains fully hidden beneath the chassis, so no rear
feet protrude and the mech never reads as swimming, paddling, prone, or crawling.
The Vanguard uses a narrow arrowhead chassis and long canopy, while the
Bulwark uses a broad slab-sided hull, short wide canopy, shield, and twin cannon so
the two roles remain distinct without relying mainly on scale.
Vanguard, Bulwark, Skyguard, Carrier, and hostile combat silhouettes remain distinct at
gameplay scale through their overhead equipment profiles. Each non-experimental
higher-tier unit renders an additional 10% larger per tier on top of its data-defined
footprint; this visual multiplier does not further change collision or movement.
Armed Tier 2 units add one visible auxiliary weapon hardpoint,
and armed Tier 3 units add two; these fittings communicate tier progression but do
not perform separate attacks. Unarmed support units grow without receiving fake
weapons. Layered armor plates, panel seams, joints, cooling vents, fasteners, and
weapon or support housings add detail. Directional lighting, offset ground
shadows, sparse edge wear, articulated movement, and units turning toward movement,
construction, transfer, or combat targets give the machinery a grounded physical
presence. Every full-detail mobile sprite also receives a solid underbody volume,
ambient edge shading, a directional metal sheen, and filled armored barrels and
linkages; thin strokes are reserved for true seams, markings, and small cables
rather than defining a machine's primary mass. Vehicles expose wheels or track rollers, engine grilles, exhausts, and
complete turret assemblies; aircraft expose engine nacelles, control surfaces,
hardpoints, and navigation lights. Skyguards expose paired shoulder missile racks
and a central tracking dish, Flak Crawlers use four short autocannons and a rear
tracking dish, and Flak Turrets use compact multi-barrel mounts. Worker Drones use articulated multi-arm tool
machinery, while Arc Energy Carriers use a bipedal support frame with a visible
dorsal energy core. Player blue and enemy red appear only on restrained
identification panels, cockpit trim, and tier markings. Stasis state, health, and
energy remain separately visible.

Every mobile radar branch is dominated by an oversized dorsal dish rather than a
combat turret or fighter silhouette. Watchman Radar Mechs, Pathfinder Radar
vehicles, and Skywatch Radar aircraft each carry exactly one compact defensive gun
and never gain the auxiliary weapon hardpoints used to show combat-unit tier
progression. Higher radar tiers improve and detail their sensor assemblies instead.

Aircraft roles use independent silhouettes rather than one shared airframe with
minor attachments. Interceptors have needle noses, swept delta wings, and twin tail
fins; Gunships use short armored fuselages, straight weapon wings, large paired
engine nacelles, and visible cannons; Bombers are broad tailless flying wings with
recessed payload bays; and Energy Tenders use narrow transport bodies dominated by
two long external energy cylinders and illuminated transfer conduits. Dropships use
broad lift wings, a deep central cargo hull, and a clearly segmented dorsal cargo
hatch. Skywatch Radars use blunt sensor fuselages, straight stabilizer wings, paired
engine pods, and an oversized dorsal dish, keeping them visually distinct from the
Interceptor's needle-nose delta planform. Tier 3 models
retain their role silhouette while adding extra control surfaces, exhausts, armor,
or energy-system markings.

## 5. Production Branches and Technology Tiers

Production categories are parallel branches, not consecutive steps in a single
ladder.

| Production building | Available tiers | Produces |
| --- | --- | --- |
| Mech Factory | Tier 1, Tier 2, Tier 3 | Mechs, workers, Arc Energy Carriers, and Watchman Radar Mechs |
| Vehicle Factory | Tier 1, Tier 2, Tier 3 | Scout Vehicles, Battle Tanks, Mobile Artillery, Flak Crawlers, Grid Tankers, and Pathfinder Radars |
| Air Factory | Tier 2, Tier 3 | Interceptors, Gunships, Bombers, Energy Tenders, Skywatch Radars, and Dropships |
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

Every Mech Factory exposes six consistent production lines at its own tier:

| Production line | Battlefield role |
| --- | --- |
| Worker Drone | Construction and economic expansion |
| Vanguard Mech | Fast, efficient general-purpose combat and scouting |
| Bulwark Mech | Slower, durable frontline combat with the energy-consuming Overdrive ability |
| Skyguard Mech | Mobile missile defense with extra damage against aircraft |
| Arc Energy Carrier | Unarmed mobile energy storage and transfer support |
| Watchman Radar Mech | Long-range mobile vision with a light defensive weapon |

A Tier 1 Mech Factory produces the Tier 1 version of all six units. Tier 2 and
Tier 3 factories each produce a stronger version of the same six roles at their
matching tier rather than mixing lower-tier units into their menus. Higher-tier
copies improve the statistics relevant to their role: workers build faster,
Vanguards, Bulwarks, and Skyguards become more combat-capable, Arc Energy Carriers
store and transfer more energy, and Watchmen extend radar coverage.
All current unit costs, production times, and tier-to-tier stat increases are
provisional balance values.

### 5.2 Vehicle and Air Factory Rosters

Every Vehicle Factory produces six conventional ground and logistics roles at the
factory's matching tier:

| Production line | Battlefield role |
| --- | --- |
| Scout Vehicle | Fast ground reconnaissance and light combat |
| Battle Tank | Durable direct-fire frontline combat |
| Mobile Artillery | Long-range fire support |
| Flak Crawler | Mobile rapid-fire anti-air defense |
| Grid Tanker | Armored mobile energy storage and transfer support |
| Pathfinder Radar | Long-range mobile vision with a defensive cannon |

Mobile Artillery is vulnerable fire support rather than a cheaper substitute for a
Battle Tank. Its provisional Tier 1/Tier 2/Tier 3 firing bands are 120–400,
140–480, and 160–560 world units. It cannot acquire or fire at a target whose
center is inside that reduced dead zone, while retaining substantially more reach
than direct-fire vehicles when screened and positioned correctly. Selecting Mobile
Artillery shows both range boundaries, and its factory control lists the complete
firing band.

Air production begins at Tier 2; there is no Tier 1 Air Factory. Tier 2 and Tier 3
Air Factories each produce matching-tier versions of six aircraft roles:

| Production line | Battlefield role |
| --- | --- |
| Interceptor | Fast air-superiority fighter with strong anti-air and weak ground attack |
| Gunship | Durable aerial assault |
| Bomber | Heavy aerial strikes |
| Energy Tender | Airborne mobile energy storage and transfer support |
| Skywatch Radar | Fast airborne long-range vision with a light defensive weapon |
| Dropship | Unarmed aerial transport for up to eight ground units |

Watchman Radar Mechs provide provisional 650/800/950 vision at Tiers 1/2/3, while
Pathfinder Radar vehicles provide 700/850/1,000. Skywatch Radar aircraft begin with
the Air branch and provide 900/1,100 vision at Tiers 2/3. Every radar unit carries a
low-damage defensive weapon but has substantially more vision than weapon range,
making scouting and coverage its primary role. Provisional damage per shot is
6/9/13 for Tier 1/2/3 Watchmen, 7/10/14 for Tier 1/2/3 Pathfinders, and 7/11 for Tier
2/3 Skywatches. AI factory balancing includes the radar production
lines, and AI commanders construct and upgrade Radar Arrays after securing an
initial assault wave and enough units to defend their expansions.

The Grid Tanker and Energy Tender automatically and fairly distribute energy to
nearby eligible allies without crossing their protected reserve, using the same
resource-conserving transfer rules as the Arc Energy Carrier. Aircraft fly over
terrain and buildings. Every higher-tier vehicle or aircraft
improves the integrity, energy storage, and combat statistics relevant to its role.
All current unit costs, production times, energy budgets, and tier-to-tier stat
increases are provisional balance values.

#### Dropship transport rules

Tier 2 and Tier 3 Air Factories each produce a matching-tier flying Dropship; no
Tier 1 Dropship exists. Every Dropship has exactly eight cargo slots. It can carry
active friendly ground units, including workers, mechs, vehicles, and ground
experimentals, but it cannot carry aircraft or another Dropship. Cargo continues
to consume supply while aboard.

Selecting one Dropship and pressing `F` assigns the nearest eligible friendly ground
units to fill its unreserved cargo slots. If eligible ground units are selected
together with that Dropship, `F` loads that explicit selection instead. Selecting
multiple Dropships and pressing `L` assigns nearest eligible ground units in balanced
rounds so one cargo slot is reserved in each selected transport before a second slot
is reserved in any of them. Selecting ground units and right-clicking a friendly
Dropship explicitly assigns those units to that transport until its eight slots are
reserved. Fill One and Fill All are keyboard-only commands and do not occupy buttons
in the command panel. Assigned units pursue the transport and board when they reach
its hull.

Carried units are hidden, cannot move, attack, build, repair, recharge, transfer
energy, be selected, or be targeted, and remain at their current integrity and energy
until deployed. Selecting one or more Dropships and pressing `U` attempts to unload
all cargo into deterministic clear ground positions around each aircraft. A unit
remains aboard if terrain, structures, map edges, and deployed ground units leave no
valid nearby position. Dropship transport commands, including `U · Drop All`, appear
only while the current unit selection contains at least one Dropship. If a Dropship
is destroyed, every unit aboard is destroyed
with it and produces ordinary salvage at the crash position.

#### Experimental Factory roster

The Tier 3 Experimental Factory produces exactly three enormous strategic units:

| Production line | Battlefield role |
| --- | --- |
| Arsenal Colossus | Huge assault mech carrying eight visible weapon systems and firing a converging multi-projectile salvo |
| Hexapod Landship | Six-legged walking battleship with three independently targeting siege cannons, four smaller anti-air flak mounts, fire-while-moving capability, extreme durability, and the ability to stride across living building footprints |
| Zenith Doughnut | Giant circular toroidal aircraft with a downward ground beam and twin independently targeting dorsal anti-air batteries |

The Arsenal Colossus follows the same overhead leg language as conventional mechs:
its hull hides the walking assembly while stationary and moving, leaving only
compact rear hip machinery visible and no protruding feet.
The Hexapod Landship remains a ground unit: impassable terrain and living units
still constrain it, but buildings are excluded from its destination validation,
path planning, and movement collisions. Its three heavy cannon mounts and four
smaller flak turrets select targets, track, cool down, consume energy, and fire
independently while the hull continues walking. It is the only unit that can fire
while moving. An explicit ground attack order directs the main siege cannon while
the two side cannons opportunistically engage other surface targets in range; all
three may converge on one target when no alternatives exist. The four flak mounts
independently engage aircraft, prefer separate targets when several are available,
and deal the standard dedicated anti-air 2× damage multiplier. The main siege
cannon reaches 460 world units and each side cannon reaches 420. All three heavy
guns share a compact 80-unit minimum range directly beneath the Landship; the flak
mounts retain no minimum-range restriction.
Shell damage resolves when each visible projectile reaches its target, not when the
firing order begins. Its six legs retain their deliberate pull-step gait, but the
two sides use offset phases and shortened travel lanes so neighboring feet do not
cross. Its slightly elongated walking-battleship hull carries three visibly complete,
independently rotating armored turret assemblies plus four compact twin-barrel flak
mounts, giving it the mixed heavy and anti-air battery of a battleship. Each
foot ends in a circular armored hub with three trapezoidal claws spaced exactly 120
degrees apart. Its 60-unit gameplay hitbox encloses the six-foot footprint rather
than hugging the central hull, while a compensating sprite scale preserves the
Landship's existing visible size. The Zenith
Doughnut ignores terrain, structures, and ground-unit separation. When idle, it
automatically selects the nearest hostile ground target within a provisional
400-world-unit local acquisition radius, flies directly over it, hovers while the
beam fires, tracks moving targets, and only selects another target after a kill when
that target is locally detectable from its new position. It never scans the whole
battlefield or begins a cross-map pursuit without an explicit attack order. Explicit
attack, movement, force-movement, and hold-position orders retain priority over
autonomous pursuit. Its laser has no horizontal firing range, remains centered
beneath the aircraft, and automatically damages every hostile ground unit or
structure inside its 48-unit-radius footprint. The Doughnut stops before the beam
damages anything beneath it and remains stationary for as long as the beam is
active. Players can also attack by routing the aircraft over enemy
assets; attack commands on ground targets track and pursue the chosen target. The
laser cannot damage aircraft
and consumes energy continuously while it is damaging at least one target. Two
visible dorsal anti-air batteries cover the Doughnut out to a provisional
340-world-unit range. Each battery independently selects only hostile aircraft,
prefers a different target when multiple aircraft are available, and converges on
one aircraft when necessary. The Doughnut stops before either battery fires, while
the batteries can continue operating alongside its ground beam. Force-movement
prevents all of its weapons from firing. Each battery fires a tracking
projectile for 18 base damage, applies the dedicated 2× anti-air multiplier,
consumes 9 unit energy, and has a provisional 0.45-second cooldown. Players may
explicitly order the Doughnut to attack an aircraft; if it is outside battery range,
the Doughnut pursues until it can fire. Anti-air projectile damage resolves on
impact rather than at launch. All three experimental units use ordinary paid
production, supply, movement-energy, weapon-energy, damage, destruction, and
salvage rules. The Zenith's current provisional size is 72 radius and its movement
speed is 375 world units per second. Its beam deals a provisional 150 damage per
second. All experimental balance values remain provisional.

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
  Tier 3 building, and constructs the Experimental Factory, Nuclear Missile
  Launcher, and Anti-Nuke Turret.

The worker construction interface presents exactly three compact, side-by-side
tier tabs labeled Tier 1, Tier 2, and Tier 3. Only one tier panel may be open at a
time: selecting a tab opens its panel and closes the previously open panel, while
selecting the open tab again closes it. Within an open panel, structures the
current worker selection can build and
afford are displayed brightly, while structures blocked by worker tier or current
crystal are dimmed but remain visible so the progression path stays clear.

Selected Worker Drones expose an immediate unit-upgrade command; no other unit role
can use it. Each use advances every eligible selected worker by exactly one tier and
requires the team to have completed the matching-tier Mech Factory. The command
costs the difference between the current and target worker's provisional crystal
cost and requires enough free supply for the target worker. It preserves each
worker's current orders, integrity percentage, and retained energy. Tier 3 workers
are already fully upgraded and are ignored when lower-tier workers share the
selection.

Pulse Generators, Grid Batteries, Power Relay Towers, Induction Chargers, Crystal
Harvesters, Sentry Turrets, Shield Turrets, Mortar Turrets, Flak Turrets, and
Salvage Reclamation Yards currently have separate Tier 1, Tier 2, and Tier 3
construction definitions.
Higher-tier versions have larger provisional costs, durability, demand, and
role-specific output or capacity. Tier 2 ordinary buildings generally gain larger
footprints, while Tier 3 versions retain their Tier 2 size except for factories.
The Strategic Supply Complex remains
a Tier 1 construction option with
its own internal upgrade levels rather than separate tiered foundations. All new
factory and building-variant balance values are provisional.
The standalone Overseer Spire is available only as a Tier 3 construction option;
it is not an upgrade tier of the Radar Array family.

Every higher tier must provide a visible functional improvement, not merely a
larger model or more durability. Generators improve output and grid reach;
batteries improve storage and transfer throughput; relays improve reach and
buffering; chargers improve field size and recharge throughput; harvesters improve
crystal income; reclamation yards field more drones that move faster, carry more
salvage, and rebuild faster; and
factories gain provisional production-speed multipliers of 1.0×, 1.25×, and 1.5×.
Sentry Turrets scale especially clearly: provisional Tier 1/Tier 2/Tier 3 weapon
profiles are 18/34/60 damage, 185/265/360 range, and 0.75/0.68/0.55-second reloads.
Shield Turrets scale from 520/1,050/1,900 shield capacity, 250/355/480 field radius,
and 12/22/36 shield regeneration per second across the three tiers.
Mortar Turrets provide slower indirect fire at 140–420, 160–550, and 180–700
minimum-to-maximum range across the three tiers. A Mortar Turret never acquires or
fires on a target whose center is inside its minimum range, creating a deliberate
close-range dead zone. Its selected range display shows both boundaries.
Flak Turrets scale from 8/13/20 base damage, 225/285/360 range, and
0.38/0.32/0.27-second reloads while retaining their 2× aircraft multiplier.
Build controls, upgrade controls, and selected-structure details display the
role-defining statistics so these advantages are apparent before crystal is spent.

### 5.4 Tier 3 Strategic Missiles

The Nuclear Missile Launcher and Anti-Nuke Turret are dedicated Tier 3 structures;
lower-tier workers cannot construct either one. Their balance values remain
provisional. The Nuclear Missile Launcher costs 1,800 crystal, uses a 4×4 footprint,
has 1,600 integrity, draws 18 energy per second while idle, and takes 42 base
construction seconds before the global construction-duration multiplier. It does
not behave as a unit factory and stores at most one completed missile.

A completed, powered launcher can begin constructing a nuclear missile for 1,500
crystal. Missile construction takes 90 seconds and adds 35 energy per second to the
launcher's normal demand. Progress pauses when that complete demand is not powered.
Once the missile is ready, right-clicking terrain on the battlefield or tactical
minimap assigns or replaces its target. The selected launcher displays the target,
the three blast boundaries, and the line from launcher to target. Launch remains a
separate explicit button and is enabled only while the launcher is powered and has
both a ready missile and a target.

A launched nuclear missile travels linearly from the launcher to the selected point
in exactly 10 simulation seconds, independent of distance. It is not a normal combat
entity: units and ordinary weapons cannot select, target, collide with, damage, or
otherwise delay it, and destroying the launcher does not remove a missile already in
flight. A successful Anti-Nuke interception is the sole exception. The missile is
visibly rendered throughout flight, grants its launching alliance a moving
300-world-unit vision field, and is included in multiplayer snapshots.

On arrival, the missile damages every damageable unit, structure, and reclamation
drone whose physical radius or footprint overlaps one of three concentric bands.
The innermost 120-world-unit radius deals 5,000 damage, the middle 280 radius deals
1,800 damage, and the outer 480 radius deals 500 damage. Each target receives only
the damage of the smallest band it overlaps. Nuclear damage affects allies and the
launching player's own assets as well as enemies, and shield fields absorb it through
the ordinary shield-damage rules.

The Anti-Nuke Turret costs 1,200 crystal, uses the required 2×2 footprint, has 950
integrity, draws 10 energy per second while ready, and takes 30 base construction
seconds before the global duration multiplier. A completed, powered turret
automatically intercepts the nearest hostile nuclear missile within its 600-world-
unit circular range, a 30×30 construction-grid-cell diameter; ties resolve
deterministically. The launching alliance retains the missile's 300-world-unit
vision at the interception point for the full 1.2-second interception effect, so it
sees the direct aftermath even though the missile itself is gone. The turret then reloads for 60 powered
simulation seconds. Reloading adds 40 energy per second to its normal demand, so a
power shortage pauses the reload and leaves the turret unable to intercept until its
grid can support the full 50-energy-per-second load. Selected turrets display their
range, reload progress, remaining time, and power/readiness state.

A player upgrades one selected completed structure at a time. Each upgrade advances
only one tier and costs the provisional difference between the target tier's crystal
cost and the structure's current-tier crystal cost. The conversion is immediate,
preserves the building's integrity percentage, retained energy, and current shield
strength up to the new capacity, and keeps factory queues and rally orders. A Shield
Turret regenerates the newly added empty capacity after its upgrade. The larger
target footprint, when an upgrade changes it, snaps to the nearest compatible grid
center and must fit within the battlefield
without overlapping another structure, hostile unit, or reclamation drone. Friendly
units are moved clear. The Strategic Supply Complex continues to use its separate
internal supply-level upgrades rather than this structure-tier system.

Workers receive a placement order, travel to the site, and build the structure over
time. Holding Shift while confirming additional foundations appends them to every
selected worker's construction queue without interrupting the current project, and
keeps placement mode active for further orders. Workers advance through valid
foundations in placement order. Ordinary non-Shift placement replaces the current
construction order and clears its queue, as do explicit move, attack, stop, and
hold-position commands. A cancelled queued foundation is skipped. Crystal is spent
when each placement is confirmed. A new foundation starts with 10% of the finished
building's integrity. Newly completed construction progress adds its corresponding
share of the remaining integrity, but incoming damage is never erased by later
construction or by completion; only ordinary repair after completion can restore
it. Additional workers accelerate the finite progress and durability being added,
but do not turn prior damage into free healing. Focused enemy fire can therefore
destroy a foundation while workers are still building it. Incomplete buildings
remain vulnerable and are visible to an opponent only while inside that opponent's
current vision.
When one or more workers with construction orders are selected, the interface shows
one shared construction sequence with every unique foundation listed exactly once,
even when several selected workers contribute to it. Compact square building
indicators sit beside the selection heading, show the active foundation's live
construction percentage, and continue with the remaining foundations in placement
order.
Mobile-unit selection summaries remain intentionally concise. A single selected
unit shows only its current and maximum integrity, current and maximum energy, and
whether it is active or in stasis. A multiple-unit selection shows those integrity
and energy totals plus the active and stasis counts; role, vision, combat, cargo,
and current-order prose do not expand the summary.
All unit production times and building foundation construction times use a global
provisional 4× duration multiplier. This is twice as slow as the preceding 2×
field-test timing. Worker build-rate improvements and higher-tier
factory production-rate improvements still accelerate progress against those longer
durations, so their relative advantages remain intact.
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

Right-clicking a completed, powered production building with an active unfinished
unit order assigns every selected Worker Drone to assist that factory. The command
replaces movement, combat, construction, queued construction, and repair orders.
Workers travel to within 24 world units of the factory footprint, then Tier 1, Tier
2, and Tier 3 workers provisionally add 0.25, 0.4, and 0.65 respectively to the
factory's production rate instead of adding their full construction build rate.
For power, the first assisting worker adds 20% of the factory's normal active
demand (idle plus production demand), the second adds 21%, the third 22%, and
each later worker adds one additional percentage point. Multiple workers stack
these escalating percentages. If the connected grid cannot pay the factory's idle,
production, and worker-assistance demand together, production and assistance pause
without losing the order or assignment. The assignment remains through temporary
power loss or a blocked factory exit, continues across later orders already in the
queue, and ends when the queue becomes empty or the worker receives another order.
A selected worker identifies the assisted factory, while a selected factory reports
the number of ready workers, combined assisted production speed, added assistance
demand, and total current energy demand. Active assistance uses the worker's
articulated tool animation and construction beam so the faster progress is visible
on the battlefield.

Worker Drones also repair damaged friendly mobile units and completed buildings.
An idle worker automatically acquires the nearest damaged friendly target within a
provisional 180-world-unit service radius. Active construction and queued builds,
explicit movement and attack orders, hold position, and a manually assigned repair
remain higher priority than automatic repair. Right-clicking a damaged friendly
target with workers selected replaces their current orders, sends them into repair
range, and suppresses automatic combat until the repair finishes or receives a
replacement command. Workers are valid repair targets for other workers, but a
worker can never repair itself. Multiple workers may repair the same target. Repairs
consume no crystal and provisionally restore 8/13/20 integrity per second at Tiers
1/2/3, spending 0.5 worker energy per point of integrity restored; a worker that
exhausts its battery enters ordinary stasis and keeps the repair assignment for when
it reactivates. Active repair uses a green tool beam distinct from construction.

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
rally point. The same command is available by right-clicking a world position on
the tactical minimap. Dragging a selection box around two or more friendly factories of the
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
The shared production controls remain available for that matching group. Each unit
order is paid for once and routed to a powered selected factory with the fewest
units currently queued. Ties prefer the factory with the least remaining production
work, then the group's deterministic selection order, so repeated clicks naturally
spread production instead of piling every order into the first factory. Unpowered
factories remain selected and share rally commands, but do not receive new group
production orders until powered again.

A new ordinary foundation snaps to footprint-aware centers on the visible 40-unit
construction grid, with every footprint edge aligned to a grid line, and must fit
inside the battlefield. Buildings use visibly different rectangular footprints,
from compact one-cell towers and turrets to multi-cell factories. A foundation
cannot overlap a living building, unfinished foundation, hostile unit, or
reclamation drone. Friendly player-controlled units do not block placement. When a
foundation is confirmed beneath friendly workers or combat units, those units are
immediately relocated to the nearest clear, locally escapable position outside the
new foundation, even if they are idle. A unit is destroyed only if no valid recovery
position exists; assigned builders otherwise begin construction from outside the
foundation. Crystal Harvesters instead snap to
their required deposit location. Invalid placement does not spend crystal and reports
the reason to the player. The player sees a green or red footprint preview before
confirming placement, and the enemy AI searches nearby grid cells when its preferred
site is blocked.

Building-to-building validation uses the exact visible grid footprints. It adds no
invisible movement padding, so adjacent footprints—including compact one-cell
turrets and towers—may share an edge without overlapping. Unit movement still
stops at the moving unit's own physical radius from the exact structure footprint;
there is no additional structure-clearance padding.

Tier 1 infrastructure is deliberately compact. Pulse Generators, Grid Batteries,
Induction Chargers, Crystal Harvesters, Power Relay Towers, Radar Arrays, Sentry Turrets, Shield
Turrets, and Mortar Turrets use 1×1 footprints. Tier 1 factories use 2×2 footprints.
Equivalent Tier 2 infrastructure uses 2×2 footprints except for the Tier 2 Power
Relay Tower, which remains 1×1. Crystal Harvesters are permanently capped at 2×2:
both their Tier 2 and Tier 3 versions use that footprint, with higher harvesting
output represented through their
machinery and stats rather than a larger occupied area. Tier 2 factories use 3×3
footprints. Every ordinary Tier 3 building keeps its Tier 2 footprint and physical
radius except for factories, which grow to 4×4. Exceptional strategic or experimental
structures may use larger bespoke footprints.

An incomplete friendly building is a contextual construction target. Right-clicking
it with one or more selected workers assigns those workers to continue construction,
including when the original builder was destroyed or given another order. A worker
that enters energy stasis keeps its construction assignment and resumes traveling or
building after reactivation. An unfinished building with no surviving assigned
worker is visibly marked as paused and explains the right-click recovery command.

Selecting an unfinished friendly building exposes a Cancel Construction command,
also available with the `C` shortcut. Cancellation removes the foundation, releases
its assigned workers, and refunds 75% of the crystal represented by its unbuilt
progress. Crystal already represented by completed progress is not refundable. The
75% refund rate is provisional.

Selecting one completed friendly building exposes a Destroy Building command.
Destruction is immediate, grants no crystal refund, and follows the ordinary
building-destruction rules, including losing stored energy and factory queues. A
player may destroy their Command Headquarters, which immediately eliminates that
commander as it would if an opponent destroyed it. Their buildings and foundations
are destroyed, while their surviving mobile units become neutral derelicts.

### 5.3 Economy and Static Defense Buildings

Each commander owns one irreplaceable **Command Headquarters**. Its provisional
3×3 profile has 1,800 integrity, generates 4 crystal and 20 energy per second,
projects a 320-world-unit power grid, and stores 240 energy with 20/90 energy-per-second
charge/discharge limits. It has a dedicated production queue containing only the
Tier 1 Worker Drone; active Headquarters production draws 6 energy per second. A
Headquarters cannot be constructed, upgraded, or replaced. Its integrated defensive
gun automatically engages hostiles at any distance out to the Tier 1 Mortar Turret's
provisional 420-world-unit maximum range, without a close-range dead zone. The gun
deals a deliberately weak 8 damage per shot, spends 4 capacitor energy, and reloads
in 1.2 seconds, so it discourages unopposed harassment without replacing a dedicated
static defense.

Crystal Harvesters provide continuous income while connected to a functioning power
network and passively consume 2 energy per second while operating. Other powered
economic buildings likewise apply their data-defined passive demand continuously.
Static defenses automatically engage hostile units, reclamation drones, and
structures within range and stop functioning when disconnected from an energized
network. These demand values remain provisional.

Shield Turrets create a protective field around themselves. Their provisional Tier
1/Tier 2/Tier 3 profiles provide 520/1,050/1,900 shield points, 250/355/480-world-unit
field radii, and 12/22/36 shield regeneration per second. They occupy 1×1, 2×2, and
2×2 footprints, have 340/560/820 integrity, cost 160/310/560 crystal, and passively
consume 2/4/7 energy per second respectively. A field intercepts damage aimed at
friendly units, reclamation drones, and structures whose centers are inside it,
including the Shield Turret itself. A hit is absorbed by the nearest eligible field;
overlapping fields do not stack on one hit. Damage beyond the field's remaining
strength spills through to the original target. An unpowered field is inactive but
retains its remaining strength. While powered, every tier draws another 0.75 grid
energy per restored shield point. Regeneration pauses when no surplus grid energy
is available. Every completed Shield Turret always displays a cyan shield-strength
bar directly above its green integrity bar, whether selected or not. Selecting the
turret additionally shows its field radius, current behavior, and numeric shield
strength.

Static defenses charge an internal weapon capacitor continuously from their local
grid. A shot spends capacitor energy, allowing normal generator output to build up
between shots without requiring a Grid Battery to satisfy the entire weapon cost
in one simulation tick. The selected-defense interface displays weapon range,
capacitor charge, and current behavior such as charging, ready, tracking, or firing.
Sentry and Mortar Turrets have no separate passive power demand: a full, idle
turret consumes no grid energy, and it draws power only when its capacitor needs to
replace energy spent firing. Mortars launch a visibly arcing, target-tracking shell
at a provisional 520 world units per second and report `TARGET TOO CLOSE` when
hostile targets exist only inside their dead zone.

The Strategic Supply Complex is an exceptionally large 8-by-6-grid-cell economic
building. It costs 1,200 crystal, takes 80 seconds to construct, and passively draws
6 energy per second. Its Level 2 upgrade costs 800 crystal and takes 25 powered
seconds; its Level 3 upgrade costs 1,600 crystal and takes 40 powered seconds. An
upgrade adds another 6 energy per second of demand while progressing and pauses
without adequate local-grid power. The enemy AI constructs and upgrades the same
building through the same paid commands available to the player.

Crystal Harvesters are location-constrained. They may only be constructed on unused,
map-defined crystal deposits and snap to the selected deposit. A second harvester cannot
occupy the same deposit while the existing harvester remains alive. Power generators
and other energy-production buildings are not deposit-constrained and may be
constructed on any otherwise valid terrain.

### 5.4 Standard Match Start

Every human or AI commander begins with exactly:

- One completed Command Headquarters.
- Three Tier 1 Worker Drones.
- One Tier 1 Mech Factory.
- One power generator.
- One completed Crystal Harvester on a nearby map-defined crystal deposit, within the
  starting generator's power network.

The Headquarters and starting harvester provide guaranteed crystal income so spending
the initial crystal cannot leave a commander unable to construct anything. The
Headquarters and starting generator both contribute energy to the initial grid. No battery, relay, charger,
reclamation yard, static defense, energy carrier, or combat unit is pre-built. Both
commanders use their workers and starting crystal income to expand their economy and
military.

### 5.5 Match End and Restart

A player wins when the only commanders with living units or buildings belong to the
player's selected team. The same rule causes defeat when only an opposing team has
living assets. Active, stasis, and unfinished entities count while they remain
alive; wrecks and reclamation drones do not postpone elimination. Destroying a
commander's Headquarters immediately destroys all of that commander's completed
structures and foundations. Their surviving mobile units and reclamation drones
instead join one neutral derelict faction. Derelicts retain their current integrity
and position but clear every order, target, ability, and support assignment; they do
not move, attack, repair, build, regenerate, transfer energy, or accept commands.
They remain valid hostile targets for every surviving commander, while all neutral
derelicts are non-hostile to one another. Because the neutral faction has no
commander, its units do not postpone victory or defeat. Allies remain in the match
and can still win for their shared team. Normal match resolution checks the
surviving commanders without waiting for another simulation tick. If the player's
team and final opposing team are eliminated by the same resolution, the player
receives a defeat.

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

Destroyed units, completed buildings, and unfinished foundations leave wreckage
containing a provisional 55 percent of their data-defined crystal value. Structures
normally use their construction cost as that value; the irreplaceable, zero-cost
Command Headquarters has a provisional 600-crystal salvage value. Cancelling an
unfinished foundation applies its normal refund and does not also create scrap.
Wreck fields turn locations of major battles and destroyed bases into economic
objectives.

Whenever a new wreck or dropped crystal scrap pile appears, every existing pile in
the same connected cluster within a provisional 80-world-unit merge radius
automatically consolidates into one larger pile. The consolidated pile contains the
exact sum of the remaining crystal, grows visually with that amount, and remains one
salvage target for every reclamation drone already traveling to the cluster. Distant
wreck fields remain separate. Consolidation happens when scrap is created rather
than through a repeated battlefield-wide scan, so large battles do not leave an
ever-growing collection of overlapping wreck entities.

### 7.1 Salvage Reclamation Yard

The Salvage Reclamation Yard is an optional economy building intended to become
more useful later in a match, when enough wreckage exists to justify automated
recovery. It is not an essential early-game economy structure.

Each Tier 1 yard controls three reclamation drones. Higher-tier yards add drones
and improve each drone already assigned to them, including drones that are away
from the yard when the upgrade completes. The provisional tier progression is:

- Tier 1: three drones, 130 world units per second, 24 crystal capacity, and an
  8-second replacement time.
- Tier 2: four drones, 165 world units per second, 36 crystal capacity, and a
  7-second replacement time.
- Tier 3: five drones, 200 world units per second, 48 crystal capacity, and a
  6-second replacement time.

Their default behavior is:

1. Find the nearest eligible unit or building wreck or crystal scrap pile with crystal remaining. More
   than one drone may choose the same pile.
2. Dispatch an available drone to the wreck.
3. Harvest crystal scrap from that wreck.
4. If the drone still has carrying capacity when the pile is exhausted, travel
   directly to the nearest remaining eligible pile and continue collecting.
5. Return the recovered crystal to the yard only when the drone is full or no
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
destroyed drone at no crystal or energy cost to the player. Replacement should take
a defined amount of time, preventing instant replacement while preserving the
building's low-maintenance automation role. A yard can never have more active or
rebuilding drones than its current tier allows.

If a reclamation drone is destroyed while carrying crystal scrap, all carried
crystal drops at the destruction location as a reclaimable crystal scrap pile. Its
replacement begins empty.

Collection time and behavior when the yard loses power remain tuning decisions.
Multiple drones may harvest the same wreck concurrently, but the implementation
must preserve its finite crystal and prevent them from collecting more than the
pile contains.

## 8. Enemy AI

Each enemy AI performs the same categories of action as the player: gathering
crystal, generating and relaying power, constructing buildings with workers,
producing units, maintaining defenses, supplying unit energy,
fighting, and reclaiming wreckage. It uses the same simulation commands and pays
the same costs; it does not receive hidden free units or buildings.

In matches with multiple AI opponents, each AI remains a separate commander. It
owns independent crystal, power, supply, technology unlocks, workers, production
queues, expansion choices, strategic decision state, and decision timing. By
default every commander is assigned to a different team. When three or more total
commanders are selected, the player may instead assign any human or AI commanders
to the same team. Teammates are non-hostile, share fog-of-war vision and victory,
and are included as friendly strength in AI construction decisions. They do not
share resources, power grids, direct unit control, construction projects, or
armies. Commanders on different teams may attack one another, claim any currently
unused deposit, and are subject to the same placement and occupancy checks.

Every AI has an independently selected Easy, Medium, or Hard difficulty, with
Medium as the default. Difficulty never grants free crystal, energy, units,
buildings, faster construction, extra weapon damage, or other hidden rule
exceptions. It changes deterministic command cadence and attack preparation:
Easy reevaluates every 1.8 seconds and waits for a five-unit ordinary assault wave,
Medium preserves the one-second cadence and three-unit wave, and Hard reevaluates
every 0.55 seconds while retaining the three-unit wave. The initial think delay
matches the selected cadence. These values remain provisional tuning.

The AI reassigns an available worker to an unfinished enemy foundation when its
original builder is destroyed or otherwise lost. If a preferred ordinary build
cell is blocked, it searches nearby valid grid cells; if a planned Crystal Harvester
deposit is unavailable, it searches the remaining deposits rather than abandoning
its construction plan. AI construction also compares friendly and hostile combat
strength around every proposed foundation. It avoids locally outmatched sites and
skips contested deposits in favor of safer expansions instead of knowingly placing
an undefended project beside a superior hostile force. Losing an unfinished or
freshly completed project creates a temporary no-build zone around that site, so
the AI cannot repeatedly spend crystal rebuilding into the same active kill zone.
The current threat radius, strength ratio, loss radius, and 60-second memory are
provisional.

Before spending crystal on a consumer or relay, the AI verifies that the
finished building can attach to an existing energized power node. A relay whose
preferred position is beyond the current grid is moved to the connected edge of
the network so it extends the grid toward the intended destination. The AI also
budgets factories at their active-production demand; when a planned building would
raise projected steady demand above completed generator output, it constructs and
finishes another generator beside that expansion before resuming the original
plan. It does not knowingly place disconnected consumers or expand demand beyond
its steady generation capacity.

The AI does not construct or upgrade Grid Batteries. It uses additional Pulse
Generators for its base power reserves while still constructing Power Relay Towers
when needed to extend an energized network. Chargers remain demand-driven army
support rather than a routine power-economy purchase. Its opening therefore
establishes a second paid Pulse Generator before the sentry and first combat force.
Afterward it deliberately maintains redundant generation instead of waiting for an
immediate shortage. It targets at least two Pulse Generators, adds roughly one
generator for every four non-generator structures, and plans for 20% generation
headroom above projected maximum demand. These routine generator requests remain
below urgent defense and technology or production-branch progression, use the
highest generator tier supported by the AI's completed Mech Factory and available
worker, and still pay normal construction costs.

The AI makes its first decision after one second and reevaluates every second. It
does not follow a fixed or map-specific building sequence. Instead, it scores its
current strategic needs, including nearby threats, missing production, grid
generation, static defense, demonstrated army-charging demand, crystal income,
relay coverage, reclaimable wreckage, supply pressure, and production capacity. A
rush can therefore move a defensive turret ahead of an economic choice, low
crystal can promote expansion once the base can protect it, and larger economies
naturally request additional generators, relays, defenses, salvage capacity, and
factories while charging infrastructure remains limited by actual low-energy
demand. The decision counter varies valid placement lanes but never dictates the
next structure type. These relative priorities are provisional tuning values.

Once a completed Mech Factory unlocks a higher structure tier, the AI also upgrades
its existing completed buildings through the same immediate, paid structure-upgrade
command available to the player. It upgrades one tier at a time, prefers bringing
lower-tier buildings up before applying final-tier upgrades, and prioritizes power
generation, crystal income, production, charging, and defense. It retains at least
400 crystal plus any crystal reserved for its next strategic building or supply plan
after securing its required combat force. Eligible upgrades are purchased before
routine unit orders can consume that surplus, and it does not upgrade a consumer
when the resulting maximum demand would exceed its generation headroom. Normal
footprint-clearance rules can postpone an upgrade.

After its second generator, second harvester, first Sentry Turret, first complete
combat wave, and diversified production branches are established, the AI adds
powered Shield Turrets to its construction scoring. Armed threats can make shield
coverage urgent before production diversification is complete. It maintains one
core shield initially, scales toward three as its mining footprint grows, and raises
shield priority when armed enemies threaten its infrastructure. It uses the highest
shield tier supported by its completed Mech Factory and available worker, pays the
ordinary crystal and energy costs, and upgrades existing shields through the same
structure-upgrade rules.

Aircraft observed near an AI base add a Flak Turret request to that same strategic
scoring system. AI mech and vehicle factories also produce Skyguards and Flak
Crawlers through the same role-balancing production logic used for other combat
units; none are spawned or granted for free.

Once its second generator, sentry, first combat wave, and paid expansion are
established, an AI with crystal above its low-economy recovery threshold
deliberately constructs a Tier 2 Mech Factory. It then produces a Tier 2 Worker
Drone and deliberately establishes its parallel production branches in order:
Tier 1 Vehicle Factory, Tier 2 Vehicle Factory, and Tier 2 Air Factory. These
branch requests outrank routine base growth so recurring generators, defenses,
relays, extra Mech Factories, and non-urgent expansion cannot starve them
indefinitely. After reaching three harvesters, the same stable
economy reserves for a Tier 3 Mech Factory, produces a Tier 3 Worker Drone, and
adds Tier 3 Vehicle and Air Factories before resuming ordinary infrastructure
growth. Each branch tier is built explicitly rather than skipping directly to a
later, more expensive factory. Immediate defense and low-crystal expansion may
temporarily outrank technology, but ordinary Tier 1 growth must not permanently
crowd Tier 2 or Tier 3 out of the strategy scorer. All advanced factories, workers,
and structures use the same prerequisites, crystal costs, build times, power
requirements, and vulnerable construction process as the player's equivalents.
The two- and three-harvester technology thresholds are provisional.

The AI still maintains redundant generation, local static defense, and a
three-unit combat reserve before committing to ordinary expansion. It does not
construct chargers from total army size or add a separate charger merely because a
higher structure tier becomes available. When at least two combat units within a provisional
520-world-unit base staging area fall to 50% energy or less, it may construct one
charger centered on that demonstrated demand. A living charger prevents any further
charger construction; higher-tier support comes from upgrading that structure.
Idle depleted combat units within the same staging distance route into the powered
charger field, and ordinary assault waves leave them there until they reach 90%
energy. A nearby rush still overrides this recharge delay. These demand, staging,
and release thresholds are provisional. The Strategic
Supply Complex is constructed only when remaining supply falls to 10 percent of
current capacity or less, and each later capacity upgrade is purchased only when
supply becomes that constrained again. Once the initial force is secured, the AI
reserves enough crystal for its highest-scoring current building need before queueing
ordinary combat units. Replacing a missing worker and rebuilding a deployed or
destroyed combat reserve take priority over that building reserve. Factories
balance their available combat roles by current and queued roster counts, then add
mobile energy support once a field army is large enough to need it. Mobile support
does not count as an ordinary combat role for production balancing. The AI fields
one supplier with its first complete attack wave, adds at most one more per eight
additional combat units, and never exceeds three living or queued mobile suppliers
across its Mech, Vehicle, and Air branches. These support thresholds are provisional.
Whenever powered factories have active queues, the AI assigns otherwise idle Worker
Drones to production assistance while retaining at least one unassigned worker for
construction. It assigns at most two assistants to one factory, uses lower-tier
workers first so advanced builders remain available, and adds workers only while
the connected grid can cover their normal tier-specific assistance demand plus the
AI's generation reserve. An assigned assistant remains with that active queue
instead of being taken for routine construction; it becomes available again when
the queue empties or another order invalidates the assignment.

After establishing its second generator and defense, the AI begins paid
economic expansion instead of relying indefinitely on its starting harvester. It seeks
the nearest unused non-frontier deposit first, constructs a normally vulnerable
generator outpost within power range when needed, and then has a worker construct
the harvester. Expansion has no harvester-count cap or fixed deposit sequence: after the
basic opening is covered, the AI maintains at least two harvesters and raises that
minimum by one every 55 seconds. Encountering a cluster of at least three player
Sentry Turrets immediately raises the current expansion target by one, allowing a
fortified player to trade early safety for an AI that takes map control faster. The
AI also seeks another harvester whenever its available crystal is at or below 400 or
reaches a 900-crystal expansion surplus. There is no upper harvester limit, so time,
recurring economic pressure, or later surpluses can carry expansion across the
entire map. It prefers non-frontier
deposits before farther frontier deposits and reevaluates ownership and placement
on every decision, so deposits already claimed by either side or temporarily
blocked by hostile units are skipped. Construction costs, travel, construction
time, power demand, and destruction all use normal simulation rules. The crystal
decision thresholds are provisional.

Enemy combat units stage until three active attackers are ready, then launch as a
coordinated wave only after a preflight strength check. Targets in the same
provisional 520-world-unit defense region share one nearest representative, and an
AI evaluates at most 64 such regions in one decision. For each representative, the
AI totals active hostile combat units and completed armed structures within the
same defense radius. It selects the nearest target whose local defensive strength
does not exceed the staged wave's strength by more than a provisional factor of
1.5. If the ordinary three-unit wave is outmatched, the units remain staged while
production prioritizes reinforcements; once enough attackers are present, the AI
sends the smallest safe wave. If the nearest objective is too strongly defended
but another evaluated region is safe, the wave attacks the safer objective instead.
The AI does not send an ordinary wave and then reverse it into a strategic retreat;
a dispatched formation continues its assault.

Advancing formations retain that strategic destination while stopping to fire at
any hostile unit or structure that enters weapon range; they resume the advance
after the local target is gone, and nearby targets do not pull the formation into a
chase. Newly produced attackers wait for a later wave instead of crossing the map
individually. Automatic attacks within weapon range still allow staged units to
defend themselves locally. If a player unit or structure appears within 800 world
units of enemy infrastructure, available defenders respond as soon as a minimum
three-unit force is staged. This local response bypasses the ordinary assault
target-selection preflight, but it still launches as one coordinated wave; a lone
defender waits for reinforcements instead of being sent into the fight piecemeal.
The cadence, response radius, defense-evaluation radius, strength ratio, and
minimum wave size are provisional.

Every completed AI harvester at least 480 world units from its starting command point is
treated as an outpost rather than an unprotected income structure. The building AI
prioritizes a powered Sentry Turret within 300 world units of each undefended
outpost and places it on the harvester's side facing the nearest hostile command
start rather than behind the harvester toward its own base. Two combat units are assigned to each outpost, excluded from ordinary
attack waves, and ordered to remain near the harvester. They immediately attack hostile
units or structures within 520 world units and return to their guard positions once
the local threat is gone. Production counts these garrisons in addition to the
field army, so protecting expansions does not permanently consume the next assault
wave. All defense and garrison values remain provisional.

## 9. Initial Playable Scope

The first vertical slice should validate energy logistics and automated salvage,
not attempt the final unit roster. It should include:

- Crystal income and reserves plus battery-limited energy storage.
- One crystal harvester and one generator.
- A local building-power rule.
- One charging structure.
- One Tier 1 production branch with a basic combat unit.
- One mobile energy supplier.
- Unit movement and weapon energy consumption.
- Stasis, emergency regeneration, and reactivation.
- Destroyed-unit and destroyed-building wreckage.
- One Salvage Reclamation Yard with three destructible, freely replaced drones.
- At least one energy-consuming special ability, used to validate the ability
  framework without making abilities universal.

### 9.1 Technical Direction

The browser game is the production foundation, not a temporary prototype for a
future dedicated-engine port. Simulation rules remain separate from rendering and
input to enable deterministic tests, replay recording, future multiplayer
synchronization, and rendering optimizations within the web platform.
The canonical simulation advances at exactly 30 numbered ticks per second. Its
elapsed gameplay time is derived from that integer tick count rather than renderer
frame timing. Authoritative human commands are queued for a numbered tick and
resolved in stable tick, commander-slot, and per-commander sequence order before
that tick advances. Identical initial snapshots and tick-scheduled command streams
must therefore produce the same canonical state hash. This is practical
determinism for testing, prediction, and future replays; multiplayer remains
host-authoritative rather than relying on cross-browser lockstep.

The battlefield uses Canvas rendering. Menus, command panels, accessibility
features, and other interface elements may use HTML and CSS where appropriate.
Canvas passes cull off-screen units, structures, deposits, terrain details, and grid
segments so match cost scales primarily with what the camera can actually show.
All non-strategic views retain the complete entity and terrain renderer even in
crowded battles; performance work must preserve that presentation rather than
silently substituting a lower-detail mode.
The static-page bootstrap gives every local JavaScript module in a page load the
same fresh version token. This prevents the hosting cache from mixing an older map
or simulation module with a newly deployed menu after reload.
Combat acquisition uses a spatial index rather than all-to-all scans. Physical unit
separation stops as soon as a solver pass finds no overlap and is capped at four
passes per tick, allowing unusually dense formations to finish spreading over
successive ticks instead of monopolizing one frame. Units without a current target
stagger new automatic acquisition scans across a provisional 0.2-second interval;
moving units and workers remain immediately responsive, and existing targets are
validated continuously. Static defenses stagger new acquisition across 0.1 seconds.
Chargers and mobile energy carriers query nearby units through the same bounded
spatial index instead of rescanning the complete army for every supplier.
Destroyed units and ordinary destroyed structures are removed from active entity
collections and ID lookup at the end of the tick after their wreckage and effects
are created, so old casualties do not enlarge later simulation work or multiplayer
snapshots. Destroyed reclamation yards remain only while needed to preserve their
drone state. An AI commander with no living units or structures skips its strategic
decision, and each decision reuses its preflight and population counts rather than
repeating identical large-army scans. The HTML status interface refreshes at ten
updates per second, while Canvas motion still renders every frame. Main-map and
minimap fog combine their visible vision circles into one mask fill per surface and
discard main-map circles wholly outside the viewport. The independent authoritative
heartbeat can catch up as many as 30 fixed steps after an interruption, then
publishes only its newest state.

Battlefields currently range from 5,200 by 3,200 world units for two commanders to
8,560 by 6,280 for eight. `WASD` pans the camera, and the mouse wheel zooms from a
dynamic whole-map fit to 200% around the world position beneath the pointer. The
renderer switches to proportional strategic icons at 45% and below so large armies
and bases remain readable at strategic scale without hiding their relative size.
Camera movement remains available
while the simulation is paused, and the camera is clamped to the active map's
dimensions so it cannot expose space beyond the battlefield boundary.

### 9.2 Match Menu, Unit Tester, and Multiplayer

The game opens on a mode menu. Single Player lets the human choose two through eight
total players and then choose among every map supporting that player count. Each AI
row has its own Easy, Medium, or Hard selector. At three or more total players,
every commander row also has a Team selector; two-player matches remain opposing
one-on-one matches and hide team controls. At least two teams must be represented
before a match can begin. All AI opponents run their full commander logic. The
local human is blue, and up to seven opponents receive distinct red, orange,
yellow, purple, green, magenta, and pale-gray accents so ownership remains readable.

Unit Tester is a separate single-player setup with the same two-through-eight-player,
per-AI difficulty, team-assignment, and compatible-map choices. The human commander starts with Tier 3 Worker Drones
and has unlimited crystal, grid energy, unit energy, and supply. Human foundations
complete as soon as they are placed, and human factory orders finish on the next
simulation step while retaining collision-safe factory exits. Human nuclear missile
construction also completes immediately when ordered. Normal placement,
footprint, crystal-deposit, factory-branch, and factory-tier restrictions still apply,
so the tester exercises real gameplay definitions instead of bypassing them with
synthetic entities. Every AI commander in a Unit Tester match retains its ordinary
resource balance, power networks, construction time, production time, supply use,
technology progression, and combat behavior; tester advantages never apply to AI
teams. A dedicated Enemy Spawner lets the tester choose any AI commander, select
any ordinary field building or unit definition, and place that asset directly on a valid battlefield
position for free. Spawned buildings are completed immediately, while spawned units
must pass the ordinary terrain, map-edge, structure, and unit collision checks.
Crystal Harvesters still require an unused deposit and every building still uses its normal
grid footprint. Once placed, enemy assets belong to the selected AI and receive no
tester advantages: consumers require a normal powered grid, units use ordinary
energy and supply behavior, and the AI may command the assets through its usual
logic. Tester-team state is included in simulation snapshots so resetting or
restoring the field preserves the mode's rules.

Multiplayer uses a visible pre-match roster shared by the host and guest. The roster
always identifies the host and lists the connected guest and every AI bot. The host
may add or remove bots up to the eight-commander match maximum and explicitly
starts the match. The host selects every bot's difficulty. Once the roster has at
least three commanders, the host also assigns the host, guest, and bots to teams;
the synchronized guest roster displays those choices read-only. At least two teams
must be represented. A lobby can start with the host and AI bots even when no guest
is connected. When a guest is present, the host controls the first commander, the
guest controls the second commander, and any remaining slots are AI commanders.
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

When a guest is present, starting uses an acknowledged handshake rather than
allowing the host to enter immediately after queuing one network message. The guest
must load the authoritative initial snapshot and return its matching start
identifier before the host enters the battlefield. This acknowledgement is
automatic and is returned immediately after loading; it does not require a second
player action or an artificial confirmation delay. Match setup and state objects use
PeerJS's chunk-capable binary serialization so larger commander rosters cannot
exceed the unfragmented JSON-channel message limit. The host retries an
unacknowledged setup for a short bounded period. A rejection, timeout, or disconnect
keeps the host in the lobby and explains why the start failed, preventing a match
from beginning with only one player admitted.

PeerJS Cloud brokers the WebRTC handshake associated with the short code; game
commands and snapshots still travel directly between the players. No game account
or dedicated Crimson Dawn gameplay server is required. A public STUN service
assists peer discovery, so both players need internet access and some highly
restricted or symmetric-NAT networks may still prevent a direct connection.

The host owns the canonical simulation, validates incoming commands against the
guest's team, applies the lobby's randomized map and AI configuration, and offers
versioned simulation snapshots to the guest up to four times per second. Every host
state carries a monotonically increasing sequence number, canonical tick number,
and deterministic hash of the complete snapshot. The guest ignores older state and
refuses a snapshot whose tick or hash does not match its payload. Host and guest
commands are applied only at tick boundaries in stable commander and command
sequence order; the host reports the assigned execution tick when acknowledging a
guest command. The host advances the entire canonical battlefield from a fixed-step
heartbeat that is
independent of rendering, camera position, and visible-entity culling. Remote and
off-screen units, construction, production, combat, economy, and AI therefore keep
advancing when the host looks elsewhere, and a delayed browser heartbeat catches up
a bounded amount of elapsed simulation time before publishing its newest state. The
guest never advances a second canonical simulation between snapshots. Instead, it
predicts its own submitted commands against the latest host state, replays still-unacknowledged
commands when a newer state arrives, and removes or corrects them when the host
acknowledges the result. This keeps placement and other commands responsive without
allowing the peers to become split-brained. On the guest, mobile units and
reclamation drones receive compact, tick-numbered authoritative position updates up
to 15 times per second in addition to the complete four-per-second state snapshots.
The guest derives motion velocity from canonical tick differences and uses a
120-millisecond cubic transition that preserves both displayed position and velocity
when a correction arrives. If the next update is delayed, the visual position
continues at its last authoritative velocity for up to 500 milliseconds before
holding, and the next correction begins from that displayed position without a snap.
This presentation-only coasting does not advance gameplay, combat, resources, or any
second canonical simulation. Older motion ticks are ignored. Transient motion
updates continue while a newer complete state is merely waiting for the preceding
state's acknowledgement, preventing acknowledgement latency from reducing guest
motion to the snapshot cadence. They are dropped rather than queued while the
outgoing channel is actually busy, so smoother rendering cannot build a delivery
backlog or delay authoritative synchronization. Selection,
target hit-testing, and the tactical minimap use the same displayed positions so the
visual and interactive surfaces remain aligned. When the outgoing channel is congested,
the host retains only the newest waiting snapshot; stale snapshots may not build an
ever-older delivery backlog. Only one full snapshot may be in flight at once. The
guest acknowledges a sequence after it has received and loaded that state, allowing
the host to send the newest waiting state at the actual connection's sustainable
rate. PeerJS Cloud remains only a signaling broker: losing its socket after the
direct WebRTC data channel opens does not end an active match. An actual data-channel
close still pauses the match and reports the lost player connection. Transport send
failures are contained and surfaced to the player rather than escaping the animation
loop and stopping the game.
Movement, attack, construction, production, rally, stop, ability, transport loading
and unloading, cancellation, and upgrade commands all use the same simulation APIs
as single player. Pausing and
match resets are disabled during multiplayer; either player may leave the match and
return to the mode menu. Automatic reconnection and spectators are not yet
implemented.

### 9.3 Spawn Wars

Spawn Wars is a separate online-only mode for two through four human browsers. It
does not offer AI opponents or a one-player start. The host remains authoritative
and may accept up to three direct PeerJS/WebRTC guest connections while the static
game is hosted on GitHub Pages. Two players form a fixed 1v1, three form a fixed
2v1 with the host and first guest on the western team, and four form a fixed 2v2.
Each human retains separate unit ownership, crystal, platform upgrades, and build
commands even when allied.

The mode uses a flat 8,400-by-2,000 arena. The two 900-world-unit-deep phase-build
zones retain their base-side positions, leaving more than 6,000 world units of open
combat lane between their inner edges. Every commander receives one
invulnerable, untargetable flying Spawn Architect and a bounded, visibly marked
phase-build zone. Allied commanders receive separate vertical halves of their
team's zone. Architects can move normally but cannot attack, be attacked, run out
of energy, or construct the standard economy and production tree. Tier upgrades
cost 100 and 200 crystal and unlock matching unit-platform tiers.

An Architect places a unit-specific Spawn Platform at a deeply discounted crystal
price: 50 percent of that unit's normal value, increased by only 15 percent of that
base for each tier above Tier 1, with a 25-crystal minimum. Ordinary platforms occupy a 2x2
placement footprint; experimental-unit platforms occupy 3x3. They take six seconds
to construct. Platforms exist on a separate phase layer: units may pass over them,
they do not participate in ground or air collision/pathfinding, enemies do not
target them, and damage cannot affect them. Platforms cannot overlap other phase
platforms or leave their owner's build zone. The owner may select and destroy a
completed platform for 75 percent of its original platform purchase price, rounded
down to whole crystal; stat-upgrade spending is not refunded. Selecting a completed
platform also exposes a Move Building command. Relocation is immediate and free,
uses the same grid, ownership-zone, and phase-platform overlap validation as initial
placement, and preserves the platform's configured unit, stat upgrades, and current
spawn countdown. Removed phase platforms leave no reclaimable wreck.

Every completed platform creates its configured unit on the shared 30-second income
clock. Each income payment and platform wave resolve together, so platforms built
at different times and platforms producing different unit roles or tiers all join
the same synchronized wave. New units automatically attack-move toward the opposing
Command Core. Spawned lane units cannot be selected or receive player-issued
movement, attack, stop, patrol, transport, worker, or ability commands; players
control the battle through their Architect and platforms instead. Every spawned
combat unit uses the same provisional 105-world-unit movement speed in this mode.
Normal unit identity, health, weapons, firing range, target restrictions, and
collision remain intact; unit energy is continuously available so the mode's
automatic lane battle does not stall on the standard logistics loop.

Selecting an owned completed platform exposes uncapped Integrity, Armor, Weapon
Damage, and Attack Speed upgrades. A player may purchase each category indefinitely
and independently for every platform. These upgrades affect only units spawned
after the purchase. Their discounted base prices use 15/18/22/20 percent of normal
unit value for Integrity/Armor/Weapon Damage/Attack Speed, with a 20-crystal
minimum. Higher tiers add 25 percent of that base per tier and Bulwarks and
experimental units add 15 percent. Every repeated level increases its category's
cost by another 20 percent of the resulting base, while a Tier 3 or Bulwark damage
upgrade still costs more than a Tier 1 light-unit damage upgrade. A Special Ability
upgrade is visibly reserved but disabled: later work will define those abilities,
after which spawned units will use them automatically.

Every commander begins with 650 crystal. Every 30 seconds each living commander
receives 120 crystal, increased by 35 percent of base for each income level. Income
upgrades have no maximum level: Level 1 costs 150 crystal and each later level costs
50 crystal more than the previous one. Destroying a hostile spawned unit also awards the killing commander
20 percent of its crystal value, with an eight-crystal minimum. Each stat-upgrade
level carried by that unit adds a provisional 10 percent of its base crystal value
before the 20-percent kill reward is calculated, so upgrades purchased after a unit
spawned do not retroactively change its bounty. Destroyed units do not leave
reclaimable crystal scrap in Spawn Wars, regardless of their owner. A 240-world-unit
capture band spans the arena center. The latest spawned unit to cross completely
through that band toward the opposing side gives its alliance center control;
every commander on the controlling alliance receives an additional 60 crystal on
each 30-second payment.

Each side has an invulnerable-to-self-destruction but enemy-destructible Frontline
Annihilator turret in front of its Spawn Command Core. Both objectives have
independent, permanently powered long-range weapons. The Frontline Annihilator uses
a compact 2×2 footprint and the same top-down twin-barrel appearance as a Tier 3
Sentry Turret, while retaining its separate objective rules and 12,000 integrity.
Its provisional weapon range is 480 world units. The Command Core cannot be
targeted or damaged until its alliance's turret is destroyed. Destroying the Core
eliminates that alliance and ends the match. The phrase “cannot be destroyed by
enemies” applies to Spawn Platforms and Architects, not to these two sequential
combat objectives; otherwise the turret-to-Core victory sequence would be
unreachable.

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
