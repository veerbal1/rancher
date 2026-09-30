<p align="center">
  <img src="ui/public/logo.png" alt="Rancher" width="88">
</p>

<h1 align="center">Rancher</h1>

<p align="center">
  <b>Virtual fencing for cattle.</b><br>
  GPS collars keep cows inside paddocks with sound, vibration and pulse cues,<br>
  and walk the whole herd to fresh pasture along a lane drawn on a map.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-edge%20%2B%20lambdas-00ADD8?logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/React-TypeScript-3178C6?logo=typescript&logoColor=white" alt="React and TypeScript">
  <img src="https://img.shields.io/badge/AWS-Kinesis%20%C2%B7%20Lambda%20%C2%B7%20DynamoDB-FF9900?logo=amazonwebservices&logoColor=white" alt="AWS">
  <img src="https://img.shields.io/badge/Terraform-one%20command%20up-7B42BC?logo=terraform&logoColor=white" alt="Terraform">
</p>

https://github.com/user-attachments/assets/9308bbc7-1300-410d-aa8e-bd03ac9a78b7

A portfolio build modelled on [Halter](https://halterhq.com): simulated collars at the edge, a streaming pipeline on AWS, and a live farm map updated over WebSockets.

- **The collar decides, not the cloud.** Each collar predicts when its cow will reach the fence and fires the left or right emitter about 10 seconds early, so she turns away before she gets there.
- **Move the herd by drawing a line.** Collars find the gate, guide every cow along the lane and into the new paddock, and can turn the herd back mid-walk.
- **Built for bad radio.** Fences are versioned and retried until every collar has them, and the map shows exactly how many are up to date.
- **About a second from collar to screen.** Tower → Kinesis → Lambda → WebSocket → map.
- **One command up, one command down.** The whole stack costs nothing while it's off.

<p align="center">
  <a href="#architecture">Architecture</a> ·
  <a href="#how-the-collar-thinks">Algorithms</a> ·
  <a href="#distributed-systems">Distributed systems</a> ·
  <a href="#run-it">Run it</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

> The live demo runs on demand to keep costs at zero. Ask me for a link, or bring up your own copy with `./scripts/up.sh`.

## What it does, in 60 seconds

1. **Draw a paddock.** Click its corners on the satellite map. Its area is worked out for you.
2. **Collar the herd.** Add collars and assign them to the paddock. Within 10 seconds a cow appears for each collar and starts grazing.
3. **Watch the fence hold.** When a cow heads for the edge, her collar works out how soon she'll reach it and cues her from the side facing the fence: a sound first, then a vibration, then a mild pulse. She turns away and walks off.
4. **Move the herd.** Pick another paddock and draw the lane the cows should walk. Each collar guides its cow to the gate, along the lane and into the new paddock.
5. **Change your mind.** **Turn back** walks the herd home along the same lane. Drag a paddock's corners to reshape it, and the map shows how many collars have the new fence, for example `Fence v3 · 7/9 updated`.

Everything on the map is live: positions arrive about once a second, and the green badge shows they're being pushed over a WebSocket.

| On the map | Means |
|---|---|
| 🟢 green ring | grazing inside the fence |
| 🟡 amber ring | close to the fence |
| 🔴 red ring | outside the fence |
| 🔵 blue ring | walking a lane to a new paddock |
| Expanding ripple | a cue firing: yellow for sound, orange for vibration, red for a pulse |
| Orange dot behind an ear | which emitter is firing, left or right |

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <img src="docs/architecture.png" alt="Collars and towers send events every second to Kinesis. An ingest Lambda stores the latest position per collar in DynamoDB, served by cow-api. A cow-push Lambda looks up who is watching in a connections table and pushes positions over an API Gateway WebSocket to the browser. The browser edits the farm through an HTTP API and farm-api Lambda backed by a single DynamoDB table, which towers read every 10 seconds.">
</picture>

<sub>Arrows point the way data flows. farm-api both reads and writes the farm table.</sub>

Three loops run through the system.

**1. Telemetry: collar to map in about a second**

Each farm has a tower that runs its collars. Every second the tower batches every collar's latest reading into one `PutRecords` call to Kinesis, using `farmer_id` as the partition key, so all of a farm's events land on one shard in order. Two Lambdas read the stream independently:

- **ingest** writes each reading to `cow-positions`, which keeps only the latest reading per collar.
- **cow-push** keeps each collar's newest event in the batch, looks up which browsers are watching that farm, and pushes one message per farm over the WebSocket.

**2. Real time: only farms someone is watching**

When the map opens, the browser connects to the WebSocket with its farm id. `cow-ws` stores the connection in `cow-connections`, and `$disconnect` deletes it. Connections that vanish without saying goodbye are removed the first time a push to them returns `410 Gone`. A farm with no viewers costs nothing to push.

The browser loads a snapshot from `cow-api` first, then applies pushes. If pushes stop for 3 seconds it falls back to polling, and it drops any cow it hasn't heard from in 10 seconds.

**3. Control: farmer to collar within 10 seconds**

Paddocks, collars and herd moves live in the `rancher` table. Every 10 seconds each tower reads `/world` from the farm API, signed with its IAM role, and reconciles: new collars appear, a paddock change starts a herd move, and an edited boundary is queued for delivery to each collar over a lossy radio link.

The collars never wait for the cloud. Once a collar has its fence, it decides every cue by itself, so a dropped uplink never lets a cow walk out.

| Part | Built with | Why |
|---|---|---|
| Collars and towers | Go simulator on a `t4g.nano` | One process runs every farm; a new binary replaces the instance on deploy |
| Event stream | Kinesis on-demand, keyed by farm | In-order events per farm, and several independent readers |
| Latest positions | DynamoDB `farmer_id` + `collar_id` | One query returns a whole farm |
| Farm data | DynamoDB single table, API Gateway HTTP API | `FARMER#id` with `PROFILE`, `PADDOCK#`, `COLLAR#` and `SHIFT#` items, so a farm is one partition |
| Live updates | API Gateway WebSocket, connections table with a farmer index | Push instead of every browser polling every second |
| UI | React, MapLibre, Terra Draw, Amazon Location satellite tiles | Drawing paddocks and lanes directly on the map |
| Infrastructure | Terraform, `up.sh` / `down.sh` | The whole stack comes up and goes away with one command |

## How the collar thinks

Every collar runs the same loop once a second, entirely on the collar: where am I, how close is the fence, am I heading into it, and which way should I turn? It's all plain 2D geometry, with no GIS library and no call to the cloud.

### Geometry basics

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/geometry-dark.svg">
  <img src="docs/geometry.svg" alt="Three panels. One: a globe where a line of latitude at angle phi has radius R cos phi, so a degree of longitude shrinks with cos phi. Two: an L-shaped paddock with rays cast east from three cows; the cow whose ray crosses one edge is inside, the cows whose rays cross zero or two edges are outside. Three: a cow projected onto a fence edge at t = 0.44 with a right angle, and a second cow past the end of the edge whose projection is clamped to the corner.">
</picture>

**1. Degrees to metres.** GPS gives degrees, but fences are measured in metres. Around a single cow the ground is flat enough to use a local projection centred on her:

```math
x = (\lambda - \lambda_0) \cdot 111{,}320 \cdot \cos\varphi_0 \qquad y = (\varphi - \varphi_0) \cdot 111{,}320
```

A degree of latitude is about 111.32 km anywhere (40,075 km ÷ 360). Lines of longitude converge towards the poles, so a degree of longitude is that times cos φ: about 88 km at the demo farm, 37.7° S.

How wrong is a flat earth? Against the real ellipsoid at 37.7° S, the scale is off by 0.3% north–south and 0.1% east–west, and cos φ changes by only 0.006% across a 500 m paddock. On the 10 m warning distance that's 3 cm, far below GPS noise of 3–5 m. So one multiplication per axis replaces the haversine formula.

**2. Inside or outside: ray casting.** Cast a ray due east from the cow and count the fence edges it crosses. An odd count means she's inside. An edge from $a$ to $b$ crosses the ray when it straddles her latitude and the crossing is east of her:

```math
(a_y > y) \ne (b_y > y) \quad \text{and} \quad x < a_x + (y - a_y)\,\frac{b_x - a_x}{b_y - a_y}
```

- It's O(n) for an n-cornered paddock and works for concave shapes like an L.
- The half-open test `>` counts a corner that sits exactly on the ray once, not twice.
- It runs directly on degrees: stretching one axis never changes which side of an edge a point is on, so no projection is needed.

**3. Distance to the fence: projecting onto a segment.** In metres, with the cow at $P$ and an edge from $A$ to $B$, where $d = B - A$:

```math
t = \mathrm{clamp}\left(\frac{(P - A) \cdot d}{\lVert d \rVert^2},\ 0,\ 1\right) \qquad Q = A + t\,d \qquad \text{distance} = \lVert P - Q \rVert
```

$t$ is how far along the edge the nearest point lies. Clamping it to $[0, 1]$ keeps that point on the fence: past either end, the nearest point is the corner. The distance to the fence is the smallest over all edges.

The ray test tells the collar whether its cow is outside, and the nearest point on every edge becomes a *wall* that the next step checks.

Code: [`edge/fence.go`](edge/fence.go)

### Fence zones: time, not distance

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/zones-dark.svg">
  <img src="docs/zones.svg" alt="Four cows near a fence, each with an arrow showing where she will be in 10 seconds. A cow 3 m away walking along the fence never reaches it and stays inside. A cow 8 m away walking straight at it reaches it in 8 seconds and is in warning. A cow 8 m away at 60 degrees takes 16 seconds and stays inside. A cow 3 m outside is breached and turns home. Beside it, a state diagram: inside, warning and breached get worse at once and better only after 3 calm seconds, and inside shows as moving during a herd move.">
</picture>

A collar could warn whenever its cow is within 10 m of the fence. It asks a better question instead: at her current speed and heading, how soon would she reach it?

For each wall $w$ from the step above, $d_w$ is the distance to it and $\theta_w$ is the angle between her heading and the direction to it, so she closes on it at $v\cos\theta_w$:

```math
\text{state} =
\begin{cases}
\text{breached} & \text{if the ray test says she is outside} \\
\text{warning} & \text{if some wall has } v\cos\theta_w > 0 \text{ and } \frac{d_w}{v\cos\theta_w} \le 10\ \text{s} \\
\text{inside} & \text{otherwise}
\end{cases}
```

Why time works better than distance:

- **Heading matters.** A cow walking at 1 m/s straight at the fence is caught 10 m out. At 60° only half her speed closes the gap, so she's caught at 5 m. Walking along the fence, never.
- **Grazing along a fence stays quiet.** A distance band would keep cueing a cow that's only grazing near an edge, even though she isn't going anywhere.
- **Speed matters.** A cow moving faster is flagged further out, when she needs more room to turn.

**States settle before they relax.** A worse state applies at once, and going from inside to warning or breached starts the first cue, a sound. A better state only applies after 3 calm seconds in a row, so a cow right at the 10-second mark doesn't flicker between states. During a herd move, a cow inside the move's fence shows as **moving**.

**Where 10 m still counts:**

- Once a cue starts while she's grazing, it keeps going while she's within 10 m of that wall and hasn't yet turned more than 120° away from it. Otherwise a cow that turned parallel to the fence would stop counting as a threat, and stop being cued, before she had actually moved away.
- A cow on a move has only arrived once she's inside the new paddock and at least 10 m from its edges.

Code: [`edge/collar.go`](edge/collar.go) (`assess` and `Observe`)

### Threat detection: which side?

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/threats-dark.svg">
  <img src="docs/threats.svg" alt="Three panels. One: a cow between two fences; the wall ahead-right is at plus 45 degrees and the wall ahead-left at minus 40 degrees. Two: a cow heading into a corner with both walls 9 seconds away; both emitters fire and she turns around. Three: two cows outside the fence; one with home behind her at 164 degrees fires both emitters and turns around, the other with home 49 degrees to her left fires the right emitter and turns left.">
</picture>

Each edge of the fence gives a wall: the nearest point on it. For each wall the collar measures the signed angle from her heading $\psi$ to that point:

```math
\theta_w = \mathrm{wrap}_{\pm 180^\circ}\left(\mathrm{atan2}(\Delta x, \Delta y) - \psi\right)
```

Compass bearings run clockwise from north, so $\theta_w > 0$ means the wall is on her right. It's the same test as the sign of the 2D cross product of her heading and the direction to the wall, done with a single `atan2`.

A wall is a threat when she'd reach it within 10 seconds (see [Fence zones](#fence-zones-time-not-distance)). The threats then choose the emitter. The one on the wall's side fires, and she turns away from it:

| Threats | Emitter | She turns |
|---|---|---|
| Only on her right, $\theta > +1^\circ$ | right | left |
| Only on her left, $\theta < -1^\circ$ | left | right |
| On both sides, as in a corner | both | around |
| Dead ahead, $\lvert\theta\rvert \le 1^\circ$ | one at random | away from it |

- **Every wall counts, not just the nearest.** Checking only the nearest wall would turn a cow in a corner away from one fence and straight into the other.
- **Head-on needs a tie-break.** Square to a fence the angle is about 0°, and its sign is just noise. A coin flip picks a side. After that first turn she's no longer head-on, so the geometry decides from then on.
- **Turning around is not quite 180°.** Both emitters turn her by 180° ± 17°, so a herd cued in the same corner doesn't walk back out in single file.

**Outside the fence, walls don't matter; home does.** Home is the paddock's centre, or during a move, the nearest point on the lane. The collar fires the emitter that turns her toward it:

```math
\text{emitter} =
\begin{cases}
\text{both, turn around} & \text{if } \lvert\theta_{\text{home}}\rvert > 150^\circ \\
\text{left, turn right} & \text{if } \theta_{\text{home}} > +1^\circ \\
\text{right, turn left} & \text{if } \theta_{\text{home}} < -1^\circ \\
\text{none} & \text{already heading home}
\end{cases}
```

How far each cue turns her, and what happens if she ignores it, comes next.

Code: [`edge/collar.go`](edge/collar.go) (`assess` and `sideToward`)

