# Tests

This is the complete human-readable catalog of Crimson Dawn's automated tests.
The executable sources remain in `test/` and run with `npm test`; keeping them
separate preserves readable, maintainable test code while this root file gives
GitHub visitors one place to see everything that is checked.

Do not edit the generated test entries by hand. Run `npm run tests:catalog` after
adding, removing, or renaming a test. `npm test` and `npm run check` both fail when
this catalog is out of date.

**Automated tests documented:** 288

## [test/bootstrap.test.js](test/bootstrap.test.js)

<!-- test-catalog-entry: ["test/bootstrap.test.js","the static bootstrap requests a fresh, consistent local module set"] -->
### 1. the static bootstrap requests a fresh, consistent local module set

**What it checks:** Inspects the browser entry point and interface wiring to confirm that the static bootstrap requests a fresh, consistent local module set.

<!-- test-catalog-entry: ["test/bootstrap.test.js","the tactical minimap routes right-clicks into selected-unit move orders"] -->
### 2. the tactical minimap routes right-clicks into selected-unit move orders

**What it checks:** Inspects the browser entry point and interface wiring to confirm that the tactical minimap routes right-clicks into selected-unit move orders.

<!-- test-catalog-entry: ["test/bootstrap.test.js","unit command authorization accepts the complete simulated army"] -->
### 3. unit command authorization accepts the complete simulated army

**What it checks:** Inspects the browser entry point and interface wiring to confirm that unit command authorization accepts the complete simulated army.

<!-- test-catalog-entry: ["test/bootstrap.test.js","Dropship controls expose explicit, balanced, and unload command paths"] -->
### 4. Dropship controls expose explicit, balanced, and unload command paths

**What it checks:** Inspects the browser entry point and interface wiring to confirm that Dropship controls expose explicit, balanced, and unload command paths.

<!-- test-catalog-entry: ["test/bootstrap.test.js","the battlefield, minimap, effects, and targeting share fog visibility"] -->
### 5. the battlefield, minimap, effects, and targeting share fog visibility

**What it checks:** Inspects the browser entry point and interface wiring to confirm that the battlefield, minimap, effects, and targeting share fog visibility.

<!-- test-catalog-entry: ["test/bootstrap.test.js","completed Shield Turrets always render their cyan shield-strength bar"] -->
### 6. completed Shield Turrets always render their cyan shield-strength bar

**What it checks:** Inspects the browser entry point and interface wiring to confirm that completed Shield Turrets always render their cyan shield-strength bar.

<!-- test-catalog-entry: ["test/bootstrap.test.js","the Hexapod renderer uses an elongated hull, tri-claw feet, and armored turrets"] -->
### 7. the Hexapod renderer uses an elongated hull, tri-claw feet, and armored turrets

**What it checks:** Inspects the browser entry point and interface wiring to confirm that the Hexapod renderer uses an elongated hull, tri-claw feet, and armored turrets.

<!-- test-catalog-entry: ["test/bootstrap.test.js","higher-tier armed sprites render their data-driven weapon attachments"] -->
### 8. higher-tier armed sprites render their data-driven weapon attachments

**What it checks:** Inspects the browser entry point and interface wiring to confirm that higher-tier armed sprites render their data-driven weapon attachments.

<!-- test-catalog-entry: ["test/bootstrap.test.js","right-clicking an active friendly factory sends selected workers to assist production"] -->
### 9. right-clicking an active friendly factory sends selected workers to assist production

**What it checks:** Inspects the browser entry point and interface wiring to confirm that right-clicking an active friendly factory sends selected workers to assist production.

<!-- test-catalog-entry: ["test/bootstrap.test.js","the interface and battlefield present the economy as crimson crystal"] -->
### 10. the interface and battlefield present the economy as crimson crystal

**What it checks:** Inspects the browser entry point and interface wiring to confirm that the interface and battlefield present the economy as crimson crystal.

<!-- test-catalog-entry: ["test/bootstrap.test.js","match setup exposes per-AI difficulty and team assignment controls"] -->
### 11. match setup exposes per-AI difficulty and team assignment controls

**What it checks:** Inspects the browser entry point and interface wiring to confirm that match setup exposes per-AI difficulty and team assignment controls.

## [test/determinism.test.js](test/determinism.test.js)

<!-- test-catalog-entry: ["test/determinism.test.js","scheduled commands execute in tick, player-slot, and sequence order"] -->
### 1. scheduled commands execute in tick, player-slot, and sequence order

**What it checks:** Runs deterministic command and snapshot checks to confirm that scheduled commands execute in tick, player-slot, and sequence order.

<!-- test-catalog-entry: ["test/determinism.test.js","state hashes ignore object key insertion order and detect gameplay changes"] -->
### 2. state hashes ignore object key insertion order and detect gameplay changes

**What it checks:** Runs deterministic command and snapshot checks to confirm that state hashes ignore object key insertion order and detect gameplay changes.

<!-- test-catalog-entry: ["test/determinism.test.js","deterministic state messages bind their tick and complete snapshot"] -->
### 3. deterministic state messages bind their tick and complete snapshot

**What it checks:** Runs deterministic command and snapshot checks to confirm that deterministic state messages bind their tick and complete snapshot.

<!-- test-catalog-entry: ["test/determinism.test.js","identical tick-scheduled command streams produce identical simulation hashes"] -->
### 4. identical tick-scheduled command streams produce identical simulation hashes

**What it checks:** Runs deterministic command and snapshot checks to confirm that identical tick-scheduled command streams produce identical simulation hashes.

## [test/multiplayer.test.js](test/multiplayer.test.js)

<!-- test-catalog-entry: ["test/multiplayer.test.js","host and guest connect through one short lobby code and exchange game messages"] -->
### 1. host and guest connect through one short lobby code and exchange game messages

**What it checks:** Exercises lobby and peer-session behavior to confirm that host and guest connect through one short lobby code and exchange game messages.

<!-- test-catalog-entry: ["test/multiplayer.test.js","the host enters only after the guest loads and acknowledges the match start"] -->
### 2. the host enters only after the guest loads and acknowledges the match start

**What it checks:** Exercises lobby and peer-session behavior to confirm that the host enters only after the guest loads and acknowledges the match start.

<!-- test-catalog-entry: ["test/multiplayer.test.js","match starts are retried and time out without admitting the host alone"] -->
### 3. match starts are retried and time out without admitting the host alone

**What it checks:** Exercises lobby and peer-session behavior to confirm that match starts are retried and time out without admitting the host alone.

<!-- test-catalog-entry: ["test/multiplayer.test.js","host state backpressure keeps only the newest unsent snapshot"] -->
### 4. host state backpressure keeps only the newest unsent snapshot

**What it checks:** Exercises lobby and peer-session behavior to confirm that host state backpressure keeps only the newest unsent snapshot.

<!-- test-catalog-entry: ["test/multiplayer.test.js","host state delivery keeps one snapshot in flight until the guest acknowledges it"] -->
### 5. host state delivery keeps one snapshot in flight until the guest acknowledges it

**What it checks:** Exercises lobby and peer-session behavior to confirm that host state delivery keeps one snapshot in flight until the guest acknowledges it.

<!-- test-catalog-entry: ["test/multiplayer.test.js","transient motion updates yield to a waiting canonical snapshot"] -->
### 6. transient motion updates yield to a waiting canonical snapshot

**What it checks:** Exercises lobby and peer-session behavior to confirm that transient motion updates yield to a waiting canonical snapshot.

<!-- test-catalog-entry: ["test/multiplayer.test.js","a signaling broker error does not close an established direct match"] -->
### 7. a signaling broker error does not close an established direct match

**What it checks:** Exercises lobby and peer-session behavior to confirm that a signaling broker error does not close an established direct match.

<!-- test-catalog-entry: ["test/multiplayer.test.js","a large four-player match setup is chunkable and acknowledged without a retry delay"] -->
### 8. a large four-player match setup is chunkable and acknowledged without a retry delay

**What it checks:** Exercises lobby and peer-session behavior to confirm that a large four-player match setup is chunkable and acknowledged without a retry delay.

<!-- test-catalog-entry: ["test/multiplayer.test.js","a data-channel send failure is reported without escaping into the game loop"] -->
### 9. a data-channel send failure is reported without escaping into the game loop

**What it checks:** Exercises lobby and peer-session behavior to confirm that a data-channel send failure is reported without escaping into the game loop.

## [test/network-presentation.test.js](test/network-presentation.test.js)

<!-- test-catalog-entry: ["test/network-presentation.test.js","multiplayer combines canonical snapshots with frequent overlapping motion updates"] -->
### 1. multiplayer combines canonical snapshots with frequent overlapping motion updates

**What it checks:** Exercises remote-position smoothing to confirm that multiplayer combines canonical snapshots with frequent overlapping motion updates.

<!-- test-catalog-entry: ["test/network-presentation.test.js","guest mobile positions interpolate between authoritative snapshots"] -->
### 2. guest mobile positions interpolate between authoritative snapshots

**What it checks:** Exercises remote-position smoothing to confirm that guest mobile positions interpolate between authoritative snapshots.

<!-- test-catalog-entry: ["test/network-presentation.test.js","a new snapshot continues from the currently displayed point without jumping"] -->
### 3. a new snapshot continues from the currently displayed point without jumping

**What it checks:** Exercises remote-position smoothing to confirm that a new snapshot continues from the currently displayed point without jumping.

<!-- test-catalog-entry: ["test/network-presentation.test.js","tick-timed motion updates preserve displayed velocity across corrections"] -->
### 4. tick-timed motion updates preserve displayed velocity across corrections

**What it checks:** Exercises remote-position smoothing to confirm that tick-timed motion updates preserve displayed velocity across corrections.

<!-- test-catalog-entry: ["test/network-presentation.test.js","stale motion ticks cannot pull presentation backward"] -->
### 5. stale motion ticks cannot pull presentation backward

**What it checks:** Exercises remote-position smoothing to confirm that stale motion ticks cannot pull presentation backward.

<!-- test-catalog-entry: ["test/network-presentation.test.js","compact motion messages contain only validated mobile coordinates"] -->
### 6. compact motion messages contain only validated mobile coordinates

**What it checks:** Exercises remote-position smoothing to confirm that compact motion messages contain only validated mobile coordinates.

<!-- test-catalog-entry: ["test/network-presentation.test.js","new mobile entities appear at their authoritative position"] -->
### 7. new mobile entities appear at their authoritative position

