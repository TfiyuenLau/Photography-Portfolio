import { z } from 'zod';
import { AlbumSchema, FolderSchema } from '.';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type SuccessResponse = {
  success: boolean;
};

export type ErrorResponse = {
  success: false;
  message: string;
  error?: z.ZodError | string;
};

export type Config = {
  method?: Method;
  timeout?: number;
  preview?: boolean;
  headers?: Record<string, string>;
} & globalThis.RequestInit;

export const PhotoExifSchema = z.object({
  camera: z.string().optional(),
  lens: z.string().optional(),
  focalLength: z.string().optional(),
  aperture: z.string().optional(),
  shutterSpeed: z.string().optional(),
  iso: z.union([z.string(), z.number()]).optional(),
  dateTaken: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});
export type PhotoExif = z.infer<typeof PhotoExifSchema>;

export const PhotoSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  exif: PhotoExifSchema.optional(),
  size: z.number(),
  url: z.string(),
  width: z.number(),
  height: z.number()
});

export type Photo = z.infer<typeof PhotoSchema>;

export const AlbumResponseSchema = z.object({
  data: z.object({
    photoGalleryCollection: z.object({
      items: z.array(AlbumSchema)
    })
  })
});

export const AlbumPhotosResponseSchema = z.object({
  data: z.object({
    photoGalleryCollection: z.object({
      items: z.array(
        AlbumSchema.extend({
          photosCollection: z.object({
            items: z.array(PhotoSchema)
          })
        })
      )
    })
  })
});

export const AssetsResponseSchema = z.object({
  data: z.object({
    assetCollection: z.object({
      items: z.array(PhotoSchema)
    })
  })
});

export const FolderResponseSchema = z.object({
  data: z.object({
    photoFoldersCollection: z.object({
      items: z.array(FolderSchema)
    })
  })
});

export const FolderPhotosResponseSchema = z.object({
  data: z.object({
    photoFoldersCollection: z.object({
      items: z.array(
        FolderSchema.extend({
          photosCollection: z.object({
            items: z.array(PhotoSchema)
          })
        })
      )
    })
  })
});
