// lib/tactical/render3d/view.ts
// The battle camera's one shared number, kept free of three.js so the 2D view
// can import it without pulling WebGL into the main bundle.
//
// The battle is seen from a tilted orthographic camera. An orthographic view of
// a plane is an affine map, so the ground plane (z = 0) lands on screen as
//   screenX = ox + scale * x
//   screenY = oy + scale * VIEW_TILT * y
// which the 2D overlay canvas reproduces exactly with ctx.setTransform. Rings,
// arcs and bars drawn on the overlay therefore sit on the same ground the hulls
// float over, while hull height shows up as screen-up offset (scale * sin(pitch)
// per unit), which is the 2.5D look.

/** Camera pitch away from straight-down, in radians. 0 = flat top-down. */
export const VIEW_PITCH = (36 * Math.PI) / 180;

/** Vertical foreshortening of the ground plane on screen. */
export const VIEW_TILT = Math.cos(VIEW_PITCH);

export interface ViewLike {
    scale: number;
    ox: number;
    oy: number;
    cw: number;
    ch: number;
    /** Ground-plane vertical squash; VIEW_TILT for the battle, 1 = top-down. */
    tilt: number;
}