**What it checks:** Exercises remote-position smoothing to confirm that new mobile entities appear at their authoritative position.

## [test/queue-status.test.js](test/queue-status.test.js)

<!-- test-catalog-entry: ["test/queue-status.test.js","production queue status shows the active progress and ordered next items"] -->
### 1. production queue status shows the active progress and ordered next items

**What it checks:** Builds queue status summaries to confirm that production queue status shows the active progress and ordered next items.

<!-- test-catalog-entry: ["test/queue-status.test.js","production queue status explains power and blocked-exit waits"] -->
### 2. production queue status explains power and blocked-exit waits

**What it checks:** Builds queue status summaries to confirm that production queue status explains power and blocked-exit waits.

<!-- test-catalog-entry: ["test/queue-status.test.js","construction queue status shows foundation progress and placement order"] -->
### 3. construction queue status shows foundation progress and placement order

**What it checks:** Builds queue status summaries to confirm that construction queue status shows foundation progress and placement order.

## [test/simulation-clock.test.js](test/simulation-clock.test.js)

<!-- test-catalog-entry: ["test/simulation-clock.test.js","the authoritative clock moves remote units without animation frames or camera visibility"] -->
### 1. the authoritative clock moves remote units without animation frames or camera visibility

**What it checks:** Advances the authoritative clock to confirm that the authoritative clock moves remote units without animation frames or camera visibility.

<!-- test-catalog-entry: ["test/simulation-clock.test.js","a delayed host heartbeat catches up canonical simulation time"] -->
### 2. a delayed host heartbeat catches up canonical simulation time

**What it checks:** Advances the authoritative clock to confirm that a delayed host heartbeat catches up canonical simulation time.

<!-- test-catalog-entry: ["test/simulation-clock.test.js","paused clocks discard elapsed time instead of catching it up later"] -->
### 3. paused clocks discard elapsed time instead of catching it up later

**What it checks:** Advances the authoritative clock to confirm that paused clocks discard elapsed time instead of catching it up later.

## [test/simulation.test.js](test/simulation.test.js)

<!-- test-catalog-entry: ["test/simulation.test.js","unit production and building construction use the global 4x duration scale"] -->
### 1. unit production and building construction use the global 4x duration scale

**What it checks:** Runs the deterministic game simulation to confirm that unit production and building construction use the global 4x duration scale.

<!-- test-catalog-entry: ["test/simulation.test.js","the irreplaceable Command Headquarters provides economy and only Tier 1 workers"] -->
### 2. the irreplaceable Command Headquarters provides economy and only Tier 1 workers

**What it checks:** Runs the deterministic game simulation to confirm that the irreplaceable Command Headquarters provides economy and only Tier 1 workers.

<!-- test-catalog-entry: ["test/simulation.test.js","the tactical minimap fits the whole battlefield and maps its viewport"] -->
### 3. the tactical minimap fits the whole battlefield and maps its viewport

**What it checks:** Runs the deterministic game simulation to confirm that the tactical minimap fits the whole battlefield and maps its viewport.

<!-- test-catalog-entry: ["test/simulation.test.js","worker tiers expose the requested inherited construction matrix"] -->
### 4. worker tiers expose the requested inherited construction matrix

**What it checks:** Runs the deterministic game simulation to confirm that worker tiers expose the requested inherited construction matrix.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester advantages apply only to the designated human team"] -->
### 5. unit tester advantages apply only to the designated human team

**What it checks:** Runs the deterministic game simulation to confirm that unit tester advantages apply only to the designated human team.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester construction completes immediately while AI construction stays normal"] -->
### 6. unit tester construction completes immediately while AI construction stays normal

**What it checks:** Runs the deterministic game simulation to confirm that unit tester construction completes immediately while AI construction stays normal.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester factory orders deploy on the next simulation step without spending crystal"] -->
### 7. unit tester factory orders deploy on the next simulation step without spending crystal

**What it checks:** Runs the deterministic game simulation to confirm that unit tester factory orders deploy on the next simulation step without spending crystal.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester team rules survive simulation snapshots"] -->
### 8. unit tester team rules survive simulation snapshots

**What it checks:** Runs the deterministic game simulation to confirm that unit tester team rules survive simulation snapshots.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester can instantly place completed buildings for an AI without funding it"] -->
### 9. unit tester can instantly place completed buildings for an AI without funding it

**What it checks:** Runs the deterministic game simulation to confirm that unit tester can instantly place completed buildings for an AI without funding it.

<!-- test-catalog-entry: ["test/simulation.test.js","unit tester can place collision-safe AI units that retain ordinary ownership"] -->
### 10. unit tester can place collision-safe AI units that retain ordinary ownership

**What it checks:** Runs the deterministic game simulation to confirm that unit tester can place collision-safe AI units that retain ordinary ownership.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy spawning is unavailable outside Unit Tester and cannot target the tester team"] -->
### 11. enemy spawning is unavailable outside Unit Tester and cannot target the tester team

**What it checks:** Runs the deterministic game simulation to confirm that enemy spawning is unavailable outside Unit Tester and cannot target the tester team.

<!-- test-catalog-entry: ["test/simulation.test.js","construction authorization is enforced by the simulation"] -->
### 12. construction authorization is enforced by the simulation

**What it checks:** Runs the deterministic game simulation to confirm that construction authorization is enforced by the simulation.

<!-- test-catalog-entry: ["test/simulation.test.js","production-building branches expose their requested tiers"] -->
### 13. production-building branches expose their requested tiers

**What it checks:** Runs the deterministic game simulation to confirm that production-building branches expose their requested tiers.

<!-- test-catalog-entry: ["test/simulation.test.js","experimental factory exposes three distinct strategic units"] -->
### 14. experimental factory exposes three distinct strategic units

**What it checks:** Runs the deterministic game simulation to confirm that experimental factory exposes three distinct strategic units.

<!-- test-catalog-entry: ["test/simulation.test.js","experimental factory accepts paid production orders"] -->
### 15. experimental factory accepts paid production orders

**What it checks:** Runs the deterministic game simulation to confirm that experimental factory accepts paid production orders.

<!-- test-catalog-entry: ["test/simulation.test.js","hexapod landship strides through structures but still respects terrain"] -->
### 16. hexapod landship strides through structures but still respects terrain

**What it checks:** Runs the deterministic game simulation to confirm that hexapod landship strides through structures but still respects terrain.

<!-- test-catalog-entry: ["test/simulation.test.js","hexapod landship shells deal damage on impact instead of before firing"] -->
### 17. hexapod landship shells deal damage on impact instead of before firing

**What it checks:** Runs the deterministic game simulation to confirm that hexapod landship shells deal damage on impact instead of before firing.

<!-- test-catalog-entry: ["test/simulation.test.js","hexapod landship weapon systems independently engage different targets"] -->
### 18. hexapod landship weapon systems independently engage different targets

**What it checks:** Runs the deterministic game simulation to confirm that hexapod landship weapon systems independently engage different targets.

<!-- test-catalog-entry: ["test/simulation.test.js","Zenith Doughnut burns ground targets directly beneath it while moving"] -->
### 19. Zenith Doughnut burns ground targets directly beneath it while moving

**What it checks:** Runs the deterministic game simulation to confirm that Zenith Doughnut burns ground targets directly beneath it while moving.

<!-- test-catalog-entry: ["test/simulation.test.js","Zenith Doughnuts only auto-acquire nearby ground targets"] -->
### 20. Zenith Doughnuts only auto-acquire nearby ground targets

**What it checks:** Runs the deterministic game simulation to confirm that Zenith Doughnuts only auto-acquire nearby ground targets.

<!-- test-catalog-entry: ["test/simulation.test.js","Zenith Doughnuts hover directly over a locally acquired target"] -->
### 21. Zenith Doughnuts hover directly over a locally acquired target

**What it checks:** Runs the deterministic game simulation to confirm that Zenith Doughnuts hover directly over a locally acquired target.

<!-- test-catalog-entry: ["test/simulation.test.js","explicit orders take priority over automatic Zenith pursuit"] -->
### 22. explicit orders take priority over automatic Zenith pursuit

**What it checks:** Runs the deterministic game simulation to confirm that explicit orders take priority over automatic Zenith pursuit.

<!-- test-catalog-entry: ["test/simulation.test.js","airborne Zenith Doughnuts do not push ground units out of their beam"] -->
### 23. airborne Zenith Doughnuts do not push ground units out of their beam

**What it checks:** Runs the deterministic game simulation to confirm that airborne Zenith Doughnuts do not push ground units out of their beam.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier building variants retain their family behavior"] -->
### 24. higher-tier building variants retain their family behavior

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier building variants retain their family behavior.

<!-- test-catalog-entry: ["test/simulation.test.js","every higher-tier infrastructure building improves its defining function"] -->
### 25. every higher-tier infrastructure building improves its defining function

**What it checks:** Runs the deterministic game simulation to confirm that every higher-tier infrastructure building improves its defining function.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier sentries deal more damage and reach targets that Tier 1 cannot"] -->
### 26. higher-tier sentries deal more damage and reach targets that Tier 1 cannot

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier sentries deal more damage and reach targets that Tier 1 cannot.

<!-- test-catalog-entry: ["test/simulation.test.js","sentry turrets use the strengthened weapon profiles"] -->
### 27. sentry turrets use the strengthened weapon profiles

**What it checks:** Runs the deterministic game simulation to confirm that sentry turrets use the strengthened weapon profiles.

<!-- test-catalog-entry: ["test/simulation.test.js","mortar turrets enforce minimum and maximum range"] -->
### 28. mortar turrets enforce minimum and maximum range

**What it checks:** Runs the deterministic game simulation to confirm that mortar turrets enforce minimum and maximum range.

<!-- test-catalog-entry: ["test/simulation.test.js","workers can build and upgrade every mortar turret tier"] -->
### 29. workers can build and upgrade every mortar turret tier

**What it checks:** Runs the deterministic game simulation to confirm that workers can build and upgrade every mortar turret tier.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier factories have progressively faster production throughput"] -->
### 30. higher-tier factories have progressively faster production throughput

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier factories have progressively faster production throughput.

<!-- test-catalog-entry: ["test/simulation.test.js","workers add their tier-specific build rates to active factory production"] -->
### 31. workers add their tier-specific build rates to active factory production

**What it checks:** Runs the deterministic game simulation to confirm that workers add their tier-specific build rates to active factory production.

