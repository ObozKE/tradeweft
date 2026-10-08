-- Migration 20261008000001: Service Categories Taxonomy and Multilingual Translations
-- Phase 2: Hierarchical category tree with English and Swahili translations

create table if not exists public.service_categories (
    id uuid primary key default gen_random_uuid(),
    parent_id uuid references public.service_categories(id) on delete cascade,
    slug text not null unique,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.service_category_translations (
    category_id uuid not null references public.service_categories(id) on delete cascade,
    locale text not null,
    name text not null,
    primary key (category_id, locale)
);

create index if not exists idx_service_categories_parent 
    on public.service_categories (parent_id, sort_order);

create index if not exists idx_service_categories_slug 
    on public.service_categories (slug);

create index if not exists idx_category_translations_lookup 
    on public.service_category_translations (locale, category_id);

comment on table public.service_categories is 'Hierarchical taxonomy for service package listings and matchmaking.';
comment on table public.service_category_translations is 'Multilingual translations for category names (en, sw, fr, etc.).';

-- Seed Taxonomy Data with deterministic UUIDs
do $$
declare
    v_cat_id uuid;
    v_sub_id uuid;
begin
    -- 1. Web & Software
    insert into public.service_categories (id, slug, sort_order, is_active)
    values ('10000000-0000-0000-0000-000000000001', 'web-software', 10, true)
    on conflict (slug) do update set sort_order = excluded.sort_order
    returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'web-software'; end if;

    insert into public.service_category_translations (category_id, locale, name) values
        (v_cat_id, 'en', 'Web & Software'),
        (v_cat_id, 'sw', 'Tovuti na Programu')
    on conflict (category_id, locale) do update set name = excluded.name;

    -- Subcategories for Web & Software
    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000001', v_cat_id, 'frontend-dev', 11, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'frontend-dev'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Frontend Development'), (v_sub_id, 'sw', 'Maendeleo ya Frontend') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000002', v_cat_id, 'backend-apis', 12, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'backend-apis'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Backend & APIs'), (v_sub_id, 'sw', 'Maendeleo ya Backend na API') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000003', v_cat_id, 'mobile-apps', 13, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'mobile-apps'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Mobile App Development'), (v_sub_id, 'sw', 'Maendeleo ya Programu za Simu') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active)
    values ('20000000-0000-0000-0000-000000000004', v_cat_id, 'ui-ux-design', 14, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'ui-ux-design'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'UI/UX Design'), (v_sub_id, 'sw', 'Ubunifu wa UI na UX') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 2. Design & Branding
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000002', 'design-branding', 20, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'design-branding'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Design & Branding'), (v_cat_id, 'sw', 'Ubunifu na Chapa') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000005', v_cat_id, 'logo-brand-identity', 21, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'logo-brand-identity'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Logo & Brand Identity'), (v_sub_id, 'sw', 'Nembo na Utambulisho wa Chapa') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000006', v_cat_id, 'print-packaging', 22, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'print-packaging'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Print & Packaging'), (v_sub_id, 'sw', 'Uchapishaji na Ufungashaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 3. Marketing & Social Media
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000003', 'marketing-social-media', 30, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'marketing-social-media'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Marketing & Social Media'), (v_cat_id, 'sw', 'Uuzaji na Mitandao ya Kijamii') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000007', v_cat_id, 'social-media-management', 31, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'social-media-management'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Social Media Management'), (v_sub_id, 'sw', 'Usimamizi wa Mitandao') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000008', v_cat_id, 'seo-search-marketing', 32, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'seo-search-marketing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'SEO & Search Marketing'), (v_sub_id, 'sw', 'Uboreshaji wa Injini za Utafutaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 4. Writing & Content
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000004', 'writing-content', 40, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'writing-content'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Writing & Content'), (v_cat_id, 'sw', 'Uandishi na Maudhui') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000009', v_cat_id, 'copywriting-sales', 41, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'copywriting-sales'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Copywriting & Sales Pages'), (v_sub_id, 'sw', 'Uandishi wa Mauzo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000010', v_cat_id, 'translation-localization', 42, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'translation-localization'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Translation & Localization'), (v_sub_id, 'sw', 'Tafsiri na Ujanibishaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 5. Photo & Video
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000005', 'photo-video', 50, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'photo-video'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Photo & Video'), (v_cat_id, 'sw', 'Upigaji Picha na Video') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000011', v_cat_id, 'commercial-photography', 51, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'commercial-photography'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Commercial Photography'), (v_sub_id, 'sw', 'Picha za Kibiashara') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000012', v_cat_id, 'video-production-editing', 52, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'video-production-editing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Video Production & Editing'), (v_sub_id, 'sw', 'Utengenezaji wa Video') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 6. Accounting & Finance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000006', 'accounting-finance', 60, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'accounting-finance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Accounting & Finance'), (v_cat_id, 'sw', 'Uhasibu na Fedha') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000013', v_cat_id, 'bookkeeping-statements', 61, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'bookkeeping-statements'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Bookkeeping & Statements'), (v_sub_id, 'sw', 'Utunzaji wa Hesabu') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000014', v_cat_id, 'tax-advisory-filing', 62, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'tax-advisory-filing'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Tax Advisory & KRA Filing'), (v_sub_id, 'sw', 'Ushauri wa Kodi na KRA') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 7. Legal Services
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000007', 'legal-services', 70, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'legal-services'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Legal Services'), (v_cat_id, 'sw', 'Huduma za Kisheria') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000015', v_cat_id, 'contract-drafting-review', 71, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'contract-drafting-review'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Contract Drafting & Review'), (v_sub_id, 'sw', 'Uandishi wa Mikataba') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000016', v_cat_id, 'business-compliance', 72, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'business-compliance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Business Registration & Compliance'), (v_sub_id, 'sw', 'Usajili na Uzingatiaji wa Sheria') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 8. Health & Therapy
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000008', 'health-therapy', 80, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'health-therapy'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Health & Therapy'), (v_cat_id, 'sw', 'Afya na Tiba') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000017', v_cat_id, 'physical-therapy', 81, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'physical-therapy'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Physical Therapy & Rehab'), (v_sub_id, 'sw', 'Tiba ya Viungo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 9. Beauty & Grooming
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000009', 'beauty-grooming', 90, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'beauty-grooming'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Beauty & Grooming'), (v_cat_id, 'sw', 'Urembo na Utunzaji') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000018', v_cat_id, 'hair-styling-barbering', 91, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'hair-styling-barbering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Hair Styling & Barbering'), (v_sub_id, 'sw', 'Unyozi na Ususi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 10. Fitness & Training
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000010', 'fitness-training', 100, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'fitness-training'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Fitness & Training'), (v_cat_id, 'sw', 'Mazoezi na Mafunzo ya Mwili') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000019', v_cat_id, 'personal-fitness-training', 101, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'personal-fitness-training'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Personal Training'), (v_sub_id, 'sw', 'Mkufunzi Binafsi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 11. Food & Catering
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000011', 'food-catering', 110, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'food-catering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Food & Catering'), (v_cat_id, 'sw', 'Chakula na Upishi') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000020', v_cat_id, 'corporate-catering', 111, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'corporate-catering'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Corporate Catering'), (v_sub_id, 'sw', 'Upishi wa Mashirika') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 12. Education & Tutoring
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000012', 'education-tutoring', 120, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'education-tutoring'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Education & Tutoring'), (v_cat_id, 'sw', 'Elimu na Mafunzo') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000021', v_cat_id, 'business-coaching', 121, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'business-coaching'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Business Coaching'), (v_sub_id, 'sw', 'Ushauri wa Biashara') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 13. Admin & Virtual Assistance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000013', 'admin-virtual-assistance', 130, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'admin-virtual-assistance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Admin & Virtual Assistance'), (v_cat_id, 'sw', 'Utawala na Usaidizi wa Mtandaoni') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000022', v_cat_id, 'virtual-assistant', 131, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'virtual-assistant'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Virtual Assistant'), (v_sub_id, 'sw', 'Msaidizi wa Mtandaoni') 
    on conflict (category_id, locale) do update set name = excluded.name;

    -- 14. Repairs & Maintenance
    insert into public.service_categories (id, slug, sort_order, is_active) 
    values ('10000000-0000-0000-0000-000000000014', 'repairs-maintenance', 140, true)
    on conflict (slug) do update set sort_order = excluded.sort_order returning id into v_cat_id;
    if v_cat_id is null then select id into v_cat_id from public.service_categories where slug = 'repairs-maintenance'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_cat_id, 'en', 'Repairs & Maintenance'), (v_cat_id, 'sw', 'Matengenezo na Ukarabati') 
    on conflict (category_id, locale) do update set name = excluded.name;

    insert into public.service_categories (id, parent_id, slug, sort_order, is_active) 
    values ('20000000-0000-0000-0000-000000000023', v_cat_id, 'office-it-repairs', 141, true) 
    on conflict (slug) do update set parent_id = excluded.parent_id returning id into v_sub_id;
    if v_sub_id is null then select id into v_sub_id from public.service_categories where slug = 'office-it-repairs'; end if;
    insert into public.service_category_translations (category_id, locale, name) values 
        (v_sub_id, 'en', 'Office IT & Equipment Repair'), (v_sub_id, 'sw', 'Matengenezo ya TEHAMA') 
    on conflict (category_id, locale) do update set name = excluded.name;

end $$;
