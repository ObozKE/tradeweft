export interface CategoryDefinition {
  id: string;
  parentId: string | null;
  slug: string;
  sortOrder: number;
  names: {
    en: string;
    sw: string;
  };
}

export interface CategoryItem {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  sortOrder: number;
}

export const CANONICAL_CATEGORIES: CategoryDefinition[] = [
  // 1. Web & Software
  {
    id: '10000000-0000-0000-0000-000000000001',
    parentId: null,
    slug: 'web-software',
    sortOrder: 10,
    names: { en: 'Web & Software', sw: 'Tovuti na Programu' },
  },
  {
    id: '20000000-0000-0000-0000-000000000001',
    parentId: '10000000-0000-0000-0000-000000000001',
    slug: 'frontend-dev',
    sortOrder: 11,
    names: { en: 'Frontend Development', sw: 'Maendeleo ya Frontend' },
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    parentId: '10000000-0000-0000-0000-000000000001',
    slug: 'backend-apis',
    sortOrder: 12,
    names: { en: 'Backend & APIs', sw: 'Maendeleo ya Backend na API' },
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    parentId: '10000000-0000-0000-0000-000000000001',
    slug: 'mobile-apps',
    sortOrder: 13,
    names: { en: 'Mobile App Development', sw: 'Maendeleo ya Programu za Simu' },
  },
  {
    id: '20000000-0000-0000-0000-000000000004',
    parentId: '10000000-0000-0000-0000-000000000001',
    slug: 'ui-ux-design',
    sortOrder: 14,
    names: { en: 'UI/UX Design', sw: 'Ubunifu wa UI na UX' },
  },

  // 2. Design & Branding
  {
    id: '10000000-0000-0000-0000-000000000002',
    parentId: null,
    slug: 'design-branding',
    sortOrder: 20,
    names: { en: 'Design & Branding', sw: 'Ubunifu na Chapa' },
  },
  {
    id: '20000000-0000-0000-0000-000000000005',
    parentId: '10000000-0000-0000-0000-000000000002',
    slug: 'logo-brand-identity',
    sortOrder: 21,
    names: { en: 'Logo & Brand Identity', sw: 'Nembo na Utambulisho wa Chapa' },
  },
  {
    id: '20000000-0000-0000-0000-000000000006',
    parentId: '10000000-0000-0000-0000-000000000002',
    slug: 'print-packaging',
    sortOrder: 22,
    names: { en: 'Print & Packaging', sw: 'Uchapishaji na Ufungashaji' },
  },

  // 3. Marketing & Social Media
  {
    id: '10000000-0000-0000-0000-000000000003',
    parentId: null,
    slug: 'marketing-social-media',
    sortOrder: 30,
    names: { en: 'Marketing & Social Media', sw: 'Uuzaji na Mitandao ya Kijamii' },
  },
  {
    id: '20000000-0000-0000-0000-000000000007',
    parentId: '10000000-0000-0000-0000-000000000003',
    slug: 'social-media-management',
    sortOrder: 31,
    names: { en: 'Social Media Management', sw: 'Usimamizi wa Mitandao' },
  },
  {
    id: '20000000-0000-0000-0000-000000000008',
    parentId: '10000000-0000-0000-0000-000000000003',
    slug: 'seo-search-marketing',
    sortOrder: 32,
    names: { en: 'SEO & Search Marketing', sw: 'Uboreshaji wa Injini za Utafutaji' },
  },

  // 4. Writing & Content
  {
    id: '10000000-0000-0000-0000-000000000004',
    parentId: null,
    slug: 'writing-content',
    sortOrder: 40,
    names: { en: 'Writing & Content', sw: 'Uandishi na Maudhui' },
  },
  {
    id: '20000000-0000-0000-0000-000000000009',
    parentId: '10000000-0000-0000-0000-000000000004',
    slug: 'copywriting-sales',
    sortOrder: 41,
    names: { en: 'Copywriting & Sales Pages', sw: 'Uandishi wa Mauzo' },
  },
  {
    id: '20000000-0000-0000-0000-000000000010',
    parentId: '10000000-0000-0000-0000-000000000004',
    slug: 'translation-localization',
    sortOrder: 42,
    names: { en: 'Translation & Localization', sw: 'Tafsiri na Ujanibishaji' },
  },

  // 5. Photo & Video
  {
    id: '10000000-0000-0000-0000-000000000005',
    parentId: null,
    slug: 'photo-video',
    sortOrder: 50,
    names: { en: 'Photo & Video', sw: 'Upigaji Picha na Video' },
  },
  {
    id: '20000000-0000-0000-0000-000000000011',
    parentId: '10000000-0000-0000-0000-000000000005',
    slug: 'commercial-photography',
    sortOrder: 51,
    names: { en: 'Commercial Photography', sw: 'Picha za Kibiashara' },
  },
  {
    id: '20000000-0000-0000-0000-000000000012',
    parentId: '10000000-0000-0000-0000-000000000005',
    slug: 'video-production-editing',
    sortOrder: 52,
    names: { en: 'Video Production & Editing', sw: 'Utengenezaji wa Video' },
  },

  // 6. Accounting & Finance
  {
    id: '10000000-0000-0000-0000-000000000006',
    parentId: null,
    slug: 'accounting-finance',
    sortOrder: 60,
    names: { en: 'Accounting & Finance', sw: 'Uhasibu na Fedha' },
  },
  {
    id: '20000000-0000-0000-0000-000000000013',
    parentId: '10000000-0000-0000-0000-000000000006',
    slug: 'bookkeeping-statements',
    sortOrder: 61,
    names: { en: 'Bookkeeping & Statements', sw: 'Utunzaji wa Hesabu' },
  },
  {
    id: '20000000-0000-0000-0000-000000000014',
    parentId: '10000000-0000-0000-0000-000000000006',
    slug: 'tax-advisory-filing',
    sortOrder: 62,
    names: { en: 'Tax Advisory & KRA Filing', sw: 'Ushauri wa Kodi na KRA' },
  },

  // 7. Legal Services
  {
    id: '10000000-0000-0000-0000-000000000007',
    parentId: null,
    slug: 'legal-services',
    sortOrder: 70,
    names: { en: 'Legal Services', sw: 'Huduma za Kisheria' },
  },
  {
    id: '20000000-0000-0000-0000-000000000015',
    parentId: '10000000-0000-0000-0000-000000000007',
    slug: 'contract-drafting-review',
    sortOrder: 71,
    names: { en: 'Contract Drafting & Review', sw: 'Uandishi wa Mikataba' },
  },
  {
    id: '20000000-0000-0000-0000-000000000016',
    parentId: '10000000-0000-0000-0000-000000000007',
    slug: 'business-compliance',
    sortOrder: 72,
    names: { en: 'Business Registration & Compliance', sw: 'Usajili na Uzingatiaji wa Sheria' },
  },

  // 8. Health & Therapy
  {
    id: '10000000-0000-0000-0000-000000000008',
    parentId: null,
    slug: 'health-therapy',
    sortOrder: 80,
    names: { en: 'Health & Therapy', sw: 'Afya na Tiba' },
  },
  {
    id: '20000000-0000-0000-0000-000000000017',
    parentId: '10000000-0000-0000-0000-000000000008',
    slug: 'physical-therapy',
    sortOrder: 81,
    names: { en: 'Physical Therapy & Rehab', sw: 'Tiba ya Viungo' },
  },

  // 9. Beauty & Grooming
  {
    id: '10000000-0000-0000-0000-000000000009',
    parentId: null,
    slug: 'beauty-grooming',
    sortOrder: 90,
    names: { en: 'Beauty & Grooming', sw: 'Urembo na Utunzaji' },
  },
  {
    id: '20000000-0000-0000-0000-000000000018',
    parentId: '10000000-0000-0000-0000-000000000009',
    slug: 'hair-styling-barbering',
    sortOrder: 91,
    names: { en: 'Hair Styling & Barbering', sw: 'Unyozi na Ususi' },
  },

  // 10. Fitness & Training
  {
    id: '10000000-0000-0000-0000-000000000010',
    parentId: null,
    slug: 'fitness-training',
    sortOrder: 100,
    names: { en: 'Fitness & Training', sw: 'Mazoezi na Mafunzo ya Mwili' },
  },
  {
    id: '20000000-0000-0000-0000-000000000019',
    parentId: '10000000-0000-0000-0000-000000000010',
    slug: 'personal-fitness-training',
    sortOrder: 101,
    names: { en: 'Personal Training', sw: 'Mkufunzi Binafsi' },
  },

  // 11. Food & Catering
  {
    id: '10000000-0000-0000-0000-000000000011',
    parentId: null,
    slug: 'food-catering',
    sortOrder: 110,
    names: { en: 'Food & Catering', sw: 'Chakula na Upishi' },
  },
  {
    id: '20000000-0000-0000-0000-000000000020',
    parentId: '10000000-0000-0000-0000-000000000011',
    slug: 'corporate-catering',
    sortOrder: 111,
    names: { en: 'Corporate Catering', sw: 'Upishi wa Mashirika' },
  },

  // 12. Education & Tutoring
  {
    id: '10000000-0000-0000-0000-000000000012',
    parentId: null,
    slug: 'education-tutoring',
    sortOrder: 120,
    names: { en: 'Education & Tutoring', sw: 'Elimu na Mafunzo' },
  },
  {
    id: '20000000-0000-0000-0000-000000000021',
    parentId: '10000000-0000-0000-0000-000000000012',
    slug: 'business-coaching',
    sortOrder: 121,
    names: { en: 'Business Coaching', sw: 'Ushauri wa Biashara' },
  },

  // 13. Admin & Virtual Assistance
  {
    id: '10000000-0000-0000-0000-000000000013',
    parentId: null,
    slug: 'admin-virtual-assistance',
    sortOrder: 130,
    names: { en: 'Admin & Virtual Assistance', sw: 'Utawala na Usaidizi wa Mtandaoni' },
  },
  {
    id: '20000000-0000-0000-0000-000000000022',
    parentId: '10000000-0000-0000-0000-000000000013',
    slug: 'virtual-assistant',
    sortOrder: 131,
    names: { en: 'Virtual Assistant', sw: 'Msaidizi wa Mtandaoni' },
  },

  // 14. Repairs & Maintenance
  {
    id: '10000000-0000-0000-0000-000000000014',
    parentId: null,
    slug: 'repairs-maintenance',
    sortOrder: 140,
    names: { en: 'Repairs & Maintenance', sw: 'Matengenezo na Ukarabati' },
  },
  {
    id: '20000000-0000-0000-0000-000000000023',
    parentId: '10000000-0000-0000-0000-000000000014',
    slug: 'office-it-repairs',
    sortOrder: 141,
    names: { en: 'Office IT & Equipment Repair', sw: 'Matengenezo ya TEHAMA' },
  },
];

/**
 * Returns localized category items sorted hierarchically.
 */
export function getFallbackCategories(locale: string = 'en'): CategoryItem[] {
  const loc = locale === 'sw' ? 'sw' : 'en';

  // Group top-level categories and their children
  const topLevel = CANONICAL_CATEGORIES.filter((c) => c.parentId === null).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const result: CategoryItem[] = [];

  for (const parent of topLevel) {
    result.push({
      id: parent.id,
      parentId: parent.parentId,
      slug: parent.slug,
      name: parent.names[loc] || parent.names.en,
      sortOrder: parent.sortOrder,
    });

    const children = CANONICAL_CATEGORIES.filter((c) => c.parentId === parent.id).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    for (const child of children) {
      result.push({
        id: child.id,
        parentId: child.parentId,
        slug: child.slug,
        name: child.names[loc] || child.names.en,
        sortOrder: child.sortOrder,
      });
    }
  }

  return result;
}

export const FALLBACK_CATEGORIES: CategoryItem[] = getFallbackCategories('en');