<!-- test-catalog-entry: ["test/simulation.test.js","production assistance requires an active friendly factory and overrides worker combat"] -->
### 32. production assistance requires an active friendly factory and overrides worker combat

**What it checks:** Runs the deterministic game simulation to confirm that production assistance requires an active friendly factory and overrides worker combat.

<!-- test-catalog-entry: ["test/simulation.test.js","completed mech factories globally unlock matching structure upgrades"] -->
### 33. completed mech factories globally unlock matching structure upgrades

**What it checks:** Runs the deterministic game simulation to confirm that completed mech factories globally unlock matching structure upgrades.

<!-- test-catalog-entry: ["test/simulation.test.js","structure upgrade unlocks are team-specific and expanded footprints need clear space"] -->
### 34. structure upgrade unlocks are team-specific and expanded footprints need clear space

**What it checks:** Runs the deterministic game simulation to confirm that structure upgrade unlocks are team-specific and expanded footprints need clear space.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI structure upgrades keep its strategic crystal reserve"] -->
### 35. enemy AI structure upgrades keep its strategic crystal reserve

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI structure upgrades keep its strategic crystal reserve.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI does not upgrade existing Grid Batteries"] -->
### 36. enemy AI does not upgrade existing Grid Batteries

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI does not upgrade existing Grid Batteries.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI upgrades existing economy buildings after unlocking their tier"] -->
### 37. enemy AI upgrades existing economy buildings after unlocking their tier

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI upgrades existing economy buildings after unlocking their tier.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier Crystal Harvesters still snap to deposits"] -->
### 38. higher-tier Crystal Harvesters still snap to deposits

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier Crystal Harvesters still snap to deposits.

<!-- test-catalog-entry: ["test/simulation.test.js","the standard battlefield uses the much larger map and separated starting bases"] -->
### 39. the standard battlefield uses the much larger map and separated starting bases

**What it checks:** Runs the deterministic game simulation to confirm that the standard battlefield uses the much larger map and separated starting bases.

<!-- test-catalog-entry: ["test/simulation.test.js","single-player map selection resolves every available battlefield"] -->
### 40. single-player map selection resolves every available battlefield

**What it checks:** Runs the deterministic game simulation to confirm that single-player map selection resolves every available battlefield.

<!-- test-catalog-entry: ["test/simulation.test.js","multiplayer ignores a manual map choice and resolves a random shared map"] -->
### 41. multiplayer ignores a manual map choice and resolves a random shared map

**What it checks:** Runs the deterministic game simulation to confirm that multiplayer ignores a manual map choice and resolves a random shared map.

<!-- test-catalog-entry: ["test/simulation.test.js","multiplayer snapshots preserve the host-selected map"] -->
### 42. multiplayer snapshots preserve the host-selected map

**What it checks:** Runs the deterministic game simulation to confirm that multiplayer snapshots preserve the host-selected map.

<!-- test-catalog-entry: ["test/simulation.test.js","both starting bases have sparse symmetrical walls with open central gates"] -->
### 43. both starting bases have sparse symmetrical walls with open central gates

**What it checks:** Runs the deterministic game simulation to confirm that both starting bases have sparse symmetrical walls with open central gates.

<!-- test-catalog-entry: ["test/simulation.test.js","impassable terrain rejects construction and redirects destinations inside it"] -->
### 44. impassable terrain rejects construction and redirects destinations inside it

**What it checks:** Runs the deterministic game simulation to confirm that impassable terrain rejects construction and redirects destinations inside it.

<!-- test-catalog-entry: ["test/simulation.test.js","ground units route around impassable terrain without entering it"] -->
### 45. ground units route around impassable terrain without entering it

**What it checks:** Runs the deterministic game simulation to confirm that ground units route around impassable terrain without entering it.

<!-- test-catalog-entry: ["test/simulation.test.js","group movement staggers expensive path replans across simulation ticks"] -->
### 46. group movement staggers expensive path replans across simulation ticks

**What it checks:** Runs the deterministic game simulation to confirm that group movement staggers expensive path replans across simulation ticks.

<!-- test-catalog-entry: ["test/simulation.test.js","large formations cap visibility-path searches per simulation tick"] -->
### 47. large formations cap visibility-path searches per simulation tick

**What it checks:** Runs the deterministic game simulation to confirm that large formations cap visibility-path searches per simulation tick.

<!-- test-catalog-entry: ["test/simulation.test.js","formation movement accepts more than 200 units at once"] -->
### 48. formation movement accepts more than 200 units at once

**What it checks:** Runs the deterministic game simulation to confirm that formation movement accepts more than 200 units at once.

<!-- test-catalog-entry: ["test/simulation.test.js","dense expanded bases bound obstacle corners considered by each route search"] -->
### 49. dense expanded bases bound obstacle corners considered by each route search

**What it checks:** Runs the deterministic game simulation to confirm that dense expanded bases bound obstacle corners considered by each route search.

<!-- test-catalog-entry: ["test/simulation.test.js","ground units escape U-shaped terrain instead of dead-ending against the back wall"] -->
### 50. ground units escape U-shaped terrain instead of dead-ending against the back wall

**What it checks:** Runs the deterministic game simulation to confirm that ground units escape U-shaped terrain instead of dead-ending against the back wall.

<!-- test-catalog-entry: ["test/simulation.test.js","move orders placed on structures resolve to a reachable footprint edge"] -->
### 51. move orders placed on structures resolve to a reachable footprint edge

**What it checks:** Runs the deterministic game simulation to confirm that move orders placed on structures resolve to a reachable footprint edge.

<!-- test-catalog-entry: ["test/simulation.test.js","aircraft fly directly over terrain, starting walls, and structures"] -->
### 52. aircraft fly directly over terrain, starting walls, and structures

**What it checks:** Runs the deterministic game simulation to confirm that aircraft fly directly over terrain, starting walls, and structures.

<!-- test-catalog-entry: ["test/simulation.test.js","reclamation drones also route around impassable terrain"] -->
### 53. reclamation drones also route around impassable terrain

**What it checks:** Runs the deterministic game simulation to confirm that reclamation drones also route around impassable terrain.

<!-- test-catalog-entry: ["test/simulation.test.js","reclamation drones pathfind out of concave terrain instead of dead-ending"] -->
### 54. reclamation drones pathfind out of concave terrain instead of dead-ending

**What it checks:** Runs the deterministic game simulation to confirm that reclamation drones pathfind out of concave terrain instead of dead-ending.

<!-- test-catalog-entry: ["test/simulation.test.js","reclamation drones fly directly over starting walls"] -->
### 55. reclamation drones fly directly over starting walls

**What it checks:** Runs the deterministic game simulation to confirm that reclamation drones fly directly over starting walls.

<!-- test-catalog-entry: ["test/simulation.test.js","vehicles are larger than same-tier mechs and tanks are larger than scouts"] -->
### 56. vehicles are larger than same-tier mechs and tanks are larger than scouts

**What it checks:** Runs the deterministic game simulation to confirm that vehicles are larger than same-tier mechs and tanks are larger than scouts.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier unit sprites grow and armed variants add visible hardpoints"] -->
### 57. higher-tier unit sprites grow and armed variants add visible hardpoints

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier unit sprites grow and armed variants add visible hardpoints.

<!-- test-catalog-entry: ["test/simulation.test.js","Zenith Doughnuts are enormous and fast strategic aircraft"] -->
### 58. Zenith Doughnuts are enormous and fast strategic aircraft

**What it checks:** Runs the deterministic game simulation to confirm that Zenith Doughnuts are enormous and fast strategic aircraft.

<!-- test-catalog-entry: ["test/simulation.test.js","overlapping friendly and enemy units physically separate"] -->
### 59. overlapping friendly and enemy units physically separate

**What it checks:** Runs the deterministic game simulation to confirm that overlapping friendly and enemy units physically separate.

<!-- test-catalog-entry: ["test/simulation.test.js","unit separation exits after one pass when no units overlap"] -->
### 60. unit separation exits after one pass when no units overlap

**What it checks:** Runs the deterministic game simulation to confirm that unit separation exits after one pass when no units overlap.

<!-- test-catalog-entry: ["test/simulation.test.js","movement consumes energy and an exhausted unit enters stasis"] -->
### 61. movement consumes energy and an exhausted unit enters stasis

**What it checks:** Runs the deterministic game simulation to confirm that movement consumes energy and an exhausted unit enters stasis.

<!-- test-catalog-entry: ["test/simulation.test.js","stasis regenerates only to the reactivation threshold before control returns"] -->
### 62. stasis regenerates only to the reactivation threshold before control returns

**What it checks:** Runs the deterministic game simulation to confirm that stasis regenerates only to the reactivation threshold before control returns.

<!-- test-catalog-entry: ["test/simulation.test.js","active low-energy units passively regenerate an emergency reserve"] -->
### 63. active low-energy units passively regenerate an emergency reserve

**What it checks:** Runs the deterministic game simulation to confirm that active low-energy units passively regenerate an emergency reserve.

<!-- test-catalog-entry: ["test/simulation.test.js","emergency regeneration lets an energy-starved unit resume firing"] -->
### 64. emergency regeneration lets an energy-starved unit resume firing

**What it checks:** Runs the deterministic game simulation to confirm that emergency regeneration lets an energy-starved unit resume firing.

<!-- test-catalog-entry: ["test/simulation.test.js","every active unit slowly regenerates to 20 percent energy"] -->
### 65. every active unit slowly regenerates to 20 percent energy

**What it checks:** Runs the deterministic game simulation to confirm that every active unit slowly regenerates to 20 percent energy.

<!-- test-catalog-entry: ["test/simulation.test.js","attacking damages the target and spends the attacker's energy"] -->
### 66. attacking damages the target and spends the attacker's energy

**What it checks:** Runs the deterministic game simulation to confirm that attacking damages the target and spends the attacker's energy.

<!-- test-catalog-entry: ["test/simulation.test.js","heavy unit projectiles deal no damage before their visible impact"] -->
### 67. heavy unit projectiles deal no damage before their visible impact

**What it checks:** Runs the deterministic game simulation to confirm that heavy unit projectiles deal no damage before their visible impact.

<!-- test-catalog-entry: ["test/simulation.test.js","long-range projectile events remain visible until their delayed impact"] -->
### 68. long-range projectile events remain visible until their delayed impact

