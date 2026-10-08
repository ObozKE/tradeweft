import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { generatePackageSlug } from '@/features/packages/utils/slug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://tradeweft.com';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  try {
    const supabase = await createClient();
    const { data: packages } = await supabase
      .from('service_packages')
      .select('id, title, updated_at')
      .eq('status', 'published')
      .limit(1000);

    const packageRoutes: MetadataRoute.Sitemap = (packages || []).map((pkg) => {
      const slug = generatePackageSlug(pkg.title);
      return {
        url: `${baseUrl}/packages/${pkg.id}/${slug}`,
        lastModified: new Date(pkg.updated_at),
        changeFrequency: 'weekly',
        priority: 0.8,
      };
    });

    return [...staticRoutes, ...packageRoutes];
  } catch {
    return staticRoutes;
  }
}
