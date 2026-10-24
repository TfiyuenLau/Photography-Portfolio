import { z } from 'zod';

export const SocialLinkSchema = z.object({
  label: z.string(),
  url: z.string()
});

export const SiteConfigSchema = z.object({
  photographerName: z.string(),
  siteTitle: z.string(),
  subtitle: z.string(),
  bioParagraph1: z.string(),
  bioParagraph2: z.string(),
  copyrightName: z.string().optional(),
  mapCenter: z
    .object({
      lat: z.number(),
      lng: z.number()
    })
    .optional(),
  socials: z.array(SocialLinkSchema),
  links: z.array(SocialLinkSchema)
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SocialLink = z.infer<typeof SocialLinkSchema>;
