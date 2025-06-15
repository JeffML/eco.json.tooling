The quality of the opening information here is poor. For instance:

```
A10     1. c4 "English Opening"
A10     1. c4 g6 2. e4 e5 3. d4 Nf6 4. Nf3 "English Opening"
A10     1. Nf3 e6 2. c4 b6 3. e4 Bb7 4. Nc3 Bb4 "English Opening"
A11     1. c4 c6 "English Opening"
A11     1. Nf3 Nf6 2. g3 d5 3. Bg2 Bf5 4. c4 c6 5. cxd5 cxd5 "English Opening"
A11     1. Nf3 d5 2. c4 c6 3. g3 Bg4 4. Bg2 Nd7 5. cxd5 cxd5 6. Nc3 "English Opening"
A11     1. Nf3 d5 2. g3 Nf6 3. Bg2 c6 4. c4 "English Opening"
A11     1. Nf3 Nf6 2. g3 d5 3. Bg2 c6 4. c4 dxc4 5. O-O Nbd7 "English Opening"
A11     1. c4 c6 2. Nf3 d5 3. e3 Nf6 4. Nc3 e6 "English Opening"
A11     1. c4 c6 2. Nf3 d5 3. e3 Nf6 4. Nc3 a6 "English Opening"
A11     1. Nf3 d5 2. g3 g6 3. c4 c6 "English Opening"
A11     1. c4 c6 2. Nf3 d5 3. g3 Bg4 4. Bg2 e6 5. O-O Nf6 6. d3 dxc4 "English Opening"
A11     1. Nf3 Nf6 2. g3 d5 3. Bg2 c6 4. O-O Bg4 5. d3 Nbd7 6. c4 "English Opening"
A12     1. c4 c6 2. Nf3 d5 3. b3 "English Opening"
A12     1. c4 c6 2. Nf3 d5 3. e3 Nf6 4. b3 "English Opening"
A13     1. c4 e6 "English Opening"
```

and

```
A40     1. d4 g6 2. c4 Bg7 3. Nf3 c5 4. e4
A40     1. d4 g6 2. c4 Bg7 3. Nc3 c5 4. d5 Bxc3+ 5. bxc3 f5
A40     1. c4 e6 2. d4 b6 3. e4 Bb7 4. Bd3
A40     1. d4 e6 2. c4 Bb4+
A40     1. d4 e6 2. c4 Bb4+ 3. Bd2 Qe7 4. a3
A40     1. d4 e6 2. c4 Bb4+ 3. Bd2 a5 4. a3
A41     1. d4 d6
``` (no opening names)

Here's a breakdown form step 2 of index.js:

```
Of the 2040 in opening.json, there were:
    842 new openings
    261 redundant openings
    853 modifications to existing eco.json openings
    47 formerly interpolated opening
```

The 842 'new' openings contain move sequences not in eco.json, but almost all of them have generic, big-bucket names. I've included the add.json parser output to illustrate.

This data will not be merged into eco.json at this time.