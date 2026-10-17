# Roadster Night

Live: https://rongxuanmu.com/roadster-xr/ · Built on the [VibeXR framework](../vibexr/README.md)

A fan-made 1:60 diorama of the Roadster reveal (15 Oct 2026, SpaceX's rocket test site at McGregor, near Waco,
Texas), on your floor in WebXR. Not affiliated with Tesla or SpaceX; the cars are plain silhouettes with no badges.

It plays the show by itself, on a loop:

1. **0–60**: three red lamps, green, and the car launches on its rear cold-gas thrusters; the big screen stops the
   clock at 0.81 s.
2. **Curl ramp**: up a half loop that curls over, held upside down by its suction fans, off the top, a 180° roll in
   the air and a thruster-eased landing on the pad below.
3. **Jump**: a thruster hop with a barrel roll over a Cybercab, Cybertruck, Semi, Model Y and Model 3.
4. **Finale**: donuts in vapour and tyre smoke, fireworks, the car turns to face you and flashes its lights.

The interaction follows Microduck XR: the stage sits on the real floor (1.6 m below your head) or on a tabletop at
0.42 scale. Its bar moves it, and two hands on the bar turn and scale it. The console rides with the stage, and every
panel can be dragged by its own bar.

- **Show panel**: play / pause, jump to an act, slow-mo, Drive, Tabletop, Sound, Reset.
- **Drive panel**: a joystick (or thumbstick, or WASD) takes the car; Thrust hops it (Space, or A on a controller);
  Launch does 0–60 (Shift).
- **Pinch the pad** anywhere and the car drives there.
- **Grab the car** to lift it; let go and it lands on its thrusters.
- **Roll into the curl ramp's run-in**, square and quick enough, and it takes the ramp.

It runs in real time by default. At 1:60 a car moving at its true speed covers 1/60 of the distance in front of you
and can read as slow motion (a miniature would need about sqrt(60) = 7.7 times to look physically right), so the
**Fast** button runs diorama time 2.5 times faster. The big screen still shows the scene's own clock (0.81 s). The car finds its way around
the line-up, the ramp, the stands and the posts (A* over an occupancy grid), and when you drive it checks the car's
whole outline.

Everything is generated in code: lofted flat-shaded bodies, the ramp ribbon, instanced crowd, additive vapour points,
synthesised sound. There are no model files, so it stays light for standalone and tethered headsets.

| Path | What it is |
| --- | --- |
| `src/models.js` | the course layout, the Roadster and the line-up, the curl ramp, the venue, vapour particles |
| `src/show.js` | the car's motion (routes, straight runs, flight with landing burns), the four acts, sound |
| `src/world.js` | the world: stage and bar, console, joystick, driving, grabbing, pinch-to-go |
| `build.py` | writes `index.html` (site) and `codepen.html` (CodePen) from the framework and `src/` |

Sources for the show: TechCrunch, CBS News, Electrek and the Wikipedia article on the second-generation Roadster
(October 2026).
