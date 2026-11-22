---
name: curate-portfolio-photos
description: >-
  Batch-curate photography portfolio photos into Folders (Street, Architecture, Cosplay)
  and synchronize tags in src/data/portfolio-data.json using Sharp contact sheets and
  multimodal visual inspection. Use when importing uncategorized photos, auditing or
  splitting existing Folders, or creating a new thematic Folder category.
---

# Curate Portfolio Photos (Visual Batch Workflow)

Use this skill when classifying dozens or hundreds of portfolio images without bloating
context or misclassifying non-street photos into `Street`.

## Strict Classification Criteria

- **Street (人文街拍)**: Must feature genuine human presence, candid daily life, street
  interactions, vendors, cyclists, or pedestrians in public spaces. Exclude architecture-only
  shots, empty highways, museum artworks, food, pets, plants, and still life.
- **Architecture (建筑摄影)**: Urban skylines, skyscrapers, classical pavilions/temples,
  bridges, campuses, interior architectural halls, and structural/geometric facades.
- **Cosplay**: Anime expo & coser portrait photography.
- **Album-Only (No Folder)**: Food, flowers, pets, artwork/exhibits, still life — keep in
  `albumPhotos[city]`, omit from thematic `Folders`.

## Steps

1. **Generate 3x4 Labeled Contact Sheets (12 photos/sheet)**
   - Write a temporary script using `sharp` to resize candidate photos (`fit: 'inside'`) onto
     a dark canvas (`3 x 4` grid) with an SVG banner stamping `#<index> <photo.id>` under
     each thumbnail, and save `.webp` sheets to the conversation `scratch/` directory (never
     commit contact sheets into the repo).
2. **Visual Inspection via `read_file`**
   - Read each contact sheet with `read_file` and record exact `photo.id` assignments for
     `Street`, `Architecture`, or `Album-Only` directly from the stamped labels.
3. **Update `src/data/portfolio-data.json` Deterministically**
   - Treat `albumPhotos` as the master list; preserve all city album photos intact.
   - Synchronize `photo.tags` (add/remove `'Street'`, `'Architecture'`, etc.).
   - Rebuild `folderPhotos[folderTitle]` from matched master photos and sort strictly
     descending by `exif.dateTaken` (fallback `date`).
   - Ensure `folders` metadata (`title`, `slug`, `description`, `order`) is contiguous.
4. **Verify & Clean Up**
   - Delete temporary contact-sheet generator scripts/manifests from `scripts/`.
   - Run `pnpm check`, `pnpm lint`, and `pnpm build`, confirming all `/folders/<slug>` SSG
     routes compile with expected photo counts.
