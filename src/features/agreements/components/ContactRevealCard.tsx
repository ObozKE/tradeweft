import React from 'react';
import type { CounterpartyContact } from '../types/agreement.types';
import { Phone, MessageSquare, Mail, ShieldCheck, Lock } from 'lucide-react';

interface ContactRevealCardProps {
  contact: CounterpartyContact | null;
  counterpartyName: string;
}

export function ContactRevealCard({ contact, counterpartyName }: ContactRevealCardProps) {
  if (!contact || !contact.revealed) {
    return (
      <div className="rounded-card border border-border bg-surface-sunken/40 p-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-text-secondary">
          <Lock className="h-4 w-4 text-text-muted" />
          <span>Contact Details Protected</span>
        </div>
        <p className="text-text-muted leading-relaxed">
          Contact channels (Phone, WhatsApp, Email) are revealed automatically once both parties agree to terms and the trade becomes active.
        </p>
      </div>
    );
  }

  const cleanWhatsappNumber = contact.whatsapp ? contact.whatsapp.replace(/[^0-9]/g, '') : null;

  return (
    <div className="rounded-card border border-pine-200 bg-pine-50/30 p-5 space-y-4 shadow-2xs">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 font-bold text-pine-900 text-sm">
            <ShieldCheck className="h-4 w-4 text-pine-700" />
            <span>Counterparty Direct Contact Revealed</span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            You may now coordinate service logistics directly with {counterpartyName}.
          </p>
        </div>

        <span className="rounded-chip bg-pine-100 text-pine-800 text-[11px] font-bold px-2 py-0.5 border border-pine-200">
          Consented
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {/* Phone */}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="flex items-center gap-3 p-3 rounded-button bg-white border border-border hover:border-pine-400 hover:shadow-2xs transition group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-50 text-pine-700 group-hover:bg-pine-100">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-text-muted font-medium">Direct Phone</p>
              <p className="font-semibold text-ink">{contact.phone}</p>
            </div>
          </a>
        )}

        {/* WhatsApp */}
        {contact.whatsapp && cleanWhatsappNumber && (
          <a
            href={`https://wa.me/${cleanWhatsappNumber}?text=${encodeURIComponent('Hello from Trade Weft! Regarding our barter trade:')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-button bg-white border border-border hover:border-pine-400 hover:shadow-2xs transition group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-50 text-pine-700 group-hover:bg-pine-100">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-text-muted font-medium">WhatsApp</p>
              <p className="font-semibold text-ink">Chat on WhatsApp</p>
            </div>
          </a>
        )}

        {/* Email */}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-3 p-3 rounded-button bg-white border border-border hover:border-pine-400 hover:shadow-2xs transition group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-50 text-pine-700 group-hover:bg-pine-100">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-text-muted font-medium">Email Address</p>
              <p className="font-semibold text-ink truncate max-w-[140px]">{contact.email}</p>
            </div>
          </a>
        )}
      </div>

      <p className="text-[11px] text-text-muted italic">
        Note: Do not share sensitive payment information off-platform. Trade details and milestones are tracked securely on Trade Weft.
      </p>
    </div>
  );
}
