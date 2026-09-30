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
