// Seeder script that creates one AFT request per dashboard-relevant
// lifecycle state. Pairs with `seed-users.ts` (each request is wired up to
// the matching role-user emails: requestor@aft.gov, approver@aft.gov, etc).
//
// Idempotent: every seeded row uses a stable request_number prefixed with
// SEED- and is upserted on (request_number).
//
// Run inside the container:
//   podman exec aft env DATABASE_URL="<url>" bun run --cwd /app seed:requests
// Or locally if DATABASE_URL points at the container's published port.

import { AFTStatus, type AFTStatusType, sql, waitForReady } from '../lib/database-bun';

interface SeedRequest {
  request_number: string;
  status: AFTStatusType;
  transfer_type: 'low-to-high' | 'high-to-low';
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET';
  data_description: string;
  transfer_purpose: string;
  source_system: string;
  dest_system: string;
  data_size: string;
  notes?: string;
}

const SEEDS: SeedRequest[] = [
  {
    request_number: 'SEED-AFT-0001',
    status: AFTStatus.DRAFT,
    transfer_type: 'low-to-high',
    classification: 'UNCLASSIFIED',
    data_description: 'Project requirements document and CAD drawings',
    transfer_purpose: 'Engineering review on classified network',
    source_system: 'NIPRNet workstation',
    dest_system: 'SIPRNet engineering enclave',
    data_size: '12 MB',
    notes: 'In-progress draft saved by requestor',
  },
  {
    request_number: 'SEED-AFT-0002',
    status: AFTStatus.DRAFT,
    transfer_type: 'low-to-high',
    classification: 'UNCLASSIFIED',
    data_description: 'Vendor proposal package',
    transfer_purpose: 'Acquisition review',
    source_system: 'Contractor laptop',
    dest_system: 'Government program enclave',
    data_size: '4 MB',
  },
  {
    request_number: 'SEED-AFT-0003',
    status: AFTStatus.SUBMITTED,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Test plan and results dataset',
    transfer_purpose: 'Validation by program office',
    source_system: 'NIPRNet developer station',
    dest_system: 'Air-gapped test range',
    data_size: '85 MB',
  },
  {
    request_number: 'SEED-AFT-0004',
    status: AFTStatus.PENDING_APPROVER,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Updated firmware images',
    transfer_purpose: 'Field-deployable update',
    source_system: 'Build server',
    dest_system: 'Forward-deployed system',
    data_size: '210 MB',
  },
  {
    // High-to-low — exercises the DAO attestation block
    request_number: 'SEED-AFT-0005',
    status: AFTStatus.PENDING_APPROVER,
    transfer_type: 'high-to-low',
    classification: 'SECRET',
    data_description: 'Sanitized lessons-learned briefing (redacted)',
    transfer_purpose: 'Distribution to coalition partners',
    source_system: 'SIPRNet briefing host',
    dest_system: 'NIPRNet sharing portal',
    data_size: '6 MB',
    notes: 'High-to-low transfer with DAO out-of-band attestation populated',
  },
  {
    request_number: 'SEED-AFT-0006',
    status: AFTStatus.PENDING_CPSO,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Mission planning data',
    transfer_purpose: 'Operational hand-off',
    source_system: 'Planning workstation',
    dest_system: 'Mission system',
    data_size: '50 MB',
  },
  {
    request_number: 'SEED-AFT-0007',
    status: AFTStatus.APPROVED,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Approved patch bundle',
    transfer_purpose: 'Scheduled maintenance window',
    source_system: 'IT staging',
    dest_system: 'Production enclave',
    data_size: '180 MB',
  },
  {
    request_number: 'SEED-AFT-0008',
    status: AFTStatus.PENDING_DTA,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Configuration backups',
    transfer_purpose: 'Disaster recovery seed',
    source_system: 'Config management server',
    dest_system: 'DR enclave',
    data_size: '320 MB',
  },
  {
    request_number: 'SEED-AFT-0009',
    status: AFTStatus.ACTIVE_TRANSFER,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Imagery archive',
    transfer_purpose: 'Quarterly archive sync',
    source_system: 'Ingest server',
    dest_system: 'Long-term archive',
    data_size: '1.4 GB',
    notes: 'DTA actively performing media transfer',
  },
  {
    request_number: 'SEED-AFT-0010',
    status: AFTStatus.PENDING_SME,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Mission data package awaiting SME validation',
    transfer_purpose: 'Mission planning',
    source_system: 'Planning workstation',
    dest_system: 'Mission system',
    data_size: '40 MB',
  },
  {
    request_number: 'SEED-AFT-0011',
    status: AFTStatus.PENDING_MEDIA_CUSTODIAN,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Completed transfer pending media disposition',
    transfer_purpose: 'Closeout',
    source_system: 'Source enclave',
    dest_system: 'Destination enclave',
    data_size: '60 MB',
    notes: 'Awaiting custodian disposition + signature',
  },
  {
    request_number: 'SEED-AFT-0012',
    status: AFTStatus.COMPLETED,
    transfer_type: 'low-to-high',
    classification: 'UNCLASSIFIED',
    data_description: 'Closed-out historical transfer',
    transfer_purpose: 'Reference / archive',
    source_system: 'Historical archive',
    dest_system: 'Records repository',
    data_size: '15 MB',
  },
  {
    request_number: 'SEED-AFT-0013',
    status: AFTStatus.REJECTED,
    transfer_type: 'low-to-high',
    classification: 'CONFIDENTIAL',
    data_description: 'Request that failed approval review',
    transfer_purpose: 'Rejected — incomplete documentation',
    source_system: 'Source workstation',
    dest_system: 'Destination workstation',
    data_size: '8 MB',
    notes: 'Rejected by approver — insufficient justification',
  },
];

