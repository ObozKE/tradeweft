'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import {
  tradeProposeLimiter,
  tradeActionLimiter,
} from '@/lib/rate-limit';
import {
  proposeTradeSchema,
  counterTradeSchema,
  acceptTradeSchema,
  disputeSchema,
  cancellationRequestSchema,
  profileContactSchema,
} from '../schemas/agreement.schema';
import { validateAndFormatPhone } from '../utils/phone';

export interface AgreementActionState {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  agreementId?: string;
}

/**
 * Initiates a new barter trade proposal via atomic RPC.
 */
export async function proposeTradeAction(
  prevState: AgreementActionState | null,
  formData: FormData
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Rate Limiting (10 per 5m)
  const limit = await tradeProposeLimiter.check(user.id);
  if (!limit.success) {
    logger.warn({ userId: user.id, event: 'rate_limit.hit', action: 'trade.propose' });
    return {
      error: 'You have sent too many trade proposals recently. Please wait a few moments before trying again.',
    };
  }

  // Parse raw JSON inputs
  let rawProposerLines = [];
  let rawRecipientLines = [];
  let rawChannels = ['email'];

  try {
    rawProposerLines = JSON.parse((formData.get('proposerLines') as string) || '[]');
    rawRecipientLines = JSON.parse((formData.get('recipientLines') as string) || '[]');
    const channelsInput = formData.get('consentedChannels');
    if (channelsInput) {
      rawChannels = JSON.parse(channelsInput as string);
    }
  } catch {
    return { error: 'Invalid trade line parameters provided.' };
  }

  const rawData = {
    recipientId: formData.get('recipientId') as string,
    proposerLines: rawProposerLines,
    recipientLines: rawRecipientLines,
    note: (formData.get('note') as string) || undefined,
    consentedChannels: rawChannels,
    phone: (formData.get('phone') as string) || undefined,
    whatsapp: formData.get('whatsapp') === 'true',
    idempotencyKey: (formData.get('idempotencyKey') as string) || crypto.randomUUID(),
  };

  const validation = proposeTradeSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please review and correct the errors below before submitting.',
    };
  }

  const data = validation.data;

  // If user provided a phone number, update their profile_contacts
  if (data.phone && data.phone.trim()) {
    const phoneRes = validateAndFormatPhone(data.phone);
    if (phoneRes.isValid && phoneRes.e164) {
      await supabase.from('profile_contacts').upsert({
        user_id: user.id,
        phone_e164: phoneRes.e164,
        whatsapp: data.whatsapp,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Format lines for DB RPC: supply both snake_case and camelCase for maximum compatibility
  const formattedProposerLines = data.proposerLines.map((l) => ({
    package_version_id: l.packageVersionId,
    packageVersionId: l.packageVersionId,
    quantity: l.quantity,
  }));
  const formattedRecipientLines = data.recipientLines.map((l) => ({
    package_version_id: l.packageVersionId,
    packageVersionId: l.packageVersionId,
    quantity: l.quantity,
  }));

  // Call Atomic Propose Agreement RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('propose_agreement', {
    p_recipient_id: data.recipientId,
    p_proposer_lines: formattedProposerLines,
    p_recipient_lines: formattedRecipientLines,
    p_note: data.note || null,
    p_consented_channels: data.consentedChannels,
    p_idempotency_key: data.idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, error: rpcError.message, event: 'trade.propose_failed' });

    if (rpcError.message.includes('SELF_PROPOSAL_FORBIDDEN')) {
      return { error: 'You cannot propose a trade to your own account.' };
    }
    if (rpcError.message.includes('COUNTRY_MISMATCH')) {
      return { error: 'Both participants must be in the same country to trade.' };
    }
    if (rpcError.message.includes('LIMIT_EXCEEDED')) {
      return { error: 'You have reached the maximum of 20 open proposals. Please withdraw an existing proposal or await responses.' };
    }
    if (rpcError.message.includes('idx_unique_open_negotiation_pair')) {
      return { error: 'You already have an open proposal with this provider. Please review or counter the existing trade.' };
    }
    if (rpcError.message.includes('CAPACITY_EXCEEDED')) {
      return { error: 'The requested quantity exceeds the monthly capacity for one of the packages.' };
    }
    if (rpcError.message.includes('PROVIDER_MISMATCH')) {
      return { error: 'One of the offered packages does not belong to your account.' };
    }
    if (rpcError.message.includes('VERSION_NOT_FOUND')) {
      return { error: 'One of the selected package versions is no longer available. Please refresh and try again.' };
    }
    if (rpcError.message.includes('ONBOARDING_REQUIRED')) {
      return { error: 'Please complete your onboarding profile before proposing a trade.' };
    }
    if (rpcError.message.includes('RECIPIENT_NOT_ONBOARDED')) {
      return { error: 'The recipient has not yet completed their profile onboarding.' };
    }
    return { error: 'Failed to send trade proposal. Please check your selections and try again.' };
  }

  const result = rpcData as any;
  logger.info({ userId: user.id, agreementId: result.agreement_id, event: 'trade.proposed' });

  revalidatePath('/dashboard/trades');
  return { success: true, agreementId: result.agreement_id };
}

