'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Upload,
  Globe,
  Plus,
} from 'lucide-react';
import { PLATFORM_REGISTRY, getAllPlatforms } from '../providers/registry';
import {
  addPortfolioLinkAction,
  submitManualEvidenceAction,
  deletePortfolioLinkAction,
  verifyDomainAction,
} from '../actions/link.actions';
import { createUploadIntentAction } from '@/features/media/actions/upload.actions';
import type { PlatformKey, VerificationStatus } from '../types/verification.types';

export interface VerificationManagerProps {
  initialLinks: Array<{
    id: string;
    provider_key: string;
    url: string;
    canonical_url: string;
    handle: string | null;
    method: string;
    status: VerificationStatus;
    challenge_code: string | null;
    reject_reason: string | null;
    reject_note: string | null;
    verified_at: string | null;
    created_at: string;
  }>;
  aggregateStatus: 'none' | 'pending' | 'verified';
  verifiedCount: number;
  countryGateMode: string;
}

export function VerificationManager({
  initialLinks,
  aggregateStatus,
  verifiedCount,
  countryGateMode,
}: VerificationManagerProps) {
  const [links, setLinks] = useState(initialLinks);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('github');
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [uploadingForLinkId, setUploadingForLinkId] = useState<string | null>(null);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);

  const platforms = getAllPlatforms();
  const currentPlatformConfig = PLATFORM_REGISTRY[selectedPlatform];

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.set('providerKey', selectedPlatform);
      formData.set('url', urlInput);

      const res = await addPortfolioLinkAction(null, formData);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setUrlInput('');
        setSuccessMessage('Portfolio link added successfully!');
        window.location.reload();
      }
    } catch {
      setErrorMessage('Failed to add portfolio link. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to remove this portfolio link?')) return;
    try {
      const res = await deletePortfolioLinkAction(linkId);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch {
      setErrorMessage('Failed to delete portfolio link.');
    }
  };

  const handleVerifyDomain = async (linkId: string) => {
    setVerifyingDomainId(linkId);
    setErrorMessage(null);
    try {
      const res = await verifyDomainAction(linkId);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Domain verified successfully!');
        window.location.reload();
      }
    } catch {
      setErrorMessage('Domain verification request failed.');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handleEvidenceUpload = async (linkId: string, file: File) => {
    setUploadingForLinkId(linkId);
    setErrorMessage(null);

    try {
      // Stage 1: Get signed upload intent
      const intentRes = await createUploadIntentAction({
        kind: 'evidence',
        mime: file.type,
        bytes: file.size,
      });

      if (!intentRes.success || !intentRes.signedUploadUrl || !intentRes.assetId) {
        throw new Error(intentRes.error || 'Failed to initialize upload intent');
      }

      // Stage 2: Upload file directly to quarantine bucket
      const uploadRes = await fetch(intentRes.signedUploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload screenshot to quarantine');
      }

      // Stage 3: Finalize and process with Sharp
      const finalizeRes = await fetch('/api/media/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: intentRes.assetId }),
      });

      if (!finalizeRes.ok) {
        const finalizeJson = await finalizeRes.json();
        throw new Error(finalizeJson.error || 'Screenshot processing failed');
      }

      // Stage 4: Submit evidence to portfolio link
      const formData = new FormData();
      formData.set('linkId', linkId);
      formData.set('evidenceAssetId', intentRes.assetId);

      const submitRes = await submitManualEvidenceAction(null, formData);
      if (submitRes.error) {
        throw new Error(submitRes.error);
      }

      setSuccessMessage('Screenshot submitted! Human verifiers will review it within 48 hours.');
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setErrorMessage(msg);
    } finally {
      setUploadingForLinkId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Verification Status Header */}
      <Card className="border-pine-200 bg-pine-50/30">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pine-100 text-pine-800">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-ink">Portfolio Verification</h2>
                  {aggregateStatus === 'verified' ? (
                    <Badge variant="verified" className="gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-pine-700" />
                      Verified ({verifiedCount} links)
                    </Badge>
                  ) : aggregateStatus === 'pending' ? (
                    <Badge variant="warning" className="gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Under Review
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-sand-300 text-text-muted">
                      Unverified
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Prove ownership of your external design, developer, or business profiles to earn the
                  &ldquo;Portfolio verified&rdquo; badge.
                </p>
              </div>
            </div>

            <div className="text-xs text-text-secondary sm:text-end">
              <span className="font-semibold text-ink block">Listing Publish Gate:</span>
              <span className="text-pine-800 font-medium">
                {countryGateMode === 'verified'
                  ? 'Requires fully verified portfolio'
                  : 'Requires at least 1 link submitted'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Messages */}
      {errorMessage && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg bg-pine-50 border border-pine-200 p-4 text-xs text-pine-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-pine-700 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Add New Link Card */}
      <Card className="border-sand-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
            <Plus className="w-4 h-4 text-pine-700" />
            Add External Portfolio Link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Platform Selection */}
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">
                Select Platform
              </label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value as PlatformKey)}
                className="w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-pine-600"
              >
                {platforms.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.method === 'oauth' ? 'OAuth' : p.method === 'domain' ? 'Domain Proof' : 'Bio Code'})
                  </option>
                ))}
              </select>
            </div>

            {/* GitHub OAuth Specific Flow */}
            {selectedPlatform === 'github' ? (
              <div className="rounded-lg border border-sand-200 bg-sand-50 p-4 space-y-3">
                <p className="text-xs text-text-secondary">
                  Connect your GitHub account via standalone OAuth. We verify account age (30-day minimum)
                  and link your profile cryptographically. No access tokens are stored.
                </p>
                <a
                  href="/api/verify/github/start"
                  className="inline-flex items-center gap-2 rounded-lg bg-pine-600 px-4 py-2 text-xs font-semibold text-white hover:bg-pine-700 transition"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Connect & Verify with GitHub
                </a>
              </div>
            ) : (
              <form onSubmit={handleAddLink} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-1">
                    Profile or Website URL
                  </label>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={currentPlatformConfig.placeholder}
                    required
                    className="w-full rounded-md border border-sand-300 bg-white px-3 py-2 text-xs text-ink placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-pine-600"
                  />
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isAdding}
                  className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Link
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing Links List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-ink">Your Portfolio Links ({links.length}/10)</h3>

        {links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-sand-300 p-8 text-center bg-white text-xs text-text-muted">
            No portfolio links added yet. Add a profile link above to start the verification process.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((link) => {
              const platform = PLATFORM_REGISTRY[link.provider_key as PlatformKey] || {
                label: link.provider_key,
              };

              return (
                <Card key={link.id} className="border-sand-200">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-pine-800">
                            {platform.label}
                          </span>

                          {link.status === 'verified' && (
                            <Badge variant="verified" className="text-[10px]">
                              Verified
                            </Badge>
                          )}
                          {link.status === 'pending_review' && (
                            <Badge variant="warning" className="text-[10px]">
                              In Review
                            </Badge>
                          )}
                          {link.status === 'awaiting_proof' && (
                            <Badge variant="outline" className="border-amber-300 text-amber-900 text-[10px]">
                              Awaiting Proof
                            </Badge>
                          )}
                          {link.status === 'submitted' && (
                            <Badge variant="outline" className="text-[10px]">
                              Code Generated
                            </Badge>
                          )}
                          {link.status === 'rejected' && (
                            <Badge variant="warning" className="bg-amber-100 text-amber-950 font-semibold text-[10px]">
                              Rejected
                            </Badge>
                          )}
                        </div>

                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-ink hover:text-pine-700 flex items-center gap-1"
                        >
                          {link.url}
                          <ExternalLink className="w-3 h-3 text-text-muted" />
                        </a>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLink(link.id)}
                          className="text-text-muted hover:text-amber-800 text-xs gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </Button>
                      </div>
                    </div>

                    {/* Method: Domain Proof Instructions */}
                    {link.method === 'domain' && link.status !== 'verified' && (
                      <div className="mt-3 rounded-md bg-sand-50 p-3 space-y-2 border border-sand-200 text-xs">
                        <span className="font-semibold text-ink block">Domain Ownership Instructions:</span>
                        <p className="text-text-secondary">
                          Place the following code on your website using either method:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-white px-2 py-1 border border-sand-300 font-mono text-[11px] text-pine-900 font-bold">
                            {link.challenge_code}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(link.challenge_code!)}
                            className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] border border-sand-300 hover:bg-sand-50 text-text-secondary"
                          >
                            {copiedCode === link.challenge_code ? (
                              <Check className="w-3 h-3 text-pine-700" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            Copy Code
                          </button>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-text-muted text-[11px]">
                          <li>
                            <strong>Method A:</strong> Add HTML tag in &lt;head&gt;: <br />
                            <code className="text-text-secondary bg-white px-1 rounded border">
                              &lt;meta name=&quot;tradeweft-verification&quot; content=&quot;{link.challenge_code}&quot;&gt;
                            </code>
                          </li>
                          <li>
                            <strong>Method B:</strong> Create a text file at: <br />
                            <code className="text-text-secondary bg-white px-1 rounded border">
                              /.well-known/tradeweft-verification.txt
                            </code>
                          </li>
                        </ul>

                        <div className="pt-1">
                          <Button
                            size="sm"
                            disabled={verifyingDomainId === link.id}
                            onClick={() => handleVerifyDomain(link.id)}
                            className="bg-pine-600 hover:bg-pine-700 text-white text-xs gap-1"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            {verifyingDomainId === link.id ? 'Checking...' : 'Verify Domain Now'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Method: Manual Review Bio Code & Evidence Upload */}
                    {link.method === 'manual' && link.status !== 'verified' && (
                      <div className="mt-3 rounded-md bg-sand-50 p-3 space-y-3 border border-sand-200 text-xs">
                        <div>
                          <span className="font-semibold text-ink block mb-1">
                            Step 1: Place Challenge Code in Bio or Public Post
                          </span>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-white px-2 py-1 border border-sand-300 font-mono text-[11px] text-pine-900 font-bold">
                              {link.challenge_code}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(link.challenge_code!)}
                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] border border-sand-300 hover:bg-sand-50 text-text-secondary"
                            >
                              {copiedCode === link.challenge_code ? (
                                <Check className="w-3 h-3 text-pine-700" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              Copy Code
                            </button>
                          </div>
                        </div>

                        {/* Rejection Note if rejected */}
                        {link.status === 'rejected' && (
                          <div className="rounded bg-amber-50 p-2.5 border border-amber-200 text-amber-950 space-y-1">
                            <span className="font-bold block">Previous Submission Rejected:</span>
                            <p className="text-[11px]">
                              Reason: {link.reject_reason || 'Unspecified'}. {link.reject_note || ''}
                            </p>
                          </div>
                        )}

                        <div>
                          <span className="font-semibold text-ink block mb-1">
                            Step 2: Upload Screenshot Evidence
                          </span>
                          <p className="text-[11px] text-text-muted mb-2">
                            Upload a JPEG or PNG screenshot showing the challenge code visible in your profile bio or post.
                          </p>
                          <label className="inline-flex items-center gap-2 rounded-md border border-sand-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-sand-50 cursor-pointer shadow-xs">
                            <Upload className="w-3.5 h-3.5 text-pine-700" />
                            {uploadingForLinkId === link.id ? 'Processing...' : 'Choose Screenshot'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={uploadingForLinkId === link.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleEvidenceUpload(link.id, file);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
