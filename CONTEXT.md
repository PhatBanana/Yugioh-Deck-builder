# Card Scanning & Rarity

The camera scanning pipeline: identifying a physical card, resolving which
printing (set code + rarity) it is, and filing it into the collection.

## Language

### Identifying the printing

**Printing**:
One physical variant of a card — a specific set code + rarity (+ edition)
combination. The unit the collection files copies under.
_Avoid_: version, variant

**Rarity index**:
The offline lookup built during card sync that maps a canonical set code to
its known printings. The source of the candidate set during a scan.

**Candidate set**:
The printings a scanned set code could be, per the rarity index. Vision and
priors narrow it; the picker resolves what's left.

**Prior**:
The pull-rate + price ranking that orders the candidate set by statistical
likelihood when nothing else decides.

**Ambiguous**:
A filed copy whose rarity was picked by the prior rather than confirmed.
Shown with a "?" chip; findable until the user confirms it.
_Avoid_: unconfirmed (that's the user-facing pill label, not the model term)

### Seeing the foil

**Foil family**:
The visual finish class a card's rarity presents: `matte`, `holo-name`,
`holo-art`, `gold-name`, or `rainbow`. What vision can honestly distinguish;
several rarity tiers share one family. The ML classifier's label space.
_Avoid_: rarity bucket (implementation name for the same concept), foil type

**Foil pass**:
The single-frame visual check that reads the foil family from an ambient
camera frame. Today a heuristic; being replaced by the ML classifier.

**Torch pass**:
The two-frame check that flashes the torch and reads the specular
*difference* between torch-on and torch-off frames. A physical measurement,
separate from and ranked above the foil pass. Opt-in.
_Avoid_: flash pass

**Abstain**:
A vision verdict of "no honest information" — glare-blown or no card in
frame. A positive classification (`unclear`), distinct from `matte`
("nothing shines"). An abstaining pass contributes nothing to narrowing.
_Avoid_: unknown, failed

### Building the dataset

**Capture**:
Saving a card crop plus its trusted label to the on-device training set at
the moment the label becomes known. Stays on the phone until manually
exported.

**Trusted label**:
A foil-family label derived from either a picker confirmation or an
unambiguous rarity index hit (set code maps to exactly one printing). The
only labels that enter training.
_Avoid_: ground truth (reserve for lab-tagged samples)

**Card crop**:
The scan frame cropped to the detected card bounding box — what the model
trains on and classifies. No card box detected means no crop and no
classification.

**Contribution**:
Sending captured examples off the phone into the shared training dataset.
A separate consent tier from capture: capture is on-device and defaults on;
contribution is explicit — today a manual share-sheet export, later perhaps
an opt-in (default-off) upload.
_Avoid_: sync, backup (both mean other things in this app)