interface RoleUserRow {
  id: number;
  email: string;
}

async function loadRoleUsers(): Promise<Map<string, RoleUserRow>> {
  const rows = (await sql`
    SELECT id, email, primary_role FROM users WHERE email LIKE '%@aft.gov'
  `) as Array<{ id: number; email: string; primary_role: string }>;
  const map = new Map<string, RoleUserRow>();
  for (const r of rows) map.set(r.primary_role, { id: Number(r.id), email: r.email });
  return map;
}

async function main(): Promise<void> {
  await waitForReady();

  const roleUsers = await loadRoleUsers();
  const requestor = roleUsers.get('requestor');
  if (!requestor) {
    console.error(
      'Requestor user not found. Run `bun run seed:users` first to create the per-role users.',
    );
    process.exit(1);
  }
  const approver = roleUsers.get('approver');
  const dta = roleUsers.get('dta');
  const sme = roleUsers.get('sme');
  const custodian = roleUsers.get('media_custodian');

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  let created = 0;
  let updated = 0;

  for (const r of SEEDS) {
    const isHighToLow = r.transfer_type === 'high-to-low';
    const submittedAt =
      r.status === AFTStatus.DRAFT ? null : now - oneDay * (created + updated + 1);
    const approvalDate =
      r.status === AFTStatus.APPROVED ||
      r.status === AFTStatus.PENDING_DTA ||
      r.status === AFTStatus.ACTIVE_TRANSFER ||
      r.status === AFTStatus.PENDING_SME ||
      r.status === AFTStatus.PENDING_MEDIA_CUSTODIAN ||
      r.status === AFTStatus.COMPLETED
        ? now - oneDay
        : null;

    const existing = (await sql`
      SELECT id FROM aft_requests WHERE request_number = ${r.request_number}
    `) as Array<{ id: number }>;

    const params = {
      request_number: r.request_number,
      requestor_id: requestor.id,
      approver_id: approver?.id ?? null,
      dta_id: dta?.id ?? null,
      sme_id: sme?.id ?? null,
      assigned_sme_id: r.status === AFTStatus.PENDING_SME ? (sme?.id ?? null) : null,
      media_custodian_id: r.status === AFTStatus.PENDING_MEDIA_CUSTODIAN
        ? (custodian?.id ?? null)
        : null,
      status: r.status,
      submitted_at: submittedAt,
      requestor_name: 'Renee Requestor',
      requestor_org: 'AFT Org',
      requestor_phone: '555-0101',
      requestor_email: requestor.email,
      transfer_purpose: r.transfer_purpose,
      transfer_type: r.transfer_type,
      classification: r.classification,
      data_description: r.data_description,
      source_system: r.source_system,
      source_location: 'Bldg A, Rm 100',
      dest_system: r.dest_system,
      dest_location: 'Bldg B, Rm 200',
      data_format: 'Mixed',
      data_size: r.data_size,
      transfer_method: 'Optical media',
      encryption: 'AES-256',
      requested_start_date: now,
      requested_end_date: now + oneDay * 7,
      urgency_level: 'Routine',
      approval_date: approvalDate,
      approval_notes: approvalDate ? 'Reviewed and approved.' : null,
      rejection_reason:
        r.status === AFTStatus.REJECTED ? 'Insufficient justification provided.' : null,
      dao_approved: isHighToLow,
      dao_approver_name: isHighToLow ? 'Col. D. A. Officer (NIPR)' : null,
      dao_approval_date: isHighToLow ? now - oneDay * 2 : null,
    };

    if (existing.length === 0) {
      await sql`
        INSERT INTO aft_requests (
          request_number, requestor_id, approver_id, dta_id, sme_id, assigned_sme_id,
          media_custodian_id, status, submitted_at,
          requestor_name, requestor_org, requestor_phone, requestor_email,
          transfer_purpose, transfer_type, classification, data_description,
          source_system, source_location, dest_system, dest_location,
          data_format, data_size, transfer_method, encryption,
          requested_start_date, requested_end_date, urgency_level,
          approval_date, approval_notes, rejection_reason,
          dao_approved, dao_approver_name, dao_approval_date
        ) VALUES (
          ${params.request_number}, ${params.requestor_id}, ${params.approver_id}, ${params.dta_id}, ${params.sme_id}, ${params.assigned_sme_id},
          ${params.media_custodian_id}, ${params.status}, ${params.submitted_at},
          ${params.requestor_name}, ${params.requestor_org}, ${params.requestor_phone}, ${params.requestor_email},
          ${params.transfer_purpose}, ${params.transfer_type}, ${params.classification}, ${params.data_description},
          ${params.source_system}, ${params.source_location}, ${params.dest_system}, ${params.dest_location},
          ${params.data_format}, ${params.data_size}, ${params.transfer_method}, ${params.encryption},
          ${params.requested_start_date}, ${params.requested_end_date}, ${params.urgency_level},
          ${params.approval_date}, ${params.approval_notes}, ${params.rejection_reason},
          ${params.dao_approved}, ${params.dao_approver_name}, ${params.dao_approval_date}
        )
      `;
      created++;
    } else {
      await sql`
        UPDATE aft_requests SET
          requestor_id = ${params.requestor_id},
          approver_id = ${params.approver_id},
          dta_id = ${params.dta_id},
          sme_id = ${params.sme_id},
          assigned_sme_id = ${params.assigned_sme_id},
          media_custodian_id = ${params.media_custodian_id},
          status = ${params.status},
          submitted_at = ${params.submitted_at},
          transfer_purpose = ${params.transfer_purpose},
          transfer_type = ${params.transfer_type},
          classification = ${params.classification},
          data_description = ${params.data_description},
          source_system = ${params.source_system},
          dest_system = ${params.dest_system},
          data_size = ${params.data_size},
          approval_date = ${params.approval_date},
          approval_notes = ${params.approval_notes},
          rejection_reason = ${params.rejection_reason},
          dao_approved = ${params.dao_approved},
          dao_approver_name = ${params.dao_approver_name},
          dao_approval_date = ${params.dao_approval_date},
          updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE request_number = ${params.request_number}
      `;
      updated++;
    }

    if (r.notes) {
      await sql`
        INSERT INTO aft_request_history (request_id, action, user_email, notes, new_value, created_at)
        SELECT id, 'SEED_NOTE', ${requestor.email}, ${r.notes}, ${r.status}, ${now}
        FROM aft_requests WHERE request_number = ${r.request_number}
        ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log('Request seeding complete');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Total seeded: ${SEEDS.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
