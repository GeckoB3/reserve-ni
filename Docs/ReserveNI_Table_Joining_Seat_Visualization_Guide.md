# ReserveNI — Table Joining, Seat Visualization & Combination Display

**Implementation Guide for Cursor AI Agents**
**March 2026**

---

## The Problem

Three specific things aren't working correctly and need to be built from scratch with clear logic:

1. **Floor plan editor**: Tables need visible seat dots around them. When two tables are dragged close together, they should visually "snap" and join — the seats on the joined sides disappear, and the tables render as one combined unit.

2. **Floor plan live view**: Combined tables should display as a single joined shape during service, not two separate shapes floating next to each other.

3. **Timeline grid**: When a booking uses a table combination, the grid must clearly show this — the booking block should visually span multiple table rows with a bracket or connector, so servers can see at a glance that it's a combo.

This guide explains the exact logic for each, then provides Cursor prompts that will work.

---

## Part 1: The Seat Dot System

### 1.1 How Seat Dots Work

Every table has dots around its perimeter representing individual seats. The number of dots equals the table's `max_covers`. Their positions are calculated mathematically based on the table's shape and size.

**For rectangular tables:**
Seats are distributed evenly around the four edges. A 4-top rectangular table has 1 seat on each of the 4 sides. A 6-top has 2 on each long side and 1 on each short side. The algorithm:

```
Given: tableWidth, tableHeight, seatCount
1. Calculate perimeter = 2 * (tableWidth + tableHeight)
2. Calculate spacing = perimeter / seatCount
3. Walk around the perimeter clockwise from top-left, placing a dot every 'spacing' units
4. Each dot has:
   - x, y position (on the edge of the table)
   - angle (pointing outward from the table centre — used to draw the dot offset from the edge)
   - edgeSide: 'top' | 'right' | 'bottom' | 'left' (which side of the table this seat is on)
```

**For circular tables:**
Seats are evenly spaced around the circle:

```
Given: centreX, centreY, radius, seatCount
For i = 0 to seatCount - 1:
  angle = (2 * PI * i / seatCount) - PI/2  // start from top
  dotX = centreX + (radius + dotOffset) * cos(angle)
  dotY = centreY + (radius + dotOffset) * sin(angle)
```

**For square tables:**
Same as rectangular, but width === height.

### 1.2 Rendering Seat Dots