**What it checks:** Runs the deterministic game simulation to confirm that long-range projectile events remain visible until their delayed impact.

<!-- test-catalog-entry: ["test/simulation.test.js","ordinary weapons deal reduced damage to aircraft"] -->
### 69. ordinary weapons deal reduced damage to aircraft

**What it checks:** Runs the deterministic game simulation to confirm that ordinary weapons deal reduced damage to aircraft.

<!-- test-catalog-entry: ["test/simulation.test.js","dedicated anti-air units deal bonus damage to aircraft"] -->
### 70. dedicated anti-air units deal bonus damage to aircraft

**What it checks:** Runs the deterministic game simulation to confirm that dedicated anti-air units deal bonus damage to aircraft.

<!-- test-catalog-entry: ["test/simulation.test.js","flak turrets prioritize aircraft and apply their air damage bonus"] -->
### 71. flak turrets prioritize aircraft and apply their air damage bonus

**What it checks:** Runs the deterministic game simulation to confirm that flak turrets prioritize aircraft and apply their air damage bonus.

<!-- test-catalog-entry: ["test/simulation.test.js","Raiders are fast harassment units that deal bonus damage to structures"] -->
### 72. Raiders are fast harassment units that deal bonus damage to structures

**What it checks:** Runs the deterministic game simulation to confirm that Raiders are fast harassment units that deal bonus damage to structures.

<!-- test-catalog-entry: ["test/simulation.test.js","Raiders automatically prioritize exposed infrastructure"] -->
### 73. Raiders automatically prioritize exposed infrastructure

**What it checks:** Runs the deterministic game simulation to confirm that Raiders automatically prioritize exposed infrastructure.

<!-- test-catalog-entry: ["test/simulation.test.js","Overdrive is restricted by unit capability and consumes energy"] -->
### 74. Overdrive is restricted by unit capability and consumes energy

**What it checks:** Runs the deterministic game simulation to confirm that Overdrive is restricted by unit capability and consumes energy.

<!-- test-catalog-entry: ["test/simulation.test.js","a linked charger draws stored energy from a grid battery"] -->
### 75. a linked charger draws stored energy from a grid battery

**What it checks:** Runs the deterministic game simulation to confirm that a linked charger draws stored energy from a grid battery.

<!-- test-catalog-entry: ["test/simulation.test.js","the faster Induction Charger transfers its provisional maximum rate"] -->
### 76. the faster Induction Charger transfers its provisional maximum rate

**What it checks:** Runs the deterministic game simulation to confirm that the faster Induction Charger transfers its provisional maximum rate.

<!-- test-catalog-entry: ["test/simulation.test.js","the enlarged Induction Charger field reaches 260 world units"] -->
### 77. the enlarged Induction Charger field reaches 260 world units

**What it checks:** Runs the deterministic game simulation to confirm that the enlarged Induction Charger field reaches 260 world units.

<!-- test-catalog-entry: ["test/simulation.test.js","an Induction Charger charges every unit in its field simultaneously"] -->
### 78. an Induction Charger charges every unit in its field simultaneously

**What it checks:** Runs the deterministic game simulation to confirm that an Induction Charger charges every unit in its field simultaneously.

<!-- test-catalog-entry: ["test/simulation.test.js","all units receive the full charger rate when the grid can supply it"] -->
### 79. all units receive the full charger rate when the grid can supply it

**What it checks:** Runs the deterministic game simulation to confirm that all units receive the full charger rate when the grid can supply it.

<!-- test-catalog-entry: ["test/simulation.test.js","every unit type has the enlarged provisional energy capacity"] -->
### 80. every unit type has the enlarged provisional energy capacity

**What it checks:** Runs the deterministic game simulation to confirm that every unit type has the enlarged provisional energy capacity.

<!-- test-catalog-entry: ["test/simulation.test.js","a charger outside the generator network cannot charge units"] -->
### 81. a charger outside the generator network cannot charge units

**What it checks:** Runs the deterministic game simulation to confirm that a charger outside the generator network cannot charge units.

<!-- test-catalog-entry: ["test/simulation.test.js","generators continuously produce and retain a capped internal reserve"] -->
### 82. generators continuously produce and retain a capped internal reserve

**What it checks:** Runs the deterministic game simulation to confirm that generators continuously produce and retain a capped internal reserve.

<!-- test-catalog-entry: ["test/simulation.test.js","battery storage is capped by completed battery capacity"] -->
### 83. battery storage is capped by completed battery capacity

**What it checks:** Runs the deterministic game simulation to confirm that battery storage is capped by completed battery capacity.

<!-- test-catalog-entry: ["test/simulation.test.js","an isolated charged battery powers its local grid while discharging"] -->
### 84. an isolated charged battery powers its local grid while discharging

**What it checks:** Runs the deterministic game simulation to confirm that an isolated charged battery powers its local grid while discharging.

<!-- test-catalog-entry: ["test/simulation.test.js","Crystal Harvesters continuously consume their passive power demand"] -->
### 85. Crystal Harvesters continuously consume their passive power demand

**What it checks:** Runs the deterministic game simulation to confirm that Crystal Harvesters continuously consume their passive power demand.

<!-- test-catalog-entry: ["test/simulation.test.js","a charged relay keeps its local grid alive after its generator is destroyed"] -->
### 86. a charged relay keeps its local grid alive after its generator is destroyed

**What it checks:** Runs the deterministic game simulation to confirm that a charged relay keeps its local grid alive after its generator is destroyed.

<!-- test-catalog-entry: ["test/simulation.test.js","an active factory queue adds production demand and lowers net energy"] -->
### 87. an active factory queue adds production demand and lowers net energy

**What it checks:** Runs the deterministic game simulation to confirm that an active factory queue adds production demand and lowers net energy.

<!-- test-catalog-entry: ["test/simulation.test.js","destroying a battery removes its stored energy and capacity"] -->
### 88. destroying a battery removes its stored energy and capacity

**What it checks:** Runs the deterministic game simulation to confirm that destroying a battery removes its stored energy and capacity.

<!-- test-catalog-entry: ["test/simulation.test.js","an energy carrier automatically supplies allies without crossing its protected reserve"] -->
### 89. an energy carrier automatically supplies allies without crossing its protected reserve

**What it checks:** Runs the deterministic game simulation to confirm that an energy carrier automatically supplies allies without crossing its protected reserve.

<!-- test-catalog-entry: ["test/simulation.test.js","an energy carrier spends exactly the energy shared fairly with nearby units"] -->
### 90. an energy carrier spends exactly the energy shared fairly with nearby units

**What it checks:** Runs the deterministic game simulation to confirm that an energy carrier spends exactly the energy shared fairly with nearby units.

<!-- test-catalog-entry: ["test/simulation.test.js","every mobile energy supplier transfers its matching output rate"] -->
### 91. every mobile energy supplier transfers its matching output rate

**What it checks:** Runs the deterministic game simulation to confirm that every mobile energy supplier transfers its matching output rate.

<!-- test-catalog-entry: ["test/simulation.test.js","destroyed units create finite reclaimable wreckage"] -->
### 92. destroyed units create finite reclaimable wreckage

**What it checks:** Runs the deterministic game simulation to confirm that destroyed units create finite reclaimable wreckage.

<!-- test-catalog-entry: ["test/simulation.test.js","a powered salvage yard automatically returns wreck crystal"] -->
### 93. a powered salvage yard automatically returns wreck crystal

**What it checks:** Runs the deterministic game simulation to confirm that a powered salvage yard automatically returns wreck crystal.

<!-- test-catalog-entry: ["test/simulation.test.js","multiple reclamation drones can harvest the same crystal scrap pile"] -->
### 94. multiple reclamation drones can harvest the same crystal scrap pile

**What it checks:** Runs the deterministic game simulation to confirm that multiple reclamation drones can harvest the same crystal scrap pile.

<!-- test-catalog-entry: ["test/simulation.test.js","partially loaded reclamation drones visit another crystal scrap pile before returning"] -->
### 95. partially loaded reclamation drones visit another crystal scrap pile before returning

**What it checks:** Runs the deterministic game simulation to confirm that partially loaded reclamation drones visit another crystal scrap pile before returning.

<!-- test-catalog-entry: ["test/simulation.test.js","a powered yard replaces a destroyed drone for free after a delay"] -->
### 96. a powered yard replaces a destroyed drone for free after a delay

**What it checks:** Runs the deterministic game simulation to confirm that a powered yard replaces a destroyed drone for free after a delay.

<!-- test-catalog-entry: ["test/simulation.test.js","combat units automatically attack hostile units that enter weapon range"] -->
### 97. combat units automatically attack hostile units that enter weapon range

**What it checks:** Runs the deterministic game simulation to confirm that combat units automatically attack hostile units that enter weapon range.

<!-- test-catalog-entry: ["test/simulation.test.js","worker drones have weak, short-range defensive weapons"] -->
### 98. worker drones have weak, short-range defensive weapons

**What it checks:** Runs the deterministic game simulation to confirm that worker drones have weak, short-range defensive weapons.

<!-- test-catalog-entry: ["test/simulation.test.js","worker drones do not target or retaliate while constructing"] -->
### 99. worker drones do not target or retaliate while constructing

**What it checks:** Runs the deterministic game simulation to confirm that worker drones do not target or retaliate while constructing.

<!-- test-catalog-entry: ["test/simulation.test.js","worker drones repair damaged friendly units and completed buildings with energy"] -->
### 100. worker drones repair damaged friendly units and completed buildings with energy

**What it checks:** Runs the deterministic game simulation to confirm that worker drones repair damaged friendly units and completed buildings with energy.

<!-- test-catalog-entry: ["test/simulation.test.js","idle worker drones automatically repair the nearest damaged friendly target"] -->
### 101. idle worker drones automatically repair the nearest damaged friendly target

**What it checks:** Runs the deterministic game simulation to confirm that idle worker drones automatically repair the nearest damaged friendly target.

<!-- test-catalog-entry: ["test/simulation.test.js","automatic worker repair respects its service radius and higher-priority orders"] -->
### 102. automatic worker repair respects its service radius and higher-priority orders

**What it checks:** Runs the deterministic game simulation to confirm that automatic worker repair respects its service radius and higher-priority orders.

<!-- test-catalog-entry: ["test/simulation.test.js","active construction takes priority over automatic worker repair"] -->
### 103. active construction takes priority over automatic worker repair

**What it checks:** Runs the deterministic game simulation to confirm that active construction takes priority over automatic worker repair.

