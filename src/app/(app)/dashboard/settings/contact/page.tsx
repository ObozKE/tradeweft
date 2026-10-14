import React from 'react';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireOnboardedUser } from '@/server/dal';
import { createClient } from '@/lib/supabase/server';
import { validateAndFormatPhone } from '@/features/agreements/utils/phone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShieldCheck,
  Phone,
  MessageSquare,
  ArrowLeft,
  Lock,
} from 'lucide-react';

export default async function ContactSettingsPage() {
  const { user } = await requireOnboardedUser();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from('profile_contacts')
    .select('phone_e164, whatsapp, updated_at')
    .eq('user_id', user.id)
    .single();

  async function updateContactAction(formData: FormData) {
    'use server';
    const client = await createClient();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();

    if (!authUser) return;

    const phoneRaw = (formData.get('phone') as string) || '';
    const whatsapp = formData.get('whatsapp') === 'true';

    if (phoneRaw.trim()) {
      const phoneValidation = validateAndFormatPhone(phoneRaw);
      if (!phoneValidation.isValid || !phoneValidation.e164) {
        return;
      }

      await client.from('profile_contacts').upsert({
        user_id: authUser.id,
        phone_e164: phoneValidation.e164,
        whatsapp,
        updated_at: new Date().toISOString(),
      });
    }

    revalidatePath('/dashboard/settings/contact');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12 text-start">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-pine-600 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Private Trade Contact Settings
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure the direct contact channels shared with barter partners once an agreement is accepted.
        </p>
      </div>

      {/* Privacy Guarantee Box */}
      <div className="rounded-card border border-pine-200 bg-pine-50/40 p-4 space-y-2 text-xs text-pine-900 dark:text-pine-200">
        <div className="flex items-center gap-2 font-semibold">
          <Lock className="h-4 w-4 text-pine-700" />
          <span>Zero-Leak Privacy Guarantee</span>
        </div>
        <p className="leading-relaxed text-pine-800 dark:text-pine-300">
          Your phone number and WhatsApp contact are never displayed publicly on search results, category listings, or package pages.
          They are revealed exclusively to verified barter partners with whom you have both signed an active trade agreement.
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-6 shadow-elevation-1">
        <form action={updateContactAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="contact-phone" className="text-sm font-semibold text-ink flex items-center gap-2">
              <Phone className="h-4 w-4 text-pine-600" />
              Direct Phone Number
            </Label>
            <Input
              id="contact-phone"
              name="phone"
              type="tel"
              defaultValue={contact?.phone_e164 || ''}
              placeholder="e.g. 0712 345 678 or +254 712 345 678"
              required
            />
            <p className="text-xs text-text-muted">
              Used for SMS and telephone communications once a barter contract is signed.
            </p>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <Label className="text-sm font-semibold text-ink flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-pine-600" />
              WhatsApp Direct Messaging
            </Label>
            <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                name="whatsapp"
                value="true"
                defaultChecked={contact?.whatsapp ?? true}
                className="rounded border-input-border text-pine-600 focus:ring-pine-500 h-4 w-4"
              />
              <span>Enable 1-click WhatsApp messaging for accepted trade partners</span>
            </label>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end">
            <Button type="submit" className="bg-pine-600 hover:bg-pine-700 text-white text-xs">
              Save Contact Preferences
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
