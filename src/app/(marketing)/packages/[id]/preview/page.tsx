import { notFound, redirect } from 'next/navigation';
import { getPublicPackageDetail } from '@/features/packages/queries/package.queries';
import { generatePackageSlug } from '@/features/packages/utils/slug';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function PackagePreviewRedirect({ params }: PreviewPageProps) {
  const { id } = await params;
  const pkg = await getPublicPackageDetail(id, 'en');

  if (!pkg) {
    notFound();
  }

  const slug = generatePackageSlug(pkg.title);
  redirect(`/packages/${id}/${slug}`);
}