<!-- test-catalog-entry: ["test/simulation.test.js","worker drones can repair one another but can never repair themselves"] -->
### 104. worker drones can repair one another but can never repair themselves

**What it checks:** Runs the deterministic game simulation to confirm that worker drones can repair one another but can never repair themselves.

<!-- test-catalog-entry: ["test/simulation.test.js","an active repair assignment takes priority over worker combat"] -->
### 105. an active repair assignment takes priority over worker combat

**What it checks:** Runs the deterministic game simulation to confirm that an active repair assignment takes priority over worker combat.

<!-- test-catalog-entry: ["test/simulation.test.js","combat units automatically attack hostile structures in weapon range"] -->
### 106. combat units automatically attack hostile structures in weapon range

**What it checks:** Runs the deterministic game simulation to confirm that combat units automatically attack hostile structures in weapon range.

<!-- test-catalog-entry: ["test/simulation.test.js","player and enemy units pursue the hostile aggressor that damages them"] -->
### 107. player and enemy units pursue the hostile aggressor that damages them

**What it checks:** Runs the deterministic game simulation to confirm that player and enemy units pursue the hostile aggressor that damages them.

<!-- test-catalog-entry: ["test/simulation.test.js","force-moving units do not abandon their order to retaliate"] -->
### 108. force-moving units do not abandon their order to retaliate

**What it checks:** Runs the deterministic game simulation to confirm that force-moving units do not abandon their order to retaliate.

<!-- test-catalog-entry: ["test/simulation.test.js","a moving unit stops to attack and resumes its route after the target is destroyed"] -->
### 109. a moving unit stops to attack and resumes its route after the target is destroyed

**What it checks:** Runs the deterministic game simulation to confirm that a moving unit stops to attack and resumes its route after the target is destroyed.

<!-- test-catalog-entry: ["test/simulation.test.js","a force move ignores enemies until the unit reaches its destination"] -->
### 110. a force move ignores enemies until the unit reaches its destination

**What it checks:** Runs the deterministic game simulation to confirm that a force move ignores enemies until the unit reaches its destination.

<!-- test-catalog-entry: ["test/simulation.test.js","power relay towers extend a generator network to distant structures"] -->
### 111. power relay towers extend a generator network to distant structures

**What it checks:** Runs the deterministic game simulation to confirm that power relay towers extend a generator network to distant structures.

<!-- test-catalog-entry: ["test/simulation.test.js","power coverage uses the same grid-aligned square cells as network connections"] -->
### 112. power coverage uses the same grid-aligned square cells as network connections

**What it checks:** Runs the deterministic game simulation to confirm that power coverage uses the same grid-aligned square cells as network connections.

<!-- test-catalog-entry: ["test/simulation.test.js","powered Crystal Harvesters generate crystal over time"] -->
### 113. powered Crystal Harvesters generate crystal over time

**What it checks:** Runs the deterministic game simulation to confirm that powered Crystal Harvesters generate crystal over time.

<!-- test-catalog-entry: ["test/simulation.test.js","bright Rich Crystal Deposits increase a harvester's actual crystal output"] -->
### 114. bright Rich Crystal Deposits increase a harvester's actual crystal output

**What it checks:** Runs the deterministic game simulation to confirm that bright Rich Crystal Deposits increase a harvester's actual crystal output.

<!-- test-catalog-entry: ["test/simulation.test.js","each mech factory tier offers improved copies of the same six unit roles"] -->
### 115. each mech factory tier offers improved copies of the same six unit roles

**What it checks:** Runs the deterministic game simulation to confirm that each mech factory tier offers improved copies of the same six unit roles.

<!-- test-catalog-entry: ["test/simulation.test.js","vehicle factories produce six matching-tier vehicle roles"] -->
### 116. vehicle factories produce six matching-tier vehicle roles

**What it checks:** Runs the deterministic game simulation to confirm that vehicle factories produce six matching-tier vehicle roles.

<!-- test-catalog-entry: ["test/simulation.test.js","air factories begin at Tier 2 and produce six matching-tier aircraft roles"] -->
### 117. air factories begin at Tier 2 and produce six matching-tier aircraft roles

**What it checks:** Runs the deterministic game simulation to confirm that air factories begin at Tier 2 and produce six matching-tier aircraft roles.

<!-- test-catalog-entry: ["test/simulation.test.js","all flying units use the faster movement profiles"] -->
### 118. all flying units use the faster movement profiles

**What it checks:** Runs the deterministic game simulation to confirm that all flying units use the faster movement profiles.

<!-- test-catalog-entry: ["test/simulation.test.js","Dropships begin at Tier 2 in Air Factories with eight ground-unit cargo slots"] -->
### 119. Dropships begin at Tier 2 in Air Factories with eight ground-unit cargo slots

**What it checks:** Runs the deterministic game simulation to confirm that Dropships begin at Tier 2 in Air Factories with eight ground-unit cargo slots.

<!-- test-catalog-entry: ["test/simulation.test.js","explicit transport orders reserve eight slots, board nearby units, and unload them"] -->
### 120. explicit transport orders reserve eight slots, board nearby units, and unload them

**What it checks:** Runs the deterministic game simulation to confirm that explicit transport orders reserve eight slots, board nearby units, and unload them.

<!-- test-catalog-entry: ["test/simulation.test.js","multi-transport filling balances reservations and rejects aircraft cargo"] -->
### 121. multi-transport filling balances reservations and rejects aircraft cargo

**What it checks:** Runs the deterministic game simulation to confirm that multi-transport filling balances reservations and rejects aircraft cargo.

<!-- test-catalog-entry: ["test/simulation.test.js","destroying a loaded Dropship destroys its passengers and snapshots preserve cargo"] -->
### 122. destroying a loaded Dropship destroys its passengers and snapshots preserve cargo

**What it checks:** Runs the deterministic game simulation to confirm that destroying a loaded Dropship destroys its passengers and snapshots preserve cargo.

<!-- test-catalog-entry: ["test/simulation.test.js","all units and structures provide a useful deterministic vision range"] -->
### 123. all units and structures provide a useful deterministic vision range

**What it checks:** Runs the deterministic game simulation to confirm that all units and structures provide a useful deterministic vision range.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy contacts are hidden until they enter current friendly vision"] -->
### 124. enemy contacts are hidden until they enter current friendly vision

**What it checks:** Runs the deterministic game simulation to confirm that enemy contacts are hidden until they enter current friendly vision.

<!-- test-catalog-entry: ["test/simulation.test.js","powered radar arrays reveal long range and lose that coverage off-grid"] -->
### 125. powered radar arrays reveal long range and lose that coverage off-grid

**What it checks:** Runs the deterministic game simulation to confirm that powered radar arrays reveal long range and lose that coverage off-grid.

<!-- test-catalog-entry: ["test/simulation.test.js","radar towers and mobile radar units improve across every available branch tier"] -->
### 126. radar towers and mobile radar units improve across every available branch tier

**What it checks:** Runs the deterministic game simulation to confirm that radar towers and mobile radar units improve across every available branch tier.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI invests in radar after preserving its opening wave and garrison"] -->
### 127. enemy AI invests in radar after preserving its opening wave and garrison

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI invests in radar after preserving its opening wave and garrison.

<!-- test-catalog-entry: ["test/simulation.test.js","direct attack commands cannot target unseen enemies"] -->
### 128. direct attack commands cannot target unseen enemies

**What it checks:** Runs the deterministic game simulation to confirm that direct attack commands cannot target unseen enemies.

<!-- test-catalog-entry: ["test/simulation.test.js","vehicle and air factories only queue units from their own tier and branch"] -->
### 129. vehicle and air factories only queue units from their own tier and branch

**What it checks:** Runs the deterministic game simulation to confirm that vehicle and air factories only queue units from their own tier and branch.

<!-- test-catalog-entry: ["test/simulation.test.js","vehicle and air factories deploy their completed production orders"] -->
### 130. vehicle and air factories deploy their completed production orders

**What it checks:** Runs the deterministic game simulation to confirm that vehicle and air factories deploy their completed production orders.

<!-- test-catalog-entry: ["test/simulation.test.js","mech factories only queue the six unit variants matching their tier"] -->
### 131. mech factories only queue the six unit variants matching their tier

**What it checks:** Runs the deterministic game simulation to confirm that mech factories only queue the six unit variants matching their tier.

<!-- test-catalog-entry: ["test/simulation.test.js","matching factory groups route production to the shortest powered queue"] -->
### 132. matching factory groups route production to the shortest powered queue

**What it checks:** Runs the deterministic game simulation to confirm that matching factory groups route production to the shortest powered queue.

<!-- test-catalog-entry: ["test/simulation.test.js","repeated group production orders distribute across matching factories"] -->
### 133. repeated group production orders distribute across matching factories

**What it checks:** Runs the deterministic game simulation to confirm that repeated group production orders distribute across matching factories.

<!-- test-catalog-entry: ["test/simulation.test.js","group production skips unpowered factories and rejects mixed factory types"] -->
### 134. group production skips unpowered factories and rejects mixed factory types

**What it checks:** Runs the deterministic game simulation to confirm that group production skips unpowered factories and rejects mixed factory types.

<!-- test-catalog-entry: ["test/simulation.test.js","a Tier 1 mech factory spends crystal and constructs a worker drone"] -->
### 135. a Tier 1 mech factory spends crystal and constructs a worker drone

**What it checks:** Runs the deterministic game simulation to confirm that a Tier 1 mech factory spends crystal and constructs a worker drone.

<!-- test-catalog-entry: ["test/simulation.test.js","unit roles and tiers reserve different provisional supply amounts"] -->
### 136. unit roles and tiers reserve different provisional supply amounts

**What it checks:** Runs the deterministic game simulation to confirm that unit roles and tiers reserve different provisional supply amounts.

<!-- test-catalog-entry: ["test/simulation.test.js","production reserves supply and rejects orders beyond the massive base limit"] -->
### 137. production reserves supply and rejects orders beyond the massive base limit

**What it checks:** Runs the deterministic game simulation to confirm that production reserves supply and rejects orders beyond the massive base limit.

<!-- test-catalog-entry: ["test/simulation.test.js","a powered Strategic Supply Complex adds and upgrades massive supply capacity"] -->
### 138. a powered Strategic Supply Complex adds and upgrades massive supply capacity

**What it checks:** Runs the deterministic game simulation to confirm that a powered Strategic Supply Complex adds and upgrades massive supply capacity.