/**
 * Sends a counter-offer creating a new immutable revision.
 */
export async function counterTradeAction(
  prevState: AgreementActionState | null,
  formData: FormData
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await tradeActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  let rawProposerLines = [];
  let rawRecipientLines = [];
  try {
    rawProposerLines = JSON.parse((formData.get('proposerLines') as string) || '[]');
    rawRecipientLines = JSON.parse((formData.get('recipientLines') as string) || '[]');
  } catch {
    return { error: 'Invalid trade line parameters provided.' };
  }

  const rawData = {
    agreementId: formData.get('agreementId') as string,
    expectedRevisionNo: Number(formData.get('expectedRevisionNo')),
    proposerLines: rawProposerLines,
    recipientLines: rawRecipientLines,
    note: (formData.get('note') as string) || undefined,
    idempotencyKey: (formData.get('idempotencyKey') as string) || crypto.randomUUID(),
  };

  const validation = counterTradeSchema.safeParse(rawData);
  if (!validation.success) {
    return {
      fieldErrors: validation.error.flatten().fieldErrors,
      error: 'Please review and correct your counter-offer terms.',
    };
  }

  const data = validation.data;

  const formattedProposerLines = data.proposerLines.map((l) => ({
    package_version_id: l.packageVersionId,
    packageVersionId: l.packageVersionId,
    quantity: l.quantity,
  }));
  const formattedRecipientLines = data.recipientLines.map((l) => ({
    package_version_id: l.packageVersionId,
    packageVersionId: l.packageVersionId,
    quantity: l.quantity,
  }));

  const { data: rpcData, error: rpcError } = await supabase.rpc('counter_agreement', {
    p_agreement_id: data.agreementId,
    p_expected_revision_no: data.expectedRevisionNo,
    p_proposer_lines: formattedProposerLines,
    p_recipient_lines: formattedRecipientLines,
    p_note: data.note || null,
    p_idempotency_key: data.idempotencyKey,
  });

  if (rpcError) {
    logger.error({ userId: user.id, agreementId: data.agreementId, error: rpcError.message, event: 'trade.counter_failed' });
    if (rpcError.message.includes('STALE_REVISION')) {
      return { error: 'The trade terms were updated by your partner. Please reload to review the latest terms before countering.' };
    }
    if (rpcError.message.includes('NOT_YOUR_TURN')) {
      return { error: 'It is not your turn to counter this proposal.' };
    }
    if (rpcError.message.includes('EXPIRED')) {
      return { error: 'This proposal has expired.' };
    }
    if (rpcError.message.includes('CAPACITY_EXCEEDED')) {
      return { error: 'The requested quantity exceeds the monthly capacity for one of the packages.' };
    }
    if (rpcError.message.includes('PROVIDER_MISMATCH')) {
      return { error: 'One of the counter-offer packages does not belong to the giving party.' };
    }
    if (rpcError.message.includes('VERSION_NOT_FOUND')) {
      return { error: 'One of the selected package versions is no longer available. Please refresh and try again.' };
    }
    return { error: 'Failed to send counter-offer. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${data.agreementId}`);
  return { success: true, agreementId: data.agreementId };
}

/**
 * Accepts trade terms, transitions agreement to active, and seals the tamper-evident terms_hash.
 */
export async function acceptTradeAction(
  agreementId: string,
  expectedRevisionNo: number,
  consentedChannels: string[],
  phone?: string,
  whatsapp: boolean = true
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const limit = await tradeActionLimiter.check(user.id);
  if (!limit.success) {
    return { error: 'Too many requests. Please wait a moment.' };
  }

  const validation = acceptTradeSchema.safeParse({
    agreementId,
    expectedRevisionNo,
    consentedChannels,
    phone,
    whatsapp,
  });

  if (!validation.success) {
    return { error: 'Please choose at least one contact channel to share upon contract acceptance.' };
  }

  // Update profile phone if provided
  if (phone && phone.trim()) {
    const phoneRes = validateAndFormatPhone(phone);
    if (phoneRes.isValid && phoneRes.e164) {
      await supabase.from('profile_contacts').upsert({
        user_id: user.id,
        phone_e164: phoneRes.e164,
        whatsapp,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const { error: rpcError } = await supabase.rpc('accept_agreement', {
    p_agreement_id: agreementId,
    p_expected_revision_no: expectedRevisionNo,
    p_consented_channels: consentedChannels,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (rpcError) {
    logger.error({ userId: user.id, agreementId, error: rpcError.message, event: 'trade.accept_failed' });
    if (rpcError.message.includes('STALE_REVISION')) {
      return { error: 'The terms changed since you loaded this page. Please refresh to view the latest terms before accepting.' };
    }
    if (rpcError.message.includes('NOT_YOUR_TURN')) {
      return { error: 'It is not your turn to accept this proposal.' };
    }
    if (rpcError.message.includes('EXPIRED')) {
      return { error: 'This proposal has expired.' };
    }
    return { error: 'Failed to accept trade agreement. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Declines an open trade proposal.
 */
export async function declineTradeAction(
  agreementId: string,
  expectedRevisionNo: number
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('decline_agreement', {
    p_agreement_id: agreementId,
    p_expected_revision_no: expectedRevisionNo,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to decline proposal. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Withdraws a proposed trade (by the waiting party).
 */
export async function withdrawTradeAction(
  agreementId: string,
  expectedRevisionNo: number
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('withdraw_agreement', {
    p_agreement_id: agreementId,
    p_expected_revision_no: expectedRevisionNo,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to withdraw proposal. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Marks deliverables for a specific side as delivered.
 */
export async function markDeliveredAction(
  agreementId: string,
  side: 'proposer_gives' | 'recipient_gives'
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('mark_delivered', {
    p_agreement_id: agreementId,
    p_side: side,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to mark delivery complete. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Confirms receipt of deliverables for a specific side.
 */
export async function confirmReceiptAction(
  agreementId: string,
  side: 'proposer_gives' | 'recipient_gives'
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('confirm_receipt', {
    p_agreement_id: agreementId,
    p_side: side,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to confirm receipt. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Requests mutual cancellation.
 */
export async function requestCancellationAction(
  agreementId: string,
  reason: string
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const validation = cancellationRequestSchema.safeParse({ agreementId, reason });
  if (!validation.success) {
    return { error: 'Please enter a valid cancellation reason (3 to 500 characters).' };
  }

  const { error } = await supabase.rpc('request_cancellation', {
    p_agreement_id: agreementId,
    p_reason: validation.data.reason,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to request cancellation. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Accepts mutual cancellation.
 */
export async function acceptCancellationAction(agreementId: string): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase.rpc('accept_cancellation', {
    p_agreement_id: agreementId,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to accept cancellation. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Opens a formal dispute.
 */
export async function openDisputeAction(
  agreementId: string,
  reason: string
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const validation = disputeSchema.safeParse({ agreementId, reason });
  if (!validation.success) {
    return { error: 'Please enter a detailed dispute explanation (5 to 1000 characters).' };
  }

  const { error } = await supabase.rpc('open_dispute', {
    p_agreement_id: agreementId,
    p_reason: validation.data.reason,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) {
    return { error: 'Failed to open dispute. Please try again.' };
  }

  revalidatePath('/dashboard/trades');
  revalidatePath(`/dashboard/trades/${agreementId}`);
  return { success: true, agreementId };
}

/**
 * Updates profile contact phone and WhatsApp settings.
 */
export async function updateProfileContactAction(
  prevState: AgreementActionState | null,
  formData: FormData
): Promise<AgreementActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const phone = formData.get('phone') as string;
  const whatsapp = formData.get('whatsapp') === 'true';

  const validation = profileContactSchema.safeParse({ phone, whatsapp });
  if (!validation.success) {
    return { error: 'Please enter a valid phone number (e.g. 0712 345 678).' };
  }

  const phoneRes = validateAndFormatPhone(validation.data.phone);
  if (!phoneRes.isValid || !phoneRes.e164) {
    return { error: 'Invalid phone format.' };
  }

  const { error } = await supabase.from('profile_contacts').upsert({
    user_id: user.id,
    phone_e164: phoneRes.e164,
    whatsapp: validation.data.whatsapp,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: 'Failed to save contact settings. Please try again.' };
  }

  revalidatePath('/dashboard/settings/contact');
  return { success: true };
}

/**
 * Marks notifications as read.
 */
export async function markNotificationsReadAction(notificationIds: string[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !notificationIds || notificationIds.length === 0) return;

  await supabase.rpc('mark_notifications_read', {
    p_notification_ids: notificationIds,
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/notifications');
}
