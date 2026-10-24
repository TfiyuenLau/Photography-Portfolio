import { z } from 'zod';

export const types = {
  LOCATION: 'location',
  CUSTOM: 'custom'
} as const;

export const HexSchema = z.string().regex(/^#([A-Fa-f0-9]{6})$/);
export type Hex = z.infer<typeof HexSchema>;

export const AlbumTitleSchema = z.string().brand<'AlbumTitle'>();
export type AlbumTitle = z.infer<typeof AlbumTitleSchema>;

export const AlbumLocationSchema = z.object({
  description: z.string().optional(),
  date: z.string().optional(),
  lat: z.number(),
  lng: z.number()
});
export type AlbumLocation = z.infer<typeof AlbumLocationSchema>;

export const AlbumSchema = z.object({
  title: AlbumTitleSchema,
  slug: z.string().optional(),
  province: z.string().optional(),
  description: z.string().nullable(),
  date: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  locations: z.array(AlbumLocationSchema),
  tags: z.array(z.string()).optional(),
  color: HexSchema,
  order: z.number(),
  type: z.enum(['location', 'custom'])
});
export type Album = z.infer<typeof AlbumSchema>;

const AlbumListSchema = z.array(AlbumSchema);
export type AlbumList = z.infer<typeof AlbumListSchema>;