<!-- test-catalog-entry: ["test/simulation.test.js","the Strategic Supply Complex is larger than every production building"] -->
### 139. the Strategic Supply Complex is larger than every production building

**What it checks:** Runs the deterministic game simulation to confirm that the Strategic Supply Complex is larger than every production building.

<!-- test-catalog-entry: ["test/simulation.test.js","factories choose an unobstructed exit when the preferred spawn is blocked"] -->
### 140. factories choose an unobstructed exit when the preferred spawn is blocked

**What it checks:** Runs the deterministic game simulation to confirm that factories choose an unobstructed exit when the preferred spawn is blocked.

<!-- test-catalog-entry: ["test/simulation.test.js","factories do not deploy a completed unit on top of another unit"] -->
### 141. factories do not deploy a completed unit on top of another unit

**What it checks:** Runs the deterministic game simulation to confirm that factories do not deploy a completed unit on top of another unit.

<!-- test-catalog-entry: ["test/simulation.test.js","player and enemy factories spread repeated output across rally formations"] -->
### 142. player and enemy factories spread repeated output across rally formations

**What it checks:** Runs the deterministic game simulation to confirm that player and enemy factories spread repeated output across rally formations.

<!-- test-catalog-entry: ["test/simulation.test.js","setting a new factory rally point resets its formation slots"] -->
### 143. setting a new factory rally point resets its formation slots

**What it checks:** Runs the deterministic game simulation to confirm that setting a new factory rally point resets its formation slots.

<!-- test-catalog-entry: ["test/simulation.test.js","matching factories share an atomic grouped rally point and formation"] -->
### 144. matching factories share an atomic grouped rally point and formation

**What it checks:** Runs the deterministic game simulation to confirm that matching factories share an atomic grouped rally point and formation.

<!-- test-catalog-entry: ["test/simulation.test.js","grouped rally rejects mixed factory types and tiers without changing either"] -->
### 145. grouped rally rejects mixed factory types and tiers without changing either

**What it checks:** Runs the deterministic game simulation to confirm that grouped rally rejects mixed factory types and tiers without changing either.

<!-- test-catalog-entry: ["test/simulation.test.js","a completed unit waits in a surrounded factory until an exit opens"] -->
### 146. a completed unit waits in a surrounded factory until an exit opens

**What it checks:** Runs the deterministic game simulation to confirm that a completed unit waits in a surrounded factory until an exit opens.

<!-- test-catalog-entry: ["test/simulation.test.js","newly produced combat units engage threats while rallying"] -->
### 147. newly produced combat units engage threats while rallying

**What it checks:** Runs the deterministic game simulation to confirm that newly produced combat units engage threats while rallying.

<!-- test-catalog-entry: ["test/simulation.test.js","workers spend crystal and complete new structures"] -->
### 148. workers spend crystal and complete new structures

**What it checks:** Runs the deterministic game simulation to confirm that workers spend crystal and complete new structures.

<!-- test-catalog-entry: ["test/simulation.test.js","damage to an unfinished building persists through construction and completion"] -->
### 149. damage to an unfinished building persists through construction and completion

**What it checks:** Runs the deterministic game simulation to confirm that damage to an unfinished building persists through construction and completion.

<!-- test-catalog-entry: ["test/simulation.test.js","Shift-queued construction completes foundations in placement order"] -->
### 150. Shift-queued construction completes foundations in placement order

**What it checks:** Runs the deterministic game simulation to confirm that Shift-queued construction completes foundations in placement order.

<!-- test-catalog-entry: ["test/simulation.test.js","ordinary build orders replace queued construction and move orders clear it"] -->
### 151. ordinary build orders replace queued construction and move orders clear it

**What it checks:** Runs the deterministic game simulation to confirm that ordinary build orders replace queued construction and move orders clear it.

<!-- test-catalog-entry: ["test/simulation.test.js","cancelling construction removes it from worker queues and advances current work"] -->
### 152. cancelling construction removes it from worker queues and advances current work

**What it checks:** Runs the deterministic game simulation to confirm that cancelling construction removes it from worker queues and advances current work.

<!-- test-catalog-entry: ["test/simulation.test.js","powered sentry turrets automatically defend against nearby enemies"] -->
### 153. powered sentry turrets automatically defend against nearby enemies

**What it checks:** Runs the deterministic game simulation to confirm that powered sentry turrets automatically defend against nearby enemies.

<!-- test-catalog-entry: ["test/simulation.test.js","powered sentry turrets automatically attack hostile structures"] -->
### 154. powered sentry turrets automatically attack hostile structures

**What it checks:** Runs the deterministic game simulation to confirm that powered sentry turrets automatically attack hostile structures.

<!-- test-catalog-entry: ["test/simulation.test.js","a sentry capacitor charges from live generator output and fires without a grid battery"] -->
### 155. a sentry capacitor charges from live generator output and fires without a grid battery

**What it checks:** Runs the deterministic game simulation to confirm that a sentry capacitor charges from live generator output and fires without a grid battery.

<!-- test-catalog-entry: ["test/simulation.test.js","a relay-connected sentry capacitor accepts partial surplus generator output"] -->
### 156. a relay-connected sentry capacitor accepts partial surplus generator output

**What it checks:** Runs the deterministic game simulation to confirm that a relay-connected sentry capacitor accepts partial surplus generator output.

<!-- test-catalog-entry: ["test/simulation.test.js","full idle sentries do not prevent a new sentry from charging"] -->
### 157. full idle sentries do not prevent a new sentry from charging

**What it checks:** Runs the deterministic game simulation to confirm that full idle sentries do not prevent a new sentry from charging.

<!-- test-catalog-entry: ["test/simulation.test.js","workers can build and upgrade every Shield Turret tier"] -->
### 158. workers can build and upgrade every Shield Turret tier

**What it checks:** Runs the deterministic game simulation to confirm that workers can build and upgrade every Shield Turret tier.

<!-- test-catalog-entry: ["test/simulation.test.js","Shield Turret protection radii use the expanded balance values"] -->
### 159. Shield Turret protection radii use the expanded balance values

**What it checks:** Runs the deterministic game simulation to confirm that Shield Turret protection radii use the expanded balance values.

<!-- test-catalog-entry: ["test/simulation.test.js","Shield Turret upgrades retain existing strength and regenerate the added capacity"] -->
### 160. Shield Turret upgrades retain existing strength and regenerate the added capacity

**What it checks:** Runs the deterministic game simulation to confirm that Shield Turret upgrades retain existing strength and regenerate the added capacity.

<!-- test-catalog-entry: ["test/simulation.test.js","higher-tier Shield Turrets protect targets beyond the Tier 1 field"] -->
### 161. higher-tier Shield Turrets protect targets beyond the Tier 1 field

**What it checks:** Runs the deterministic game simulation to confirm that higher-tier Shield Turrets protect targets beyond the Tier 1 field.

<!-- test-catalog-entry: ["test/simulation.test.js","a powered Shield Turret absorbs hits inside its field and spills excess damage through"] -->
### 162. a powered Shield Turret absorbs hits inside its field and spills excess damage through

**What it checks:** Runs the deterministic game simulation to confirm that a powered Shield Turret absorbs hits inside its field and spills excess damage through.

<!-- test-catalog-entry: ["test/simulation.test.js","a powered Shield Turret protects its own structure"] -->
### 163. a powered Shield Turret protects its own structure

**What it checks:** Runs the deterministic game simulation to confirm that a powered Shield Turret protects its own structure.

<!-- test-catalog-entry: ["test/simulation.test.js","Shield Turrets do not intercept attacks outside their field or while unpowered"] -->
### 164. Shield Turrets do not intercept attacks outside their field or while unpowered

**What it checks:** Runs the deterministic game simulation to confirm that Shield Turrets do not intercept attacks outside their field or while unpowered.

<!-- test-catalog-entry: ["test/simulation.test.js","a damaged Shield Turret regenerates slowly by drawing local grid energy"] -->
### 165. a damaged Shield Turret regenerates slowly by drawing local grid energy

**What it checks:** Runs the deterministic game simulation to confirm that a damaged Shield Turret regenerates slowly by drawing local grid energy.

<!-- test-catalog-entry: ["test/simulation.test.js","destroyed reclamation drones drop their carried crystal scrap at the death location"] -->
### 166. destroyed reclamation drones drop their carried crystal scrap at the death location

**What it checks:** Runs the deterministic game simulation to confirm that destroyed reclamation drones drop their carried crystal scrap at the death location.

<!-- test-catalog-entry: ["test/simulation.test.js","both sides start with a Headquarters, three workers, a Tier 1 factory, a generator, and a powered Crystal Harvester"] -->
### 167. both sides start with a Headquarters, three workers, a Tier 1 factory, a generator, and a powered Crystal Harvester

**What it checks:** Runs the deterministic game simulation to confirm that both sides start with a Headquarters, three workers, a Tier 1 factory, a generator, and a powered Crystal Harvester.

<!-- test-catalog-entry: ["test/simulation.test.js","Crystal Harvesters can only be placed on unused crystal deposits and snap to them"] -->
### 168. Crystal Harvesters can only be placed on unused crystal deposits and snap to them

**What it checks:** Runs the deterministic game simulation to confirm that Crystal Harvesters can only be placed on unused crystal deposits and snap to them.

<!-- test-catalog-entry: ["test/simulation.test.js","energy-production buildings can be placed away from crystal deposits"] -->
### 169. energy-production buildings can be placed away from crystal deposits

**What it checks:** Runs the deterministic game simulation to confirm that energy-production buildings can be placed away from crystal deposits.

<!-- test-catalog-entry: ["test/simulation.test.js","units route around structures without crossing their collision footprint"] -->
### 170. units route around structures without crossing their collision footprint

**What it checks:** Runs the deterministic game simulation to confirm that units route around structures without crossing their collision footprint.

<!-- test-catalog-entry: ["test/simulation.test.js","a worker can leave the lane after completing a building beside another structure"] -->
### 171. a worker can leave the lane after completing a building beside another structure

**What it checks:** Runs the deterministic game simulation to confirm that a worker can leave the lane after completing a building beside another structure.

<!-- test-catalog-entry: ["test/simulation.test.js","workers can construct from a corner of a rectangular building footprint"] -->
### 172. workers can construct from a corner of a rectangular building footprint

**What it checks:** Runs the deterministic game simulation to confirm that workers can construct from a corner of a rectangular building footprint.

