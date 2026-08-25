-- Adds the new document-signature-chain interim status to po_status.
-- Split into its own migration/transaction because a newly added enum
-- value can't be referenced by name in the same transaction that adds it.
alter type public.po_status add value if not exists 'pending_signature';
