import { newId } from './ids.js';
import type { Anchor, Element, Id, TikzShape } from './types.js';

/**
 * Duplicating an element, with every id inside it made new.
 *
 * Copy and paste, and "duplicate", all come through here. It is in `core` and tested
 * because the hard part is not the copy, it is the INTERNAL REFERENCES: a diagram's
 * arrows name the shapes they are attached to, so a clone that reuses an id leaves the
 * pasted arrows pointing at the ORIGINAL shapes. They then follow the original when it
 * moves, and deleting the original emits `\draw (bpX.east)` for a node that no longer
 * exists — which does not degrade, it aborts the whole compile.
 *
 * The same class of bug as a chart's column indices: nothing crashes at the time, the
 * document is simply wrong afterwards.
 *
 * Resource ids are deliberately NOT remapped. They are IndexedDB keys for the image
 * bytes, and two elements sharing one picture is exactly right — a copied image must
 * not need a second copy of the file.
 */

/** Deep-clone an element, giving every id in it a fresh value. */
export function cloneElement(el: Element, makeId: () => Id = newId): Element {
  switch (el.kind) {
    case 'list':
      return {
        ...el,
        id: makeId(),
        items: el.items.map(function copyItem(item): typeof item {
          return {
            ...item,
            id: makeId(),
            ...(item.sublist !== undefined
              ? { sublist: cloneElement(item.sublist, makeId) as typeof item.sublist }
              : {}),
          };
        }),
      };

    case 'table':
      return {
        ...el,
        id: makeId(),
        columns: el.columns.map((c) => ({ ...c, id: makeId() })),
        rows: el.rows.map((r) => ({
          ...r,
          id: makeId(),
          cells: r.cells.map((c) => ({ ...c, id: makeId() })),
        })),
      };

    case 'block':
      return { ...el, id: makeId(), children: el.children.map((c) => cloneElement(c, makeId)) };

    case 'columns':
      return {
        ...el,
        id: makeId(),
        columns: el.columns.map((col) => ({
          ...col,
          id: makeId(),
          children: col.children.map((c) => cloneElement(c, makeId)),
        })),
      };

    case 'tikz':
      return { ...el, id: makeId(), ...(el.shapes === undefined ? {} : { shapes: cloneShapes(el.shapes, makeId) }) };

    case 'chart':
      return {
        ...el,
        id: makeId(),
        series: el.series.map((s) => ({ ...s })),
        data: { ...el.data, rows: el.data.rows.map((r) => [...r]) },
      };

    default:
      return { ...el, id: makeId() };
  }
}

/**
 * Clone a shape list, rewriting every arrow endpoint onto the NEW shapes.
 *
 * Two passes, because an arrow can be declared before the shape it points at.
 */
function cloneShapes(shapes: readonly TikzShape[], makeId: () => Id): TikzShape[] {
  const idMap = new Map<Id, Id>();
  for (const s of shapes) idMap.set(s.id, makeId());

  const rebind = (a: Anchor): Anchor =>
    a.kind === 'shape' && idMap.has(a.shapeId)
      ? { ...a, shapeId: idMap.get(a.shapeId)! }
      : a;

  return shapes.map((s): TikzShape => {
    const id = idMap.get(s.id)!;
    if (s.t === 'arrow') return { ...s, id, from: rebind(s.from), to: rebind(s.to) };
    if (s.t === 'path') return { ...s, id, points: s.points.map((p) => [...p] as [number, number]) };
    return { ...s, id };
  });
}

/**
 * Offset a pasted copy so it does not land exactly on the original.
 *
 * A copy that is invisible because it is perfectly on top of what it was copied from
 * reads as "paste did nothing". A flow element has no coordinates to nudge, so it is
 * simply appended after its siblings, which is visible on its own.
 */
export function offsetElement(el: Element, dxMm: number, dyMm: number): Element {
  if (el.placement.mode !== 'absolute') return el;
  return {
    ...el,
    placement: {
      ...el.placement,
      x: Math.round((el.placement.x + dxMm) * 10) / 10,
      y: Math.round((el.placement.y + dyMm) * 10) / 10,
    },
  };
}