<!-- test-catalog-entry: ["test/simulation.test.js","a lower-tier worker cannot resume an advanced foundation"] -->
### 173. a lower-tier worker cannot resume an advanced foundation

**What it checks:** Runs the deterministic game simulation to confirm that a lower-tier worker cannot resume an advanced foundation.

<!-- test-catalog-entry: ["test/simulation.test.js","right-click build commands can resume an unfinished friendly structure"] -->
### 174. right-click build commands can resume an unfinished friendly structure

**What it checks:** Runs the deterministic game simulation to confirm that right-click build commands can resume an unfinished friendly structure.

<!-- test-catalog-entry: ["test/simulation.test.js","a replacement worker can finish a project after the original builder dies"] -->
### 175. a replacement worker can finish a project after the original builder dies

**What it checks:** Runs the deterministic game simulation to confirm that a replacement worker can finish a project after the original builder dies.

<!-- test-catalog-entry: ["test/simulation.test.js","a worker keeps its construction assignment through stasis and resumes after reactivation"] -->
### 176. a worker keeps its construction assignment through stasis and resumes after reactivation

**What it checks:** Runs the deterministic game simulation to confirm that a worker keeps its construction assignment through stasis and resumes after reactivation.

<!-- test-catalog-entry: ["test/simulation.test.js","construction placement rejects foundations that overlap existing buildings"] -->
### 177. construction placement rejects foundations that overlap existing buildings

**What it checks:** Runs the deterministic game simulation to confirm that construction placement rejects foundations that overlap existing buildings.

<!-- test-catalog-entry: ["test/simulation.test.js","buildings may occupy directly adjacent grid cells without invisible padding"] -->
### 178. buildings may occupy directly adjacent grid cells without invisible padding

**What it checks:** Runs the deterministic game simulation to confirm that buildings may occupy directly adjacent grid cells without invisible padding.

<!-- test-catalog-entry: ["test/simulation.test.js","friendly units vacate a construction site when its foundation is placed"] -->
### 179. friendly units vacate a construction site when its foundation is placed

**What it checks:** Runs the deterministic game simulation to confirm that friendly units vacate a construction site when its foundation is placed.

<!-- test-catalog-entry: ["test/simulation.test.js","construction placement still rejects sites occupied by hostile units"] -->
### 180. construction placement still rejects sites occupied by hostile units

**What it checks:** Runs the deterministic game simulation to confirm that construction placement still rejects sites occupied by hostile units.

<!-- test-catalog-entry: ["test/simulation.test.js","ordinary buildings snap to the shared 40-unit construction grid"] -->
### 181. ordinary buildings snap to the shared 40-unit construction grid

**What it checks:** Runs the deterministic game simulation to confirm that ordinary buildings snap to the shared 40-unit construction grid.

<!-- test-catalog-entry: ["test/simulation.test.js","odd and even building footprints align every edge to a grid line"] -->
### 182. odd and even building footprints align every edge to a grid line

**What it checks:** Runs the deterministic game simulation to confirm that odd and even building footprints align every edge to a grid line.

<!-- test-catalog-entry: ["test/simulation.test.js","building classes use distinct grid footprints"] -->
### 183. building classes use distinct grid footprints

**What it checks:** Runs the deterministic game simulation to confirm that building classes use distinct grid footprints.

<!-- test-catalog-entry: ["test/simulation.test.js","Crystal Harvester footprints never exceed two grid cells per side"] -->
### 184. Crystal Harvester footprints never exceed two grid cells per side

**What it checks:** Runs the deterministic game simulation to confirm that Crystal Harvester footprints never exceed two grid cells per side.

<!-- test-catalog-entry: ["test/simulation.test.js","the Tier 2 Power Relay Tower stays compact and improves every relay function"] -->
### 185. the Tier 2 Power Relay Tower stays compact and improves every relay function

**What it checks:** Runs the deterministic game simulation to confirm that the Tier 2 Power Relay Tower stays compact and improves every relay function.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI searches nearby grid cells when its preferred generator site is occupied"] -->
### 186. enemy AI searches nearby grid cells when its preferred generator site is occupied

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI searches nearby grid cells when its preferred generator site is occupied.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI construction avoids sites controlled by a superior hostile force"] -->
### 187. enemy AI construction avoids sites controlled by a superior hostile force

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI construction avoids sites controlled by a superior hostile force.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI remembers recently destroyed construction sites"] -->
### 188. enemy AI remembers recently destroyed construction sites

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI remembers recently destroyed construction sites.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI skips a contested deposit for a safer expansion"] -->
### 189. enemy AI skips a contested deposit for a safer expansion

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI skips a contested deposit for a safer expansion.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI requests generators instead of Grid Batteries at every energy level"] -->
### 190. enemy AI requests generators instead of Grid Batteries at every energy level

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI requests generators instead of Grid Batteries at every energy level.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI proactively maintains multiple paid Pulse Generators"] -->
### 191. enemy AI proactively maintains multiple paid Pulse Generators

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI proactively maintains multiple paid Pulse Generators.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI scales generator count and output headroom with its consumers"] -->
### 192. enemy AI scales generator count and output headroom with its consumers

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI scales generator count and output headroom with its consumers.

<!-- test-catalog-entry: ["test/simulation.test.js","advanced AI economies add generators matching their operational tier"] -->
### 193. advanced AI economies add generators matching their operational tier

**What it checks:** Runs the deterministic game simulation to confirm that advanced AI economies add generators matching their operational tier.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI waits for its pending generator without adding a Grid Battery"] -->
### 194. enemy AI waits for its pending generator without adding a Grid Battery

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI waits for its pending generator without adding a Grid Battery.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI requests flak when aircraft threaten its base"] -->
### 195. enemy AI requests flak when aircraft threaten its base

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI requests flak when aircraft threaten its base.

<!-- test-catalog-entry: ["test/simulation.test.js","a stable AI builds vehicle and air production through each available tier"] -->
### 196. a stable AI builds vehicle and air production through each available tier

**What it checks:** Runs the deterministic game simulation to confirm that a stable AI builds vehicle and air production through each available tier.

<!-- test-catalog-entry: ["test/simulation.test.js","every AI commander independently requests its missing vehicle branch"] -->
### 197. every AI commander independently requests its missing vehicle branch

**What it checks:** Runs the deterministic game simulation to confirm that every AI commander independently requests its missing vehicle branch.

<!-- test-catalog-entry: ["test/simulation.test.js","a mature enemy economy deliberately progresses through Tier 2 and Tier 3 factories"] -->
### 198. a mature enemy economy deliberately progresses through Tier 2 and Tier 3 factories

**What it checks:** Runs the deterministic game simulation to confirm that a mature enemy economy deliberately progresses through Tier 2 and Tier 3 factories.

<!-- test-catalog-entry: ["test/simulation.test.js","advanced enemy mech factories produce the worker generation needed for the next tier"] -->
### 199. advanced enemy mech factories produce the worker generation needed for the next tier

**What it checks:** Runs the deterministic game simulation to confirm that advanced enemy mech factories produce the worker generation needed for the next tier.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI builds at most one charger and only for depleted staged units"] -->
### 200. enemy AI builds at most one charger and only for depleted staged units

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI builds at most one charger and only for depleted staged units.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI routes depleted staged units into its charger and waits for recharge"] -->
### 201. enemy AI routes depleted staged units into its charger and waits for recharge

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI routes depleted staged units into its charger and waits for recharge.

<!-- test-catalog-entry: ["test/simulation.test.js","the standard enemy opening establishes defenses and launches promptly"] -->
### 202. the standard enemy opening establishes defenses and launches promptly

**What it checks:** Runs the deterministic game simulation to confirm that the standard enemy opening establishes defenses and launches promptly.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI builds generation before spending crystal on an unpowered consumer"] -->
### 203. enemy AI builds generation before spending crystal on an unpowered consumer

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI builds generation before spending crystal on an unpowered consumer.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI places a needed relay on its connected grid"] -->
### 204. enemy AI places a needed relay on its connected grid

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI places a needed relay on its connected grid.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI places powered consumers inside its energized grid"] -->
### 205. enemy AI places powered consumers inside its energized grid

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI places powered consumers inside its energized grid.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI completes extra generation before projected demand exceeds supply"] -->
### 206. enemy AI completes extra generation before projected demand exceeds supply

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI completes extra generation before projected demand exceeds supply.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI reassigns an idle worker to an abandoned foundation"] -->
### 207. enemy AI reassigns an idle worker to an abandoned foundation

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI reassigns an idle worker to an abandoned foundation.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI builds an initial combat force before reserving for expensive construction"] -->
### 208. enemy AI builds an initial combat force before reserving for expensive construction

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI builds an initial combat force before reserving for expensive construction.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI balances combat roles and adds energy support as its army grows"] -->
### 209. enemy AI balances combat roles and adds energy support as its army grows

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI balances combat roles and adds energy support as its army grows.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI reserves crystal for its next generator after fielding a combat force"] -->
### 210. enemy AI reserves crystal for its next generator after fielding a combat force

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI reserves crystal for its next generator after fielding a combat force.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI only constructs a Supply Complex when its remaining supply is low"] -->
### 211. enemy AI only constructs a Supply Complex when its remaining supply is low

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI only constructs a Supply Complex when its remaining supply is low.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI establishes a paid outpost and expands to another crystal deposit"] -->
### 212. enemy AI establishes a paid outpost and expands to another crystal deposit

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI establishes a paid outpost and expands to another crystal deposit.

<!-- test-catalog-entry: ["test/simulation.test.js","fortified opposition accelerates AI expansion beyond two harvesters"] -->
### 213. fortified opposition accelerates AI expansion beyond two harvesters

**What it checks:** Runs the deterministic game simulation to confirm that fortified opposition accelerates AI expansion beyond two harvesters.

<!-- test-catalog-entry: ["test/simulation.test.js","AI strategy requests a sentry at every undefended remote harvester"] -->
### 214. AI strategy requests a sentry at every undefended remote harvester

**What it checks:** Runs the deterministic game simulation to confirm that AI strategy requests a sentry at every undefended remote harvester.

<!-- test-catalog-entry: ["test/simulation.test.js","AI outpost garrisons stay out of attack waves and answer local threats"] -->
### 215. AI outpost garrisons stay out of attack waves and answer local threats

