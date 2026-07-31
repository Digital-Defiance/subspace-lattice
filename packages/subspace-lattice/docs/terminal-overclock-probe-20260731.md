# Terminal Overclock probe results

Ran at: 2026-07-31T01:07:38.851Z
Games/cell: 40 · maxPlies: 120

## Firm answers

- **Dial0 (lone-any) hubs-only trunc / White WR?** trunc 0.0%; W 97.5%; lock 97.5%
- **Dial1 (both-lone) fixes lone-vs-escort reward?** asym White-lone WR dial0 100.0% → dial1 0.0% (want lone side <<50% or richer favored via hub captures)
- **Dial2 (shared clock) hubs-only White WR vs dial1?** W 92.5% → 97.5%; trunc 0.0% → 0.0%
- **Dial3 (entry komi) hubs-only White WR vs dial2?** W 97.5% → 2.5%; trunc 0.0% → 0.0%
- **Shipping dial3 vs OFF truncate?** ON trunc 0.0% vs OFF 92.5%
- **Anomaly kite geometry r=3?** ~71.9% pairs out of blast; N/S opposite hit=false
- **AI hit/miss on dial3?** HvH 39/0; MCTS 12/0
- **Midgame regression?** ON lock 2.5% hub 97.5% | OFF lock 0.0% hub 100.0%
- **Asymmetry dial3 White-lone / Black-lone?** White-lone WR 0.0%; Black-lone cell 100.0%
- **maxPlies budget** 120 · games/cell 40

## Geometry

- r=3: 71.9% Hub pairs out of range; mean safe squares 85.6; Anomaly N/S opposite in blast: false
- r=4: 58.3% Hub pairs out of range; mean safe squares 69.3; Anomaly N/S opposite in blast: false
- r=5: 44.5% Hub pairs out of range; mean safe squares 53.0; Anomaly N/S opposite in blast: false

## Cells

```
dial0 lone-any T=10 r=3 HvH                       n=40  trunc=0.0%  lock=97.5%  hub=2.5%  W=97.5%  empFires=39  hit/miss=39/0  avgPlies=21.0
dial0 lone-any asym White-lone HvH                n=40  trunc=0.0%  lock=100.0%  hub=0.0%  W=100.0%  empFires=40  hit/miss=40/0  avgPlies=21.0
dial1 both-lone T=10 r=3 HvH                      n=40  trunc=0.0%  lock=95.0%  hub=5.0%  W=92.5%  empFires=38  hit/miss=38/0  avgPlies=20.9
dial1 both-lone asym White-lone HvH               n=40  trunc=0.0%  lock=0.0%  hub=100.0%  W=0.0%  empFires=0  hit/miss=0/0  avgPlies=28.0
dial2 +shared-clock T=10 r=3 HvH                  n=40  trunc=0.0%  lock=95.0%  hub=5.0%  W=97.5%  empFires=38  hit/miss=38/0  avgPlies=20.8
dial2 +shared-clock asym White-lone HvH           n=40  trunc=0.0%  lock=0.0%  hub=100.0%  W=0.0%  empFires=0  hit/miss=0/0  avgPlies=28.0
dial3 +entry-komi T=10 r=3 HvH                    n=40  trunc=0.0%  lock=97.5%  hub=2.5%  W=2.5%  empFires=39  hit/miss=39/0  avgPlies=20.0
dial3 +entry-komi asym White-lone HvH             n=40  trunc=0.0%  lock=0.0%  hub=100.0%  W=0.0%  empFires=0  hit/miss=0/0  avgPlies=28.0
hubs OFF HvH                                      n=40  trunc=92.5%  lock=0.0%  hub=7.5%  W=33.3%  empFires=0  hit/miss=0/0  avgPlies=112.4
ship dial3 T=10 r=3 HvR                           n=40  trunc=0.0%  lock=90.0%  hub=10.0%  W=80.0%  empFires=36  hit/miss=36/0  avgPlies=20.1
ship dial3 T=10 r=3 MvH                           n=12  trunc=0.0%  lock=100.0%  hub=0.0%  W=0.0%  empFires=12  hit/miss=12/0  avgPlies=20.0
ship dial3 asym Black-lone HvH                    n=40  trunc=0.0%  lock=100.0%  hub=0.0%  W=100.0%  empFires=40  hit/miss=40/0  avgPlies=31.0
fleet midgame Terminal ON HvR                     n=40  trunc=0.0%  lock=2.5%  hub=97.5%  W=100.0%  empFires=2  hit/miss=1/1  avgPlies=68.8
fleet midgame Terminal OFF HvR                    n=40  trunc=0.0%  lock=0.0%  hub=100.0%  W=100.0%  empFires=2  hit/miss=0/2  avgPlies=69.6
```

