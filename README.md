# Token Radar — pre-token protocols ranked by implied value

An entry for make.fun's `token-radar-01` bounty: build the best token launch radar.

## What it is

One sealed snapshot of every protocol DefiLlama tracks (`input/snapshot.json`, as of
2026-11-14) in, one ranked board out. The board ranks the 40 protocols on the snapshot's
watchlist — at or above $50M of TVL, recording no token, and not a wrapped, staked or bridged
product of one that trades — plus the 160 largest pre-token protocols below the floor, by TVL.

## The model (radar-2)

The implied value follows only from the snapshot's own figures. The multiple is not a fixed
constant: it is the median market-cap-to-TVL ratio of the live-token protocols in the same
category, read from this very snapshot (categories with fewer than 3 live comparables fall back
to the snapshot-wide median), clipped to [0.02, 2.5]. Then:

```
growth     = clamp(7d TVL change, -60%, 120%)
growthMult = 1 + growth / 100 × 0.5
maturity   = 0.7 + min(age, 1095d) / 1095d × 0.3
implied    = TVL × multiple × growthMult × maturity
```

No protocol name is special-cased. Each detail view shows the exact arithmetic behind its
number, the live-token comparables that price its category, and a six-step farm plan with costs
and times. The dashboard also shows the live-token protocols at the market's own values, so the
reader can see what a launch is priced against.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22.18 or later, standard library only. It writes `out/board.json`, `out/data.js`,
`out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice: both runs write the
same bytes.

## Layout

- `main.ts` — the pipeline: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the radar-2 model, the farm plans, the live-token view.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit.
- `dashboard/` — the static page: board, detail view, filters, live-token view, how-it-works.
- `screenshots/` — the board, a protocol's detail view, and a filtered view.

## License

MIT. See `LICENSE`.