**What it checks:** Runs the deterministic game simulation to confirm that AI outpost garrisons stay out of attack waves and answer local threats.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI expands beyond four harvesters when crystal is low and skips player claims"] -->
### 216. enemy AI expands beyond four harvesters when crystal is low and skips player claims

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI expands beyond four harvesters when crystal is low and skips player claims.

<!-- test-catalog-entry: ["test/simulation.test.js","workers begin construction at the floating-point edge of build range"] -->
### 217. workers begin construction at the floating-point edge of build range

**What it checks:** Runs the deterministic game simulation to confirm that workers begin construction at the floating-point edge of build range.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy combat units wait for a full wave before attacking"] -->
### 218. enemy combat units wait for a full wave before attacking

**What it checks:** Runs the deterministic game simulation to confirm that enemy combat units wait for a full wave before attacking.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI does not count armed workers as an attack wave"] -->
### 219. enemy AI does not count armed workers as an attack wave

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI does not count armed workers as an attack wave.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy combat units fire at nearby workers while advancing"] -->
### 220. enemy combat units fire at nearby workers while advancing

**What it checks:** Runs the deterministic game simulation to confirm that enemy combat units fire at nearby workers while advancing.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI holds an outmatched wave until enough attackers are staged"] -->
### 221. enemy AI holds an outmatched wave until enough attackers are staged

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI holds an outmatched wave until enough attackers are staged.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy AI chooses a safer target instead of attacking a defended position"] -->
### 222. enemy AI chooses a safer target instead of attacking a defended position

**What it checks:** Runs the deterministic game simulation to confirm that enemy AI chooses a safer target instead of attacking a defended position.

<!-- test-catalog-entry: ["test/simulation.test.js","an already dispatched AI assault does not turn around when defenses appear"] -->
### 223. an already dispatched AI assault does not turn around when defenses appear

**What it checks:** Runs the deterministic game simulation to confirm that an already dispatched AI assault does not turn around when defenses appear.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy combat units immediately answer structures rushed near their base as a wave"] -->
### 224. enemy combat units immediately answer structures rushed near their base as a wave

**What it checks:** Runs the deterministic game simulation to confirm that enemy combat units immediately answer structures rushed near their base as a wave.

<!-- test-catalog-entry: ["test/simulation.test.js","enemy rush responses wait for a coordinated force instead of sending one unit"] -->
### 225. enemy rush responses wait for a coordinated force instead of sending one unit

**What it checks:** Runs the deterministic game simulation to confirm that enemy rush responses wait for a coordinated force instead of sending one unit.

<!-- test-catalog-entry: ["test/simulation.test.js","cancelling construction removes the foundation, clears workers, and refunds unbuilt crystal"] -->
### 226. cancelling construction removes the foundation, clears workers, and refunds unbuilt crystal

**What it checks:** Runs the deterministic game simulation to confirm that cancelling construction removes the foundation, clears workers, and refunds unbuilt crystal.

<!-- test-catalog-entry: ["test/simulation.test.js","destroying every enemy unit and building ends the match in victory"] -->
### 227. destroying every enemy unit and building ends the match in victory

**What it checks:** Runs the deterministic game simulation to confirm that destroying every enemy unit and building ends the match in victory.

<!-- test-catalog-entry: ["test/simulation.test.js","losing every player unit and building ends the match in defeat"] -->
### 228. losing every player unit and building ends the match in defeat

**What it checks:** Runs the deterministic game simulation to confirm that losing every player unit and building ends the match in defeat.

<!-- test-catalog-entry: ["test/simulation.test.js","destroying a Headquarters instantly eliminates all of that commander's assets"] -->
### 229. destroying a Headquarters instantly eliminates all of that commander's assets

**What it checks:** Runs the deterministic game simulation to confirm that destroying a Headquarters instantly eliminates all of that commander's assets.

<!-- test-catalog-entry: ["test/simulation.test.js","field tests enable elimination while isolated simulations remain opt-in"] -->
### 230. field tests enable elimination while isolated simulations remain opt-in

**What it checks:** Runs the deterministic game simulation to confirm that field tests enable elimination while isolated simulations remain opt-in.

<!-- test-catalog-entry: ["test/simulation.test.js","multiplayer field tests disable the enemy commander AI"] -->
### 231. multiplayer field tests disable the enemy commander AI

**What it checks:** Runs the deterministic game simulation to confirm that multiplayer field tests disable the enemy commander AI.

<!-- test-catalog-entry: ["test/simulation.test.js","simulation snapshots restore a playable multiplayer client state"] -->
### 232. simulation snapshots restore a playable multiplayer client state

**What it checks:** Runs the deterministic game simulation to confirm that simulation snapshots restore a playable multiplayer client state.

<!-- test-catalog-entry: ["test/simulation.test.js","mixed human and AI matches continue until only one command team remains"] -->
### 233. mixed human and AI matches continue until only one command team remains

**What it checks:** Runs the deterministic game simulation to confirm that mixed human and AI matches continue until only one command team remains.

<!-- test-catalog-entry: ["test/simulation.test.js","multiplayer lobby codes are exactly ten uppercase letters and numbers"] -->
### 234. multiplayer lobby codes are exactly ten uppercase letters and numbers

**What it checks:** Runs the deterministic game simulation to confirm that multiplayer lobby codes are exactly ten uppercase letters and numbers.

<!-- test-catalog-entry: ["test/simulation.test.js","every player count offers multiple dense and selectable battlefield layouts"] -->
### 235. every player count offers multiple dense and selectable battlefield layouts

**What it checks:** Runs the deterministic game simulation to confirm that every player count offers multiple dense and selectable battlefield layouts.

<!-- test-catalog-entry: ["test/simulation.test.js","the three-player ancient ruins map is a dense ruin complex"] -->
### 236. the three-player ancient ruins map is a dense ruin complex

**What it checks:** Runs the deterministic game simulation to confirm that the three-player ancient ruins map is a dense ruin complex.

<!-- test-catalog-entry: ["test/simulation.test.js","an eight-player match gives every commander the standard starting package"] -->
### 237. an eight-player match gives every commander the standard starting package

**What it checks:** Runs the deterministic game simulation to confirm that an eight-player match gives every commander the standard starting package.

<!-- test-catalog-entry: ["test/simulation.test.js","match teams preserve per-AI difficulty and player-selected alliances"] -->
### 238. match teams preserve per-AI difficulty and player-selected alliances

**What it checks:** Runs the deterministic game simulation to confirm that match teams preserve per-AI difficulty and player-selected alliances.

<!-- test-catalog-entry: ["test/simulation.test.js","AI difficulty changes deterministic decision cadence and attack preparation"] -->
### 239. AI difficulty changes deterministic decision cadence and attack preparation

**What it checks:** Runs the deterministic game simulation to confirm that AI difficulty changes deterministic decision cadence and attack preparation.

<!-- test-catalog-entry: ["test/simulation.test.js","allied commanders share vision, reject friendly fire, and win together"] -->
### 240. allied commanders share vision, reject friendly fire, and win together

**What it checks:** Runs the deterministic game simulation to confirm that allied commanders share vision, reject friendly fire, and win together.

<!-- test-catalog-entry: ["test/simulation.test.js","snapshots preserve AI difficulties and commander alliances"] -->
### 241. snapshots preserve AI difficulties and commander alliances

**What it checks:** Runs the deterministic game simulation to confirm that snapshots preserve AI difficulties and commander alliances.

<!-- test-catalog-entry: ["test/simulation.test.js","every AI commander makes decisions with independent state and resources"] -->
### 242. every AI commander makes decisions with independent state and resources

**What it checks:** Runs the deterministic game simulation to confirm that every AI commander makes decisions with independent state and resources.

<!-- test-catalog-entry: ["test/simulation.test.js","victory waits until every AI commander has been eliminated"] -->
### 243. victory waits until every AI commander has been eliminated

**What it checks:** Runs the deterministic game simulation to confirm that victory waits until every AI commander has been eliminated.

<!-- test-catalog-entry: ["test/simulation.test.js","snapshots preserve multi-AI teams, starts, maps, and decision state"] -->
### 244. snapshots preserve multi-AI teams, starts, maps, and decision state

**What it checks:** Runs the deterministic game simulation to confirm that snapshots preserve multi-AI teams, starts, maps, and decision state.

<!-- test-catalog-entry: ["test/simulation.test.js","tactical minimap crystal markers use bright fog-independent colors"] -->
### 245. tactical minimap crystal markers use bright fog-independent colors

**What it checks:** Runs the deterministic game simulation to confirm that tactical minimap crystal markers use bright fog-independent colors.

## [test/strategic-view.test.js](test/strategic-view.test.js)

<!-- test-catalog-entry: ["test/strategic-view.test.js","strategic zoom fits the complete battlefield inside the viewport"] -->
### 1. strategic zoom fits the complete battlefield inside the viewport

**What it checks:** Calculates strategic-view presentation data to confirm that strategic zoom fits the complete battlefield inside the viewport.

<!-- test-catalog-entry: ["test/strategic-view.test.js","strategic label sizing stays readable across whole-map zoom levels"] -->
### 2. strategic label sizing stays readable across whole-map zoom levels

**What it checks:** Calculates strategic-view presentation data to confirm that strategic label sizing stays readable across whole-map zoom levels.

<!-- test-catalog-entry: ["test/strategic-view.test.js","strategic unit markers preserve actual world size"] -->
### 3. strategic unit markers preserve actual world size

**What it checks:** Calculates strategic-view presentation data to confirm that strategic unit markers preserve actual world size.

<!-- test-catalog-entry: ["test/strategic-view.test.js","strategic unit tags identify role and tier with compact markers"] -->
### 4. strategic unit tags identify role and tier with compact markers

**What it checks:** Calculates strategic-view presentation data to confirm that strategic unit tags identify role and tier with compact markers.

<!-- test-catalog-entry: ["test/strategic-view.test.js","crowded or medium zoom views use the reduced-cost renderer"] -->
### 5. crowded or medium zoom views use the reduced-cost renderer

**What it checks:** Calculates strategic-view presentation data to confirm that crowded or medium zoom views use the reduced-cost renderer.

## [test/test-catalog.test.js](test/test-catalog.test.js)

<!-- test-catalog-entry: ["test/test-catalog.test.js","TESTS.md lists every automated test with an explanation"] -->
### 1. TESTS.md lists every automated test with an explanation

**What it checks:** Reads every executable test title and verifies that this root catalog lists each one with an explanation.

