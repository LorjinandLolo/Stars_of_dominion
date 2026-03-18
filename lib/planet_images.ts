// lib/planet_images.ts
// Add images for planets here.
// Format: "Planet Name": "/path/to/image.png"
// Images should be placed in the 'public' folder.

export const PLANET_IMAGES: Record<string, string> = {
    "Prime": "/planets/prime.png",
    "Reach": "/planets/reach.png",
    // Add more here...
};

// Default images for types if specific name not found
export const TYPE_IMAGES: Record<string, string> = {
    "blackHole": "/planets/black_hole_default.png",
    "gasGiant": "/planets/gas_giant_default.png",
    "terrestrial": "/planets/terrestrial_default.png",
};