Each seat dot is a small filled circle (radius ~6px) positioned just outside the table edge (offset ~12px from the table perimeter). Colour: medium grey (#9CA3AF) when empty, the table's status colour when occupied (showing which seats are filled).

In the floor plan editor, dots are decorative — they show the venue owner how many seats each table has and where they are.

In the live view, dots can optionally reflect occupancy (e.g. 3 of 4 dots filled when a party of 3 is at a 4-top).

---

## Part 2: Table Joining (Snap-Together Logic)

This is the hardest part, so the logic must be precise.

### 2.1 Core Concept

When a user drags Table A close to Table B in the floor plan editor, and they meet certain conditions, the tables should "snap" together:

1. Table A's edge aligns with Table B's edge (within a threshold, e.g. 20px)
2. The tables are parallel (rotation difference is 0° or 180°)
3. There is meaningful overlap between the edges (at least 50% of the shorter table's edge length overlaps)

When snapped:
- The tables lock together (further dragging moves both)
- The seat dots on the joined sides **disappear** (no one can sit where the tables touch)
- A visual connector or merged outline shows they are one unit
- A `table_combination` record is created (or updated) in the database

### 2.2 The Snap Detection Algorithm

```
function detectSnap(tableA, tableB, snapThreshold = 20):

  // Get the bounding edges of each table (accounting for rotation)
  edgesA = getTableEdges(tableA)  // returns {top, right, bottom, left} as line segments
  edgesB = getTableEdges(tableB)

  // Check each pair of opposing edges
  possibleSnaps = []
  
  // A's right edge near B's left edge (A is to the left of B)
  if abs(edgesA.right.x - edgesB.left.x) < snapThreshold:
    overlap = calculateEdgeOverlap(edgesA.right, edgesB.left)  // Y-axis overlap
    if overlap > 0.5 * min(edgesA.right.length, edgesB.left.length):
      possibleSnaps.push({ 
        sideA: 'right', sideB: 'left',
        snapX: (edgesA.right.x + edgesB.left.x) / 2,
        overlap 
      })

  // A's left edge near B's right edge (A is to the right of B)
  // ... same logic, checking other direction

  // A's bottom edge near B's top edge (A is above B)
  if abs(edgesA.bottom.y - edgesB.top.y) < snapThreshold:
    overlap = calculateEdgeOverlap(edgesA.bottom, edgesB.top)  // X-axis overlap
    if overlap > 0.5 * min(edgesA.bottom.length, edgesB.top.length):
      possibleSnaps.push({
        sideA: 'bottom', sideB: 'top',
        snapX: null,
        snapY: (edgesA.bottom.y + edgesB.top.y) / 2,
        overlap
      })

  // A's top edge near B's bottom edge (A is below B)
  // ... same logic

  // Return the best snap (most overlap) or null
  return possibleSnaps.sort(byOverlapDescending)[0] || null
```

### 2.3 What Happens When Tables Snap

1. **Position adjustment**: The dragged table's position is adjusted so the edges are exactly touching (gap = 0). Table B snaps to align perfectly with Table A.

2. **Seat dot removal on joined sides**: When tables are snapped with `sideA: 'right'` and `sideB: 'left'`, ALL seat dots on Table A's right edge and Table B's left edge are hidden. The `edgeSide` property from Section 1.1 is used to identify which dots to hide.

3. **Visual merge**: Draw a combined outline around both tables as a single shape. The individual table borders on the joined sides become invisible — replaced by the merged outline. Use a Konva `Line` or `Shape` with custom path that traces around the exterior of both tables, skipping the joined edges.

4. **Database record**: Create or update a `table_combination` with both table IDs, and set `combined_max_covers` to the sum of both tables' `max_covers` minus the seats that were removed (the hidden dots on the joined sides).

### 2.4 Combined Outline Rendering

For two rectangular tables joined side-by-side (A's right to B's left), the combined outline path is:

```
Start at A's top-left corner
→ Move right along A's top edge to A's top-right corner
→ Continue right along B's top edge to B's top-right corner  (skip the gap)
→ Move down along B's right edge to B's bottom-right corner
→ Move left along B's bottom edge to B's bottom-left corner
→ Continue left along A's bottom edge to A's bottom-left corner  (skip the gap)
→ Move up along A's left edge back to start
```

This creates one continuous outline around both tables. The inner joined edges are not drawn.

### 2.5 Unsnapping Tables

If a user drags a snapped table away (beyond the snap threshold):
- The tables separate
- The hidden seat dots reappear
- The combined outline is removed and individual outlines return
- The `table_combination` record is deleted
- Combined max_covers recalculates

### 2.6 Multiple Table Joins

Tables can join in chains: A–B–C (three tables in a row). The logic is recursive:
- When C snaps to B, and B is already snapped to A, the combination includes all three
- The combined outline wraps around all three tables
- Seats are hidden on ALL internal joined edges (A's right + B's left, B's right + C's left)
- The `table_combination` record includes all three table IDs

### 2.7 Storage

The join relationship is stored two ways:

1. **`table_combinations` + `table_combination_members`** — The existing schema from the implementation plan. This stores the logical combination.

2. **`venue_tables.snap_group_id`** — Add this new column (UUID, nullable). All tables in a snapped group share the same `snap_group_id`. This makes it fast to query "which tables are joined to this one?" without joining through the combination tables.

3. **`venue_tables.snap_side`** — Add this column (TEXT, nullable, e.g. 'right', 'left', 'top', 'bottom'). Records which side of this table is joined to its neighbour. NULL means no join on this side. For tables joined on multiple sides (e.g. L-shaped configurations), store as JSON array: `['right', 'bottom']`.

---

## Part 3: Timeline Grid — Combination Display

### 3.1 The Problem

When a booking is assigned to a table combination (e.g. Tables 3+4), the timeline grid currently shows... what? If it shows the booking on just one row, the server doesn't know it's a combo. If it shows it on two rows as separate blocks, it looks like two bookings.

### 3.2 The Solution: Spanning Blocks with Visual Connector

A booking on a combination should render as a **single block that visually spans multiple table rows**. Here's the exact specification:

**For a booking on Tables 3+4 (adjacent rows in the grid):**

```
├──────────┼──────────────────────────────────────────┤
│ Table 3  │ ┌─── Smith (6) 🎂 ─────────────────────┐ │
│ (2-4)    │ │  19:00-20:30  Confirmed               │ │
│          │ │              Tables 3+4               │ │
│ Table 4  │ │                                       │ │
│ (2-4)    │ └───────────────────────────────────────┘ │
├──────────┼──────────────────────────────────────────┤
```

The block:
- Spans the full height of both table rows
- Has a single continuous background colour (not two blocks)
- Shows "Tables 3+4" as a subtitle or tag within the block
- Has a small chain-link icon (🔗) or bracket symbol to reinforce that it's a combination
- The table names on the Y-axis for the involved rows should have a visual bracket or line connecting them

**For non-adjacent rows** (e.g. Tables 2+5 where other tables are between them in the grid): This is rare (combined tables are usually adjacent in sort order) but handle it by:
- Showing the booking block on the first table's row at normal height
- Drawing a thin coloured connector line down to the second table's row
- Showing a small "ghost" block on the second table's row (same colour but at 30% opacity, showing "→ See Table 2")

### 3.3 Implementation Approach

**Sort combined tables adjacently:** When table management is set up, tables in a combination should have consecutive `sort_order` values. The floor plan editor should auto-adjust sort orders when tables are snapped together. This ensures combined table rows are always adjacent in the grid, making the spanning block work naturally.

**Rendering the spanning block:** In the grid component, when mapping bookings to cells:
1. Check if the booking has multiple entries in `booking_table_assignments`
2. If yes, find all assigned table IDs
3. Find the row indices of those tables in the grid
4. If the rows are consecutive: render a single block component with `height = rowHeight * numberOfTables` positioned at the first row
5. If not consecutive: render the primary block on the first row and connector lines/ghost blocks on the others

**Drag-and-drop for combinations:** When dragging a booking that requires a combination onto the grid:
1. During drag, highlight ALL rows of the combination in green (not just the hovered row)
2. If the user drags a 6-person booking onto a 4-top, and there's a valid combination (e.g. this 4-top + the adjacent 2-top), auto-highlight both rows
3. On drop, create `booking_table_assignments` for all tables in the combination
4. Render the spanning block

### 3.4 Unassigned Booking Sidebar — Combination Hints

When an unassigned booking in the sidebar needs a combination (party size > any single table's max_covers):
- Show a small tag: "Needs combo" in amber
- When the user starts dragging this booking, the grid should pre-highlight all valid combination options
- The tooltip/popover on the booking should suggest: "Fits: Tables 3+4 (8 covers), Tables 7+8 (6 covers)"

---

## Part 4: Cursor Prompts

### Prompt A: Seat Dot System & Table Rendering

> **Cursor Prompt:**
>
> "Rebuild the floor plan table rendering for ReserveNI with a proper seat dot system. Each table on the floor plan canvas (both in the editor at `/dashboard/settings/floor-plan` and the live view at `/dashboard/floor-plan`) must show individual seat dots around its perimeter.
>
> **Create a utility module at `lib/floor-plan/seat-positions.ts`:**
>
> Export a function `calculateSeatPositions(shape, width, height, maxCovers, hiddenSides)` that returns an array of `{ x, y, angle, edgeSide }` for each seat:
>
> - For **rectangular/square** tables: distribute seats evenly around the perimeter. Walk clockwise from the top-left corner. Calculate the total perimeter, divide by seat count to get spacing, then place dots at each interval point. Each dot has an `edgeSide` property ('top', 'right', 'bottom', 'left') based on which edge it falls on. For a 4-top, place 1 on each side. For a 6-top, place 2 on each long side, 1 on each short side. For a 2-top, place 1 on each long side (left and right, assuming wider than tall).
>
> - For **circular** tables: distribute seats evenly around the circle. `angle = (2 * PI * i / seatCount) - PI/2` to start from the top. Assign `edgeSide` based on angle quadrant (top: -45° to 45°, right: 45° to 135°, bottom: 135° to 225°, left: 225° to 315°).
>
> - The `hiddenSides` parameter is a `Set<string>` of edge sides where seats should NOT be placed (used when tables are joined). If `hiddenSides` includes 'right', skip all seats that would be on the right edge and redistribute the remaining seats on the remaining edges.
>
> **Create a React Konva component at `components/floor-plan/TableShape.tsx`:**
>
> This renders a single table with its seat dots. Props: `table` (venue_table data), `hiddenSides` (Set of sides to hide seats), `isSelected` (boolean), `isEditorMode` (boolean), `statusColour` (string), `booking` (current booking data if occupied, null if free), `onDragEnd`, `onClick`.
>
> Rendering:
> 1. A Konva `Group` containing everything, positioned at (table.position_x, table.position_y) scaled to canvas dimensions.
> 2. The table shape: `Rect` (with cornerRadius 8) for rectangle/square, `Circle` for circle. Fill colour: white with border in editor mode, statusColour in live mode. Subtle shadow (shadowBlur: 4, shadowOpacity: 0.15).
> 3. Seat dots: for each position from `calculateSeatPositions`, render a `Circle` with radius 6, positioned at the calculated (x,y) offset from the table centre. Each dot sits 12px outside the table edge (use the angle to calculate offset direction). Fill: #D1D5DB (light grey) in editor mode, statusColour (slightly darker shade) in live mode when occupied, light grey when that seat is empty.
> 4. Table label: centred text showing table name. Below it, smaller text showing capacity (e.g. '2-4'). In live mode when occupied, show guest name instead of capacity.
> 5. When `isSelected` in editor mode: show a blue border highlight and resize handles at corners.
> 6. Draggable in editor mode (snaps to grid), NOT draggable in live mode.
>
> **Test** by rendering a floor plan with several tables of different shapes and sizes (2-top circle, 4-top rectangle, 6-top rectangle, 8-top large rectangle). Verify seat dots are evenly distributed and positioned correctly."

### Prompt B: Table Snapping & Joining in Floor Plan Editor

> **Cursor Prompt:**
>
> "Implement the table snap-together joining system for the ReserveNI floor plan editor at `/dashboard/settings/floor-plan`. When a user drags one table close to another, they should visually snap together, joined sides should merge, and seats on the joined sides should disappear.
>
> **Add columns to `venue_tables`** (create a Supabase migration): `snap_group_id` (UUID, nullable — all tables in a snapped group share this ID) and `snap_sides` (JSONB, nullable — array of sides joined, e.g. `["right"]` or `["right", "bottom"]`).
>
> **Create a utility at `lib/floor-plan/snap-detection.ts`:**
>
> Export `detectSnap(draggedTable, allTables, snapThreshold = 20)`:
> 1. For each other table that is close enough (bounding box check first for performance), check if any edge of the dragged table aligns with an opposing edge of the other table.
> 2. Edge alignment means: the perpendicular distance between the two edges is less than `snapThreshold` pixels, AND the parallel overlap is at least 50% of the shorter edge.
> 3. Specifically check: dragged.right vs other.left, dragged.left vs other.right, dragged.bottom vs other.top, dragged.top vs other.bottom.
> 4. Return the best snap: `{ targetTable, draggedSide, targetSide, snapPosition }` where `snapPosition` is the exact x,y the dragged table should move to for perfect alignment. Or null if no snap.
>
> Export `applySnap(draggedTable, snapResult)`:
> 1. Adjust the dragged table's position so the edges touch exactly (zero gap).
> 2. Set `snap_group_id` on both tables to the same UUID (generate a new one, or use the existing group ID if the target is already in a group).
> 3. Set `snap_sides` on both tables (e.g. dragged gets `["right"]`, target gets `["left"]`).
> 4. Create or update the `table_combination` and `table_combination_members` records.
> 5. Calculate `combined_max_covers`: sum of all tables' max_covers in the group, minus 2 seats per join (the seats on each joined side — 1 from each table — are removed). So two 4-tops joined = 4+4-2 = 6 covers. Adjust this based on actual seat count per side, which depends on the table dimensions.
>
> Export `removeSnap(table)`:
> 1. Remove the table from its snap group.
> 2. Clear `snap_group_id` and `snap_sides`.
> 3. If the group now has only 1 table, remove the group entirely and clear that table's snap fields too.
> 4. Delete the `table_combination` and `table_combination_members` records.
> 5. Recalculate remaining combinations if the group still has 2+ tables.
>
> **In the floor plan editor component:**
>
> On `onDragMove` of any table:
> 1. Call `detectSnap` with the current drag position.
> 2. If a snap is detected, show a visual guide: highlight the target table's snap edge in blue (#3B82F6) with a dashed line. Also show a ghost outline of where the dragged table will land if dropped.
> 3. If the dragged table is currently in a snap group and is being dragged away (distance from snap position > snapThreshold * 2), show a visual "breaking" indicator (the connection line turns red).
>
> On `onDragEnd`:
> 1. If a snap was detected at the final position: call `applySnap`. The table moves to the snap position. Save to database.
> 2. If the table was in a group and has been dragged away: call `removeSnap`. The table is now independent. Save to database.
> 3. Otherwise: normal position save.
>
> **Rendering joined tables:**
>
> When tables share a `snap_group_id`, render them with:
> 1. A combined outline: draw a Konva `Line` (closed shape, stroke: #374151, strokeWidth: 2) that traces around the exterior perimeter of ALL tables in the group, skipping internal joined edges. Calculate this path by walking the exterior edges of the combined bounding shape.
> 2. The individual table borders on joined sides become invisible (set those border segments to transparent).
> 3. Seat dots on joined sides are hidden: pass the `hiddenSides` Set to each `TableShape` component based on its `snap_sides` value.
> 4. Show the combination name (e.g. 'Tables 1+2') as a small label above the combined group.
> 5. Show the combined cover count (e.g. '6 covers') below the label.
>
> **Moving joined groups:**
> When a user drags any table in a snap group, ALL tables in the group move together (they are a unit). Implement this by detecting the snap_group_id on drag start, finding all tables in the group, and applying the same delta (dx, dy) to all of them. Only the dragged table emits onDragMove/onDragEnd — the others follow.
>
> **Test scenarios:**
> 1. Drag a 4-top rectangle next to another 4-top rectangle horizontally → they snap, seats on joined sides disappear, combined outline appears, combo = 6 covers.
> 2. Drag a third 4-top to join the pair → three tables joined in a row, only exterior seats visible, combo = 8 covers.
> 3. Drag one table away from the joined pair → it separates, seats reappear, combo removed.
> 4. Drag a circle table next to a rectangle → should NOT snap (circles can't meaningfully join side-to-side — only rectangles/squares snap together).
> 5. Two tables snapped together → drag the group as one unit → both move together.
> 6. Verify database: `table_combinations`, `table_combination_members`, and venue_tables `snap_group_id` + `snap_sides` all update correctly on snap and unsnap."

### Prompt C: Timeline Grid — Combination Spanning Blocks

> **Cursor Prompt:**
>
> "Update the ReserveNI timeline grid at `/dashboard/table-grid` to properly display bookings that use table combinations. When a booking is assigned to multiple tables (a combination), the booking block must visually span all the relevant table rows so servers can see at a glance that it's a combo booking.
>
> **Ensure combined tables are adjacent in the grid:**
> When tables are in a combination (share a `snap_group_id`), their `sort_order` values should be consecutive. When a combination is created (tables snapped together), auto-adjust sort_order so the combined tables are adjacent. When a combination is removed, sort_order does not need to change.
>
> **Rendering spanning blocks:**
>
> In the grid booking rendering logic:
> 1. For each booking, check `booking_table_assignments` — if it has multiple assigned tables, it's a combination booking.
> 2. Find the row indices of all assigned tables in the grid (these should be consecutive thanks to sort_order adjacency).
> 3. Render a SINGLE booking block component whose height spans all assigned table rows. Specifically: `top = firstTableRow.y`, `height = rowHeight * numberOfTables`. The block covers the full vertical space of all the table rows it spans.
> 4. Use the standard booking block styling (colour by status, guest name, party size badge) but add:
>    - A combination tag inside the block showing the table names: 'Tables 3+4' in a small pill/badge (e.g. light background, smaller text, positioned at the bottom of the block).
>    - A small link icon (🔗) or a vertical bracket on the left edge of the block to visually reinforce the spanning.
> 5. Do NOT render separate blocks on each table row — there should be ONE block spanning multiple rows.
>
> **For the rare case of non-adjacent rows** (should not happen if sort_order is maintained, but handle defensively):
> - Render the primary block on the first assigned table's row at normal single-row height.
> - On each other assigned table's row, render a thin "reference block" at the same horizontal position: same colour at 30% opacity, showing '→ [TableName]' text. This signals to the server that this table is part of the combo without taking up visual space.
>
> **Drag-and-drop for combination bookings:**
>
> When dragging a booking FROM the unassigned sidebar onto the grid:
> 1. Check the booking's party size against available tables.
> 2. If the party size fits a single table: normal behaviour — highlight valid single tables green on hover.
> 3. If the party size requires a combination: as the user hovers over a table row that is part of a combination with sufficient capacity, highlight ALL rows of that combination in green simultaneously. Show a tooltip: 'Seat at Tables 3+4 (6 covers)'.
> 4. On drop onto any row of a valid combination: assign the booking to ALL tables in the combination. Render the spanning block.
>
> When dragging a booking that is ALREADY assigned to a combination:
> 1. The entire spanning block is the drag handle (user can grab anywhere on it).
> 2. During drag, show a ghost of the spanning block following the cursor.
> 3. Valid drop targets: other time positions on the SAME combination (horizontal move only), or other combinations with sufficient capacity, or single tables with sufficient capacity (which removes the combo assignment).
> 4. If dropped onto a different combination: remove old assignments, create new assignments for the new combination's tables.
>
> When dragging a booking that DOESN'T need a combination onto a table that IS in a combination:
> 1. Just assign it to the single table, not the whole combination. A party of 2 can sit at one table of a combined pair — they only occupy that one table. Render as a normal single-row block on that table's row.
>
> **Preventing conflicts on combined tables:**
> When checking time overlaps for a combination booking: the booking blocks ALL tables in the combination for the full duration. No other booking can be assigned to ANY of those tables during that time. The overlap check must run against all tables in the combination, not just the first one.
>
> **Summary bar update:**
> Add to the existing summary bar: 'Combos in use: X' — count of active bookings on table combinations.
>
> **Test scenarios:**
> 1. A booking for 6 people is assigned to Tables 3+4 (a combo) → the grid shows ONE block spanning both rows → block shows 'Tables 3+4' badge → servers can immediately see it's a combo.
> 2. A booking for 2 people sits at Table 3 (which is part of a combo) → shows as a normal single-row block on Table 3's row only → Table 4's row remains available.
> 3. Drag a 6-person booking from unassigned sidebar → hover over Table 3 → both Table 3 AND Table 4 rows highlight green → drop → spanning block appears.
> 4. Drag the 6-person spanning block to a different time → block moves horizontally → validates no overlap on BOTH tables at the new time.
> 5. Drag the 6-person spanning block onto a different combination (Tables 7+8) → reassigns → now spans Tables 7+8 rows instead.
> 6. While Tables 3+4 are booked as a combo for 19:00-20:30, try to assign another booking to Table 3 at 19:30 → rejected (overlap on a combo-locked table).
> 7. Three tables joined (1+2+3) with a 10-person booking → block spans all three rows → shows 'Tables 1+2+3' badge."

### Prompt D: Live Floor Plan — Combination Display

> **Cursor Prompt:**
>
> "Update the ReserveNI live floor plan at `/dashboard/floor-plan` to properly display table combinations during service.
>
> **Combined table rendering:**
> Tables that share a `snap_group_id` should render as a joined unit, exactly as in the editor view:
> 1. Draw the combined outline (single continuous border around the exterior of all tables in the group, no internal borders on joined sides).
> 2. Hide seat dots on joined sides.
> 3. Show exterior seat dots coloured by occupancy: if a combo booking has 6 guests at a 6-cover combination, all 6 visible exterior dots are coloured with the status colour. If a party of 5 is at a 6-cover combo, 5 dots are coloured and 1 remains grey.
>
> **Combined table status during service:**
> When a booking is assigned to a combination:
> - ALL tables in the combination share the same status. Setting 'Seated' on one table sets it on all tables in the combo.
> - The `table_statuses` rows for all tables in the combo are updated together.
> - The combined group shows as ONE interactive unit on the floor plan — tapping anywhere on the combined shape opens the booking detail for the combo booking.
> - Status progression (Next Status button) advances all tables in the combo simultaneously.
>
> When a combination is partially occupied (e.g. only Table 3 of combo Tables 3+4 has a booking):
> - Table 3 shows with its booking's status colour and details.
> - Table 4 shows as 'Available' with its own separate tap interaction.
> - The combined outline is still shown (the physical tables are still joined), but the booking block only shows on Table 3's section of the combined shape.
>
> **Combination label:**
> Above the combined group, show a small floating label: the combination name (e.g. 'Tables 3+4') and the combined capacity ('6 covers'). During service when occupied, also show the guest name and party size.
>
> **Progress ring for combos:**
> Show a single progress ring around the EXTERIOR of the combined shape (not individual rings per table). The ring represents time elapsed for the combo booking.
>
> **Test scenarios:**
> 1. Two joined tables, both empty → combined outline visible, all exterior seat dots grey, tap opens 'Seat Walk-in' with combined capacity.
> 2. Two joined tables, combo booking seated → all exterior dots green, tap shows booking details, 'Next Status' advances both tables.
> 3. Two joined tables, only one table has a booking → that table shows occupied, the other shows available, both still visually connected by the combined outline.
> 4. Three joined tables, combo booking → single combined shape, exterior dots only, one progress ring, one tap target."

---

## Part 5: Common Pitfalls to Avoid

These are the mistakes that typically cause this feature to fail in Cursor. The prompts above are written to avoid them, but listing them explicitly as guardrails:

1. **Don't use absolute pixel positions for seat dots.** Seats must be calculated relative to the table shape and recalculated whenever the table is resized or the canvas is zoomed. Use the utility function, not hardcoded offsets.

2. **Don't check for snapping on every pixel of movement.** Use `onDragMove` with a throttle (e.g. every 50ms or every 5px of movement) to avoid performance issues. Only run the full snap detection algorithm when the throttled check suggests a candidate is nearby (bounding box pre-check).

3. **Don't store seat positions in the database.** Seats are purely visual, calculated on-the-fly from `max_covers`, `shape`, `width`, `height`, and `snap_sides`. The database stores table geometry and snap relationships; the rendering layer calculates everything else.

4. **Don't try to join circular tables.** Only rectangular and square tables can snap together. Circles don't have flat edges to join. When a circular table is dragged near another table, no snap indicator should appear.

5. **Don't render the combined outline as a separate Konva layer.** It should be in the same `Group` as the tables themselves, so it moves with the group and scales with zoom. Render it as a `Line` shape with `closed: true` in the same group.

6. **Don't use React state for drag position during active drags.** This causes re-renders on every frame and makes dragging laggy. Use Konva's internal drag handling (the node's position updates via Konva, not React state) and only sync to React state on `onDragEnd`. For the snap preview during drag, use a separate Konva shape that updates via `ref` direct manipulation, not state.

7. **Don't forget that the grid row height must account for spanning blocks.** If a booking spans 2 rows, the block height is `2 * rowHeight`. If your grid uses CSS Grid or flexbox with fixed row heights, the spanning block must be positioned absolutely overlaying the rows, not contained within a single row div. Use `position: absolute` with calculated `top` and `height`.

8. **Don't recalculate the entire grid when one booking changes.** Memoize grid cell rendering. When a Realtime update arrives for a single booking, only re-render the affected cells (the table rows involved). Use React.memo with a custom comparison on the booking blocks.
